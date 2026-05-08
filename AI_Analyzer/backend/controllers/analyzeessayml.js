import Essay from "../models/essay.js";
import { extractTextFromPDF } from "../utils/pdfExtractor.js";
import axios from "axios";
import fs from "fs";
import { split } from "sentence-splitter";

import { diffWords } from "diff";


/**
 * 🧠 Analyze Essay using OUR ML MODELS (FastAPI)
 */
export const analyzeEssayML = async (req, res) => {
  try {
    let text = "";
    let title = "Untitled Essay";

    // ✅ Handle both file upload and text input
    if (req.file) {
      const pdfFile = req.file;
      title = pdfFile.originalname;
      text = await extractTextFromPDF(pdfFile.path);

      fs.unlink(pdfFile.path, (err) => {
        if (err) console.error("Temp file cleanup error:", err);
      });
    } else if (req.body.text) {
      text = req.body.text;
      title = "Text Input Essay";
    } else {
      return res.status(400).json({ error: "No essay text or file provided." });
    }

    if (!text.trim()) {
      return res.status(400).json({ error: "Essay text is empty." });
    }

    /* =========================
      ✅ 1️⃣ Sentence splitting
    ========================== */
    const sentences = split(text)
      .filter(n => n.type === "Sentence")
      .map(n => n.raw.trim())
      .filter(s => s.length > 2);

    function buildGrammarIssues(original, corrected) {
      const diffs = diffWords(original, corrected);

      return diffs
        .filter(part => part.added || part.removed)
        .map(part => ({
          type: part.added ? "addition" : "removal",
          text: part.value,
        }));
    }


    /* =========================
       ✅ 2️⃣ Grammar correction
    ========================== */
    const grammarIssues = [];
    const correctedSentences = [];

    for (const sentence of sentences) {
      const r = await axios.post(
        "http://127.0.0.1:8000/grammar",
        { text: sentence }
      );

      const corrected = r.data.corrected_text || sentence;
      correctedSentences.push(corrected);

      if (corrected !== sentence) {
        grammarIssues.push({
          sentence: sentence,
          corrected,
          issues: buildGrammarIssues(sentence, corrected),
        });
      }
    }

    // console.log(grammarIssues);

    const correctedText = correctedSentences
      .join(" ")
      .replace(/\s*\.\s*/g, ". ")
      .replace(/\s*,\s*/g, ", ")
      .replace(/\s+/g, " ")
      .trim();


    /* =========================
       ✅ 3️⃣ Tone detection
    ========================== */
    const toneRes = await axios.post(
      "http://127.0.0.1:8000/tone",
      { text: correctedText }
    );

    console.log("Tone detection result:", toneRes);

    /* =========================
       ✅ 4️⃣ Score prediction
    ========================== */
    const scoreRes = await axios.post(
      "http://127.0.0.1:8000/score",
      { text: correctedText }
    );

    /* =========================
       ✅ 5️⃣ Save to DB
    ========================== */
    const essayDoc = new Essay({
      title,
      raw_text: text,
      corrected_text: correctedText,
      annotations: [],
      grammar_issues: grammarIssues,
      suggestions: [],
      score: Number(scoreRes.data.score) || 0,
      readability: "Model-based",
      tone: toneRes.data.tone || "Neutral",
      createdAt: new Date(),
    });

    await essayDoc.save();

    console.log("✅ Essay (ML) saved successfully:", essayDoc._id);
    return res.json(essayDoc);

  } catch (err) {
    console.error("❌ Error in analyzeEssayML:", err);

    return res.status(500).json({
      error: "ML-based essay analysis failed.",
      details: err.message || "Unknown error",
    });
  }
};
