import dotenv from "dotenv";
dotenv.config();
import Essay from "../models/essay.js";
import { extractTextFromPDF } from "../utils/pdfExtractor.js";
import OpenAI from "openai";
import fs from "fs";

// ✅ Initialize OpenAI Client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * 🧠 Analyze Essay
 * Works for both PDF uploads and direct text input
 */
export const analyzeEssay = async (req, res) => {
  try {
    let text = "";
    let title = "Untitled Essay";

    // ✅ Handle both file upload and text input
    if (req.file) {
      const pdfFile = req.file;
      title = pdfFile.originalname;
      text = await extractTextFromPDF(pdfFile.path);

      // Clean up uploaded temp file
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

    // ✅ Prompt for structured analysis
    const prompt = `Analyze this essay for grammar, structure, and readability.
    Provide corrections, suggestions, a score (out of 10), and tone.
    Return structured JSON with the following keys:
    corrected_text, annotations[], grammar_issues[], suggestions[], score, readability, tone.
    Essay:\n\n${text}`;

    // ✅ OpenAI API request
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    // ✅ Validate and parse response
    const content = completion?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Invalid OpenAI response content");

    let data;
    try {
      data = JSON.parse(content);
    } catch (parseErr) {
      console.error("❌ JSON Parse Error:", content);
      throw new Error("Failed to parse JSON from OpenAI response");
    }

    // ✅ Normalize annotations (convert strings → objects)
    const annotations = Array.isArray(data.annotations)
      ? data.annotations.map((a) =>
          typeof a === "string"
            ? { type: "note", original: "", corrected: "", note: a, accepted: null }
            : {
                type: a.type || "note",
                original: a.original || "",
                corrected: a.corrected || "",
                note: a.note || "",
                accepted: a.accepted ?? null,
              }
        )
      : [];

    // ✅ Create and save essay document
    const essayDoc = new Essay({
      title,
      raw_text: text,
      corrected_text: data.corrected_text || "",
      annotations,
      grammar_issues: data.grammar_issues || [],
      suggestions: data.suggestions || [],
      score: Number(data.score) || 0,
      readability: data.readability || "Unknown",
      tone: data.tone || "Neutral",
      createdAt: new Date(),
    });

    await essayDoc.save();

    console.log("✅ Essay saved successfully:", essayDoc._id);
    return res.json(essayDoc);
  } catch (err) {
    console.error("❌ Error in analyzeEssay:", err);
    return res.status(500).json({
      error: "Essay analysis failed.",
      details: err.message || "Unknown error",
    });
  }
};

/**
 * ✅ Save Accept/Reject Feedback
 */
export const saveAnnotationFeedback = async (req, res) => {
  try {
    const { essayId, annotationIndex, accepted } = req.body;

    if (!essayId || annotationIndex === undefined) {
      return res.status(400).json({ error: "Invalid feedback parameters." });
    }

    const essay = await Essay.findById(essayId);
    if (!essay) return res.status(404).json({ error: "Essay not found." });

    if (essay.annotations && essay.annotations[annotationIndex]) {
      essay.annotations[annotationIndex].accepted = accepted;
      await essay.save();
      return res.json({
        success: true,
        updated: essay.annotations[annotationIndex],
      });
    } else {
      return res.status(400).json({ error: "Invalid annotation index." });
    }
  } catch (err) {
    console.error("❌ Feedback save error:", err);
    return res.status(500).json({ error: "Feedback save failed." });
  }
};

/**
 * ✅ Fetch Essay History (Recent 10)
 */
export const getEssayHistory = async (req, res) => {
  try {
    const essays = await Essay.find({}, "title score createdAt")
      .sort({ createdAt: -1 })
      .limit(10);
    return res.json(essays);
  } catch (err) {
    console.error("❌ History fetch error:", err);
    return res.status(500).json({
      error: "Failed to fetch history.",
      details: err.message,
    });
  }
};





















































































































// import Essay from "../models/essay.js";
// import { extractTextFromPDF } from "../utils/pdfExtractor.js";
// import Groq from "groq-sdk";
// import fs from "fs";
// import dotenv from "dotenv";

// dotenv.config();

// const groq = new Groq({
//   apiKey: process.env.GROQ_API_KEY,
// });

// /**
//  * 🧠 Analyze Essay
//  * Works for both PDF uploads and direct text input
//  */
// export const analyzeEssay = async (req, res) => {
//   try {
//     let text = "";
//     let title = "Untitled Essay";

//     // ✅ Handle both file upload and text input
//     if (req.file) {
//       const pdfFile = req.file;
//       title = pdfFile.originalname;

//       text = await extractTextFromPDF(pdfFile.path);

//       // Cleanup uploaded temp file
//       fs.unlink(pdfFile.path, (err) => {
//         if (err) console.error("Temp file cleanup error:", err);
//       });

//     } else if (req.body.text) {
//       text = req.body.text;
//       title = "Text Input Essay";

//     } else {
//       return res.status(400).json({
//         error: "No essay text or file provided.",
//       });
//     }

//     if (!text.trim()) {
//       return res.status(400).json({
//         error: "Essay text is empty.",
//       });
//     }

//     // ✅ Prompt
//     const prompt = `
// Analyze this essay for grammar, readability, tone, and structure.

// Return ONLY valid JSON.

// Structure:
// {
//   "corrected_text": "",
//   "annotations": [],
//   "grammar_issues": [],
//   "suggestions": [],
//   "score": 0,
//   "readability": "",
//   "tone": ""
// }

// Essay:
// ${text}
// `;
// const completion = await groq.chat.completions.create({
//   model: "llama-3.1-8b-instant",

//   messages: [
//     {
//       role: "system",
//       content:
//         "You are an essay analyzer. Return ONLY valid JSON.",
//     },
//     {
//       role: "user",
//       content: prompt,
//     },
//   ],

//   temperature: 0.5,
// });

//     // ✅ Extract content
//     const content = completion?.choices?.[0]?.message?.content;

//     if (!content) {
//       throw new Error("Invalid Groq response content");
//     }

//     // ✅ Parse JSON safely
//     let data;

//     try {
//       data = JSON.parse(content);
//     } catch (parseErr) {
//       console.error("❌ JSON Parse Error:");
//       console.error(content);

//       return res.status(500).json({
//         error: "Failed to parse AI response.",
//         raw_response: content,
//       });
//     }

//     // ✅ Normalize annotations
//     const annotations = Array.isArray(data.annotations)
//       ? data.annotations.map((a) =>
//           typeof a === "string"
//             ? {
//                 type: "note",
//                 original: "",
//                 corrected: "",
//                 note: a,
//                 accepted: null,
//               }
//             : {
//                 type: a.type || "note",
//                 original: a.original || "",
//                 corrected: a.corrected || "",
//                 note: a.note || "",
//                 accepted: a.accepted ?? null,
//               }
//         )
//       : [];

//     // ✅ Save essay
//     const essayDoc = new Essay({
//   title,

//   raw_text: text,

//   corrected_text: data.corrected_text || "",

//   annotations,

//   grammar_issues: Array.isArray(data.grammar_issues)
//     ? data.grammar_issues
//     : [],

//   suggestions: Array.isArray(data.suggestions)
//     ? data.suggestions.map((s) =>
//         typeof s === "string"
//           ? s
//           : s.text || JSON.stringify(s)
//       )
//     : [],

//   score: Math.min(
//     10,
//     Math.max(0, Number(data.score) || 0)
//   ),

//   readability: data.readability || "Unknown",

//   tone: data.tone || "Neutral",

//   createdAt: new Date(),
// });

//     await essayDoc.save();

//     console.log("✅ Essay saved successfully:", essayDoc._id);

//     return res.json(essayDoc);

//   } catch (err) {
//     console.error("❌ Error in analyzeEssay:", err);

//     return res.status(500).json({
//       error: "Essay analysis failed.",
//       details: err.message || "Unknown error",
//     });
//   }
// };

// /**
//  * ✅ Save Annotation Feedback
//  */
// export const saveAnnotationFeedback = async (req, res) => {
//   try {
//     const { essayId, annotationIndex, accepted } = req.body;

//     if (!essayId || annotationIndex === undefined) {
//       return res.status(400).json({
//         error: "Invalid feedback parameters.",
//       });
//     }

//     const essay = await Essay.findById(essayId);

//     if (!essay) {
//       return res.status(404).json({
//         error: "Essay not found.",
//       });
//     }

//     if (essay.annotations && essay.annotations[annotationIndex]) {
//       essay.annotations[annotationIndex].accepted = accepted;

//       await essay.save();

//       return res.json({
//         success: true,
//         updated: essay.annotations[annotationIndex],
//       });
//     }

//     return res.status(400).json({
//       error: "Invalid annotation index.",
//     });

//   } catch (err) {
//     console.error("❌ Feedback save error:", err);

//     return res.status(500).json({
//       error: "Feedback save failed.",
//     });
//   }
// };

// /**
//  * 📜 Get Essay History
//  */
// export const getEssayHistory = async (req, res) => {
//   try {
//     const essays = await Essay.find({}, "title score createdAt")
//       .sort({ createdAt: -1 })
//       .limit(10);

//     return res.json(essays);

//   } catch (err) {
//     console.error("❌ History fetch error:", err);

//     return res.status(500).json({
//       error: "Failed to fetch history.",
//       details: err.message,
//     });
//   }
// };