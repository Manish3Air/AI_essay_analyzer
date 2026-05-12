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
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "Create a concise essay title. Return only the title, no quotes, no punctuation at the end.",
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

    
    // ✅ Save To MongoDB
    
    const essayDoc = new Essay({

      title,

      raw_text: text,

      corrected_text: correctedText,

      annotations: [],

      grammar_issues: grammarIssues,

      suggestions: [],

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
