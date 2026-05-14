import Essay from "../models/essay.js";
import { extractTextFromPDF } from "../utils/pdfExtractor.js";
import axios from "axios";
import fs from "fs";
import { split } from "sentence-splitter";
import Groq from "groq-sdk";

import { diffWords } from "diff";

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

function fallbackTitle(text) {
  const firstSentence =
    text
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.?!])\s+/)[0] || "Untitled Essay";
  const words = firstSentence
    .replace(/[^\w\s'-]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7);

  return words.length ? words.join(" ") : "Untitled Essay";
}

async function generateEssayTitle(text, fallback = "Untitled Essay") {
  if (!text?.trim()) return fallback;
  if (!groq) return fallbackTitle(text);

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Create a concise essay title of max 8 words. Return only the title, no quotes, no punctuation at the end.",
        },
        {
          role: "user",
          content: text.slice(0, 2500),
        },
      ],
      temperature: 0.2,
      max_tokens: 16,
    });

    const title = completion?.choices?.[0]?.message?.content
      ?.replace(/^["']|["']$/g, "")
      ?.trim();

    return title || fallbackTitle(text);
  } catch (err) {
    console.error("Groq title generation failed:", err.message);
    return fallbackTitle(text) || fallback;
  }
}

function extractJsonObject(content) {
  if (!content) return null;
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Failed to parse JSON from Groq response");
  }
}

function fallbackWritingFeedback(grammarIssues) {
  const annotations = grammarIssues.slice(0, 12).map((issue) => ({
    type: "correction",
    original: issue.sentence || "",
    corrected: issue.corrected || "",
    note: "Local grammar model detected a sentence-level correction.",
    accepted: null,
  }));

  const suggestions = [
    grammarIssues.length
      ? `Review ${grammarIssues.length} grammar correction${
          grammarIssues.length === 1 ? "" : "s"
        } before finalizing the essay.`
      : "No grammar corrections were detected; focus on clarity, structure, and stronger examples.",
    "Read the corrected essay aloud once to catch awkward sentence flow.",
    "Check that each paragraph has one clear main idea and a direct transition.",
  ];

  return { annotations, suggestions };
}

function normalizeWritingFeedback(data, grammarIssues) {
  const fallback = fallbackWritingFeedback(grammarIssues);
  const annotations = Array.isArray(data?.annotations)
    ? data.annotations
        .map((annotation) => ({
          type: annotation?.type || "suggestion",
          original: annotation?.original || "",
          corrected: annotation?.corrected || "",
          note: annotation?.note || annotation?.reason || "",
          accepted: null,
        }))
        .filter((annotation) => annotation.note || annotation.original || annotation.corrected)
    : fallback.annotations;

  const suggestions = Array.isArray(data?.suggestions)
    ? data.suggestions
        .map((suggestion) =>
          typeof suggestion === "string"
            ? suggestion
            : suggestion?.text || suggestion?.note || ""
        )
        .filter(Boolean)
        .slice(0, 8)
    : fallback.suggestions;

  return {
    annotations: annotations.length ? annotations.slice(0, 20) : fallback.annotations,
    suggestions: suggestions.length ? suggestions : fallback.suggestions,
  };
}

async function generateWritingFeedback(rawText, correctedText, grammarIssues) {
  if (!groq) return fallbackWritingFeedback(grammarIssues);

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an essay feedback API. Return only valid JSON. Do not use markdown.",
        },
        {
          role: "user",
          content: `Use the local ML correction output below and produce concise feedback.

Return JSON:
{
  "annotations": [
    {
      "type": "correction|clarity|structure|style|suggestion",
      "original": "",
      "corrected": "",
      "note": ""
    }
  ],
  "suggestions": []
}

Rules:
- Keep annotations actionable.
- Use grammar issues as evidence.
- Suggestions should help the student improve the next draft.
- Do not invent facts.

Original essay:
${rawText.slice(0, 3500)}

Corrected essay:
${correctedText.slice(0, 3500)}

Grammar issues:
${JSON.stringify(grammarIssues.slice(0, 20))}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.35,
      max_tokens: 1200,
    });

    const content = completion?.choices?.[0]?.message?.content;
    const data = extractJsonObject(content);
    return normalizeWritingFeedback(data, grammarIssues);
  } catch (err) {
    console.error("Groq writing feedback failed:", err.message);
    return fallbackWritingFeedback(grammarIssues);
  }
}

function calculateReadability(text) {
  const words = text
    .replace(/\n+/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/[^\w'-]/g, ""))
    .filter(Boolean);
  const sentences = text
    .replace(/\n+/g, " ")
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (!words.length || !sentences.length) return 0;

  const averageSentenceLength = words.length / sentences.length;
  const longWordRatio =
    words.filter((word) => word.length >= 7).length / words.length;
  const score = 100 - averageSentenceLength * 1.8 - longWordRatio * 45;

  return Math.max(0, Math.min(100, Math.round(score)));
}


/**
 * 🧠 Analyze Essay using OUR ML MODELS (FastAPI)
 */
export const analyzeEssayML = async (req, res) => {
  try {

    const ML_API =
      process.env.FAST_API_URL || "http://127.0.0.1:8000";

    let text = "";
    let title = "Untitled Essay";


    if (req.file) {

      const pdfFile = req.file;

      title = pdfFile.originalname;

      text = await extractTextFromPDF(pdfFile.path);

      fs.unlink(pdfFile.path, (err) => {
        if (err) {
          console.error("Temp file cleanup error:", err);
        }
      });

    } else if (req.body.text) {

      text = req.body.text;

      title = req.body.title || "Text Input Essay";

    } else {

      return res.status(400).json({
        error: "No essay text or file provided.",
      });
    }


    if (!text.trim()) {

      return res.status(400).json({
        error: "Essay text is empty.",
      });
    }

    title = await generateEssayTitle(text, title);

    const sentences = split(text)
      .filter((n) => n.type === "Sentence")
      .map((n) => n.raw.trim())
      .filter((s) => s.length > 2);


    // Grammar Diff Builder

    function buildGrammarIssues(original, corrected) {

      const diffs = diffWords(original, corrected);

      return diffs
        .filter((part) => part.added || part.removed)
        .map((part) => ({
          type: part.added ? "addition" : "removal",
          text: part.value,
        }));
    }


    // Grammar Correction

    const grammarIssues = [];

    const correctedSentences = [];

    for (const sentence of sentences) {

      const r = await axios.post(
        `${ML_API}/grammar`,
        { text: sentence },
        {
          timeout: 180000,
        }
      );

      const corrected =
        r.data.corrected_text || sentence;

      correctedSentences.push(corrected);

      if (corrected !== sentence) {

        grammarIssues.push({
          sentence,
          corrected,
          issues: buildGrammarIssues(
            sentence,
            corrected
          ),
        });
      }
    }

    
    // ✅ Final Corrected Essay
    
    const correctedText = correctedSentences
      .join(" ")
      .replace(/\s*\.\s*/g, ". ")
      .replace(/\s*,\s*/g, ", ")
      .replace(/\s+/g, " ")
      .trim();

    
    // ✅ Tone Detection
    
    const toneRes = await axios.post(
      `${ML_API}/tone`,
      {
        text: correctedText,
      },
      {
        timeout: 180000,
      }
    );

    
    // ✅ Score Prediction
    
    const scoreRes = await axios.post(
      `${ML_API}/score`,
      {
        text: correctedText,
      },
      {
        timeout: 180000,
      }
    );

    const writingFeedback = await generateWritingFeedback(
      text,
      correctedText,
      grammarIssues
    );

    
    // ✅ Save To MongoDB
    
    const essayDoc = new Essay({

      title,

      raw_text: text,

      corrected_text: correctedText,

      annotations: writingFeedback.annotations,

      grammar_issues: grammarIssues,

      suggestions: writingFeedback.suggestions,

      score: Number(scoreRes.data.score) || 0,

      readability: String(
        calculateReadability(correctedText)
      ),

      tone: toneRes.data.tone || "Neutral",

      createdAt: new Date(),
    });

    await essayDoc.save();

    console.log(
      "✅ Essay (ML) saved successfully:",
      essayDoc._id
    );

    return res.json(essayDoc);

  } catch (err) {

    console.error(
      "❌ Error in analyzeEssayML:",
      err
    );

    return res.status(500).json({
      error: "ML-based essay analysis failed.",
      details: err.message || "Unknown error",
    });
  }
};
