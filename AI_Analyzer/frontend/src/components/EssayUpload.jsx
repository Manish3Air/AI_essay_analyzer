// EssayUpload.jsx
import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { motion } from "framer-motion";

// Utility: escape regex for safe replacements
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\\\]\\]/g, "\\$&");
}

// clamp
const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

// --- small text-metric helpers ---
function splitSentences(text) {
  // naive sentence split — good enough for metrics
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordTokens(text) {
  return text
    .replace(/\n+/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/[^\w'-]/g, ""))
    .filter(Boolean);
}

function lexicalDiversity(tokens) {
  if (!tokens || tokens.length === 0) return 0;
  const unique = new Set(tokens.map((t) => t.toLowerCase()));
  return unique.size / tokens.length || 0;
}

// --- component ---
export default function EssayUpload() {
  const [file, setFile] = useState(null);
  const [textInput, setTextInput] = useState("");
  const [analysis, setAnalysis] = useState(null); // normalized analysis object
  const [essayId, setEssayId] = useState(null); // id returned from backend (if present)
  const [loading, setLoading] = useState(false);
  const [annState, setAnnState] = useState([]); // { index, status }
  const [editableText, setEditableText] = useState("");
  const originalCorrectedRef = useRef("");
  const [grammarIssues, setGrammarIssues] = useState([]);

  // theme left as-is if you manage it at parent

  // Initialize annotations and editable text when analysis changes
  useEffect(() => {
    if (!analysis) {
      setAnnState([]);
      setEditableText("");
      originalCorrectedRef.current = "";
      setEssayId(null);
      return;
    }
    const anns = (analysis.annotations || []).map((a, i) => ({
      index: i,
      status:
        a.accepted === true
          ? "accepted"
          : a.accepted === false
          ? "rejected"
          : "pending",
    }));
    setAnnState(anns);
    originalCorrectedRef.current = analysis.corrected_text || "";
    setEditableText(analysis.corrected_text || analysis.raw_text || "");
    // if analysis has an _id or id, store it
    setEssayId(analysis._id || analysis.id || null);
  }, [analysis]);

  const handleFileChange = (e) => setFile(e.target.files?.[0] ?? null);

  // normalize backend response -> analysis object
  function normalizeResponsePayload(resData) {
    // backend may return { analysis: {...}, id: '...' } or the saved essay doc directly
    // handle common shapes
    if (!resData) return null;
    if (resData.analysis) return resData.analysis;
    // if it's an essay document (has corrected_text / annotations)
    if (resData.corrected_text || resData.annotations) return resData;
    // sometimes API returns { id, analysis }
    if (resData.id && resData.analysis) return resData.analysis;
    return null;
  }

  // Upload PDF
  const analyzeUpload = async (e) => {
    e && e.preventDefault();
    if (!file) return alert("Please choose a PDF to analyze");
    const fd = new FormData();
    fd.append("file", file);
    // optional: include userId
    fd.append("userId", "student_demo");

    setLoading(true);
    setAnalysis(null);
    try {
      const res = await axios.post("/api/essay/analyze-ml", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 180000,
      });
      // normalize
      const data = normalizeResponsePayload(res.data) ?? res.data;
      setAnalysis(data);
      setGrammarIssues(data.grammar_issues || []);
      // if backend returned saved doc, set essayId
      if (res.data._id || res.data.id) setEssayId(res.data._id || res.data.id);
      // else if backend wrapped response: { id, analysis }
      if (res.data.id && res.data.analysis) setEssayId(res.data.id);
    } catch (err) {
      console.error("analyzeUpload error:", err);
      const msg =
        err?.response?.data?.error || err?.message || "Analysis failed";
      alert("Analysis failed: " + msg);
    } finally {
      setLoading(false);
    }
  };

  // Analyze pasted text
  const analyzeText = async (e) => {
    e && e.preventDefault();
    if (!textInput || textInput.trim().length < 20)
      return alert("Paste at least 20 characters");
    setLoading(true);
    setAnalysis(null);
    try {
      const res = await axios.post(
        "/api/essay/analyze-ml",
        { text: textInput, userId: "student_demo" },
        { timeout: 180000 }
      );
      const data = normalizeResponsePayload(res.data) ?? res.data;
      setAnalysis(data);
      setGrammarIssues(data.grammar_issues || []);
      if (res.data._id || res.data.id) setEssayId(res.data._id || res.data.id);
      if (res.data.id && res.data.analysis) setEssayId(res.data.id);
    } catch (err) {
      console.error("analyzeText error:", err);
      const msg =
        err?.response?.data?.error || err?.message || "Analysis failed";
      alert("Analysis failed: " + msg);
    } finally {
      setLoading(false);
    }
  };

  // build highlighted html
  const buildHighlightedHTML = (text, annotations = []) => {
    if (!text) return "";
    if (!annotations || !annotations.length)
      return text.replace(/\n/g, "<br/>");

    const paired = annotations.map((a, i) => ({
      i,
      a,
      key: a.corrected && a.corrected.length > 0 ? a.corrected : a.original,
    }));
    paired.sort((x, y) => (y.key?.length || 0) - (x.key?.length || 0));

    let html = text;
    paired.forEach(({ i, a }) => {
      const needle =
        a.corrected && a.corrected.length > 0 ? a.corrected : a.original;
      if (!needle) return;
      const state = annState.find((x) => x.index === i)?.status ?? "pending";
      let cls = a.type === "correction" ? "hl-correct" : "hl-suggest";
      if (state === "accepted") cls += " hl-accepted";
      if (state === "rejected") cls += " hl-rejected";
      const note = a.note ? a.note.replace(/"/g, "&quot;") : "";
      try {
        const re = new RegExp(escapeRegExp(needle), "g");
        html = html.replace(
          re,
          `<mark class="${cls}" data-idx="${i}" data-note="${note}">${needle}</mark>`
        );
      } catch (e) {
        // in case needle has odd characters; skip
      }
    });

    return html.replace(/\n/g, "<br/>");
  };

  // persist annotation change to backend
  const persistAnnotation = async (essayIdLocal, index, accepted) => {
    if (!essayIdLocal) return;
    try {
      await axios.post("/api/essay/annotation-feedback", {
        essayId: essayIdLocal,
        annotationIndex: index,
        accepted,
      });
    } catch (err) {
      console.error(
        "persistAnnotation error:",
        err?.response?.data || err?.message
      );
      // continue silently — UI already updated
    }
  };

  // Accept or reject a single annotation (updates local state + backend)
  const setAnnotationStatus = (index, status) => {
    setAnnState((prev) =>
      prev.map((p) => (p.index === index ? { ...p, status } : p))
    );
    // update analysis.annotations locally as well (so next PDF export shows status)
    setAnalysis((prev) => {
      if (!prev) return prev;
      const anns = (prev.annotations || []).slice();
      if (!anns[index]) return prev;
      // store accepted boolean to persistable shape
      anns[index] = {
        ...anns[index],
        accepted:
          status === "accepted" ? true : status === "rejected" ? false : null,
      };
      return { ...prev, annotations: anns };
    });

    // apply replacement if accepted (replicate previous logic)
    if (status === "accepted") {
      const ann = (analysis?.annotations || [])[index];
      if (!ann) return;
      const needle = ann.original || ann.corrected;
      const replacement = ann.corrected || ann.original;
      setEditableText((prev) => {
        const re = new RegExp(escapeRegExp(needle));
        if (!re.test(prev)) return prev;
        return prev.replace(re, replacement);
      });
    }

    // persist to backend (if we have essayId)
    persistAnnotation(essayId, index, status === "accepted");
  };

  // Accept all and persist all
  const acceptAll = () => {
    const anns = analysis?.annotations || [];
    if (!anns.length) return;

    setAnnState(anns.map((_, i) => ({ index: i, status: "accepted" })));

    setAnalysis((prev) => {
      if (!prev) return prev;
      const newAnns = (prev.annotations || []).map((a) => ({
        ...a,
        accepted: true,
      }));
      return { ...prev, annotations: newAnns };
    });

    setEditableText((prev) => {
      let text = prev;
      anns.forEach((a) => {
        const needle = a.original || a.corrected;
        const repl = a.corrected || a.original;
        if (!needle) return;
        const re = new RegExp(escapeRegExp(needle), "g");
        text = text.replace(re, repl);
      });
      return text;
    });

    // persist all
    if (essayId) {
      (analysis?.annotations || []).forEach((_, i) =>
        persistAnnotation(essayId, i, true)
      );
    }
  };

  const resetAll = () => {
    setAnnState(
      (analysis?.annotations || []).map((_, i) => ({
        index: i,
        status: "pending",
      }))
    );
    setEditableText(
      originalCorrectedRef.current || analysis?.corrected_text || ""
    );
    // update local annotations' accepted flags to null
    setAnalysis((prev) => {
      if (!prev) return prev;
      const newAnns = (prev.annotations || []).map((a) => ({
        ...a,
        accepted:
          a.accepted === true ? true : a.accepted === false ? false : null,
      }));
      return { ...prev, annotations: newAnns };
    });
    // optionally persist reset for each annotation (omitted to avoid chatter) — can be added if desired
  };

  // download PDF
  const downloadReportPDF = () => {
    if (!analysis) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    doc.setFontSize(18);
    doc.text("AI Essay Analyzer — Report", margin, 50);
    doc.setFontSize(11);
    doc.text(`Date: ${new Date().toLocaleString()}`, margin, 72);
    doc.setFontSize(12);
    doc.text(
      `Score: ${analysis.score ?? "N/A"}/10    Readability: ${
        analysis.readability ?? "N/A"
      }`,
      margin,
      95
    );

    doc.setFontSize(13);
    doc.text("Corrected Essay (final)", margin, 120);
    const finalText = editableText || analysis.corrected_text || "";
    const split = doc.splitTextToSize(finalText, 520);
    doc.setFontSize(10);
    doc.text(split, margin, 140);

    doc.addPage();
    doc.setFontSize(14);
    doc.text("Annotations & Issues", margin, 50);
    const rows = (analysis.annotations || []).map((a, i) => [
      i + 1,
      a.type || "",
      a.original || "",
      a.corrected || "",
      a.note || "",
      annState.find((s) => s.index === i)?.status ||
        (a.accepted === true
          ? "accepted"
          : a.accepted === false
          ? "rejected"
          : "pending"),
    ]);
    autoTable(doc, {
      head: [["#", "Type", "Original", "Corrected", "Note", "Status"]],
      body: rows,
      startY: 80,
      margin: { left: margin, right: margin },
      styles: { fontSize: 10 },
    });

    doc.addPage();
    doc.setFontSize(14);
    doc.text("Summary & Suggestions", margin, 50);
    const sugg = (analysis.suggestions || [])
      .slice(0, 50)
      .map((s, i) => `${i + 1}. ${s}`);
    doc.setFontSize(11);
    doc.text(doc.splitTextToSize(sugg.join("\n"), 520), margin, 78);

    doc.setFontSize(9);
    doc.text(
      "Generated by AI Essay Analyzer v3",
      margin,
      doc.internal.pageSize.height - 30
    );
    doc.save("ai-essay-analyzer-report.pdf");
  };

  // inline mark handlers: double-click to accept, right-click to reject
  const onCorrectedViewClick = (e) => {
    const el = e.target.closest("mark");
    if (!el) return;
    const idx = Number(el.getAttribute("data-idx"));
    if (isNaN(idx)) return;
    // double click will be handled via dblclick event
  };

  const onMarkDoubleClick = (e) => {
    const el = e.target.closest("mark");
    if (!el) return;
    const idx = Number(el.getAttribute("data-idx"));
    if (isNaN(idx)) return;
    // Accept on double click
    setAnnotationStatus(idx, "accepted");
    e.preventDefault();
  };

  const onMarkContextMenu = (e) => {
    const el = e.target.closest("mark");
    if (!el) return;
    const idx = Number(el.getAttribute("data-idx"));
    if (isNaN(idx)) return;
    // Reject on right-click
    e.preventDefault();
    setAnnotationStatus(idx, "rejected");
  };

  // Annotation list UI
  const AnnotationList = () => {
    const anns = analysis?.annotations || [];
    if (!anns.length) return <div className="text-muted">No annotations.</div>;
    return (
      <div className="space-y-2">
        {anns.map((a, i) => {
          const state =
            annState.find((x) => x.index === i)?.status ||
            (a.accepted === true
              ? "accepted"
              : a.accepted === false
              ? "rejected"
              : "pending");
          return (
            <div
              key={i}
              className="flex items-start gap-3 p-3 rounded-lg shadow-sm bg-white/5"
            >
              <div className="w-8 text-sm font-mono text-gray-400">
                #{i + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <strong className="capitalize">{a.type}</strong> —{" "}
                    <span className="text-sm">{a.note}</span>
                  </div>
                  <div className="text-sm">
                    Status:{" "}
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        state === "accepted"
                          ? "bg-green-800 text-green-200"
                          : ""
                      } ${
                        state === "rejected" ? "bg-red-800 text-red-200" : ""
                      }`}
                    >
                      {state}
                    </span>
                  </div>
                </div>
                <div className="mt-2 text-sm text-muted">
                  Original: “{a.original}”
                </div>
                <div className="mt-1 text-sm text-muted">
                  Suggestion: “{a.corrected || "(no change)"}”
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    className="btn-accept"
                    onClick={() => setAnnotationStatus(i, "accepted")}
                  >
                    Accept
                  </button>
                  <button
                    className="btn-reject"
                    onClick={() => setAnnotationStatus(i, "rejected")}
                  >
                    Reject
                  </button>
                  <button
                    className="btn-reset"
                    onClick={() => setAnnotationStatus(i, "pending")}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // small analytics widget that includes local computed metrics
  const Analytics = () => {
    const finalText =
      editableText || analysis?.corrected_text || analysis?.raw_text || "";
    const tokens = wordTokens(finalText);
    const sentences = splitSentences(finalText);
    const wordCount = tokens.length;
    const sentenceCount = sentences.length;
    const avgSentenceLength = sentenceCount
      ? (wordCount / sentenceCount).toFixed(1)
      : "N/A";
    const lexDiv = lexicalDiversity(tokens);
    const tone = analysis?.tone || "Neutral";
    const readability = analysis?.readability ?? "N/A";
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-white/5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted">Overall score</div>
              <div className="text-2xl font-semibold">
                {analysis?.score ?? "N/A"}/10
              </div>
            </div>
            <div style={{ width: 220 }}>
              <div className="text-sm text-muted">Score meter</div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden mt-2">
                <motion.div
                  className="h-3"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${clamp((analysis?.score || 0) * 10, 5, 100)}%`,
                  }}
                  transition={{ duration: 1.2 }}
                  style={{
                    background:
                      "linear-gradient(90deg,#ef4444,#f59e0b,#10b981)",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-muted">Readability</div>
              <div className="text-lg font-semibold">
                {typeof readability === "number"
                  ? `${readability}`
                  : readability}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted">Tone</div>
              <div className="text-lg font-semibold">{tone}</div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-muted">
            <div>
              Words: <strong>{wordCount}</strong>
            </div>
            <div>
              Sentences: <strong>{sentenceCount}</strong>
            </div>
            <div>
              Avg sentence length: <strong>{avgSentenceLength}</strong>
            </div>
            <div>
              Lexical diversity: <strong>{lexDiv.toFixed(2)}</strong>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-7">
          <div className="card p-4 mb-4">
            <form onSubmit={analyzeUpload} className="space-y-3">
              <label className="block text-sm font-medium">Upload PDF</label>
              <input
                className="w-full rounded p-2 border border-gray-300 bg-white/5 cursor-pointer text-sm"
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
              />
              <div className="flex gap-2 mt-2">
                <button
                  className="primary"
                  onClick={analyzeUpload}
                  disabled={loading}
                >
                  {loading ? "Analyzing..." : "Analyze PDF"}
                </button>
                <button
                  className="secondary"
                  onClick={(e) => {
                    e.preventDefault();
                    setFile(null);
                    setAnalysis(null);
                  }}
                >
                  Clear
                </button>
              </div>
            </form>

            <hr className="my-4" />

            <form onSubmit={analyzeText} className="space-y-2">
              <label className="block text-sm font-medium">
                Or paste essay text
              </label>
              <textarea
                className="w-full rounded p-2"
                rows={8}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste essay text or use the PDF upload"
              />
              <div className="flex gap-2">
                <button className="primary" type="submit" disabled={loading}>
                  {loading ? "Analyzing..." : "Analyze Text"}
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    setTextInput("");
                    setAnalysis(null);
                  }}
                >
                  Reset
                </button>
              </div>
            </form>
          </div>

          {analysis && (
            <div className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Corrected Essay</h2>
                  <p className="text-sm text-muted">
                    Accept or reject AI suggestions inline or from the list.
                    Double-click a highlight to accept. Right-click to reject.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button className="btn-ghost" onClick={acceptAll}>
                    Accept all
                  </button>
                  <button className="btn-ghost" onClick={resetAll}>
                    Reset
                  </button>
                  <button className="primary" onClick={downloadReportPDF}>
                    Download Report (PDF)
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <div className="mb-2 text-sm text-muted">
                  Final editable text — you can edit before download
                </div>
                <div className="border rounded p-3 bg-white/5">
                  <div
                    className="corrected-view"
                    onClick={onCorrectedViewClick}
                    onDoubleClick={onMarkDoubleClick}
                    onContextMenu={onMarkContextMenu}
                    dangerouslySetInnerHTML={{
                      __html: buildHighlightedHTML(
                        editableText,
                        analysis.annotations || []
                      ),
                    }}
                  />
                </div>

                <div className="mt-3">
                  <label className="text-sm font-medium">
                    Or edit the corrected essay directly
                  </label>
                  <textarea
                    className="w-full rounded p-2 mt-2"
                    rows={8}
                    value={editableText}
                    onChange={(e) => setEditableText(e.target.value)}
                  />
                </div>

                <div className="mt-2 text-xs text-muted">
                  Hover highlighted phrases to see AI note. Accepted highlights
                  show a subtle green band; rejected highlights are gray.
                </div>
              </div>
            </div>
          )}

          {Array.isArray(grammarIssues) && grammarIssues.length > 0 && (
            <section className="mt-6">
              <h3 className="text-lg font-semibold mb-3">
                Grammar Issues Detected
              </h3>

              <div className="space-y-4">
                {grammarIssues.map((g, i) => (
                  <div key={i} className="border rounded-lg p-4 bg-gray-900">
                    <p className="text-sm text-gray-200 mb-1">Original</p>
                    <p className="text-red-700 mb-2">{g?.sentence}</p>

                    <p className="text-sm text-gray-200 mb-1">Corrected</p>
                    <p className="text-green-700 mb-2">{g?.corrected}</p>

                    {Array.isArray(g?.issues) && g.issues.length > 0 && (
                      <ul className="text-sm list-disc pl-5">
                        {g.issues.map((iss, j) => (
                          <li
                            key={j}
                            className={
                              iss?.type === "addition"
                                ? "text-green-600"
                                : "text-red-600"
                            }
                          >
                            {iss?.type}: <b>{iss?.text}</b>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="col-span-12 lg:col-span-5 space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-4"
          >
            <h3 className="text-lg font-medium">Analysis Summary</h3>
            {analysis ? (
              <Analytics />
            ) : (
              <div className="text-sm text-muted mt-2">
                No analysis yet — upload an essay or paste text to start.
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 6, delay: 0.1 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-4"
          >
            <h3 className="text-lg font-medium">Annotations</h3>
            <div className="mt-3">
              <AnnotationList />
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 6, delay: 0.2 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-4"
          >
            <h3 className="text-lg font-medium">Quick Metrics</h3>
            <div className="mt-3 text-sm space-y-2">
              <div>
                Grammar issues:{" "}
                <strong>{(analysis?.grammar_issues || []).length}</strong>
              </div>
              <div>
                Suggestions:{" "}
                <strong>{(analysis?.suggestions || []).length}</strong>
              </div>
              <div>
                Readability: <strong>{analysis?.readability ?? "N/A"}</strong>
              </div>
              <div>
                Tone: <strong>{analysis?.tone ?? "N/A"}</strong>
              </div>
            </div>
          </motion.div>
        </aside>
      </div>

      <style>{`
        .card{background:var(--surface);border:1px solid var(--border);padding:16px;border-radius:10px;box-shadow:var(--shadow)}
        .primary{background:var(--accent);color:white;padding:8px 12px;border-radius:8px;border:none}
        .secondary{
        background:transparent;border:1px solid var(--border);color:var(--muted);padding:8px 12px;border-radius:8px
        }
        .secondary:hover{background:var(--surface-muted);color:var(--text)}
        .btn-ghost{background:transparent;border:1px solid var(--border);color:var(--muted);padding:8px 10px;border-radius:8px}
        .btn-accept{background:#10b981;color:white;padding:6px 8px;border-radius:8px;border:none}
        .btn-reject{background:#ef4444;color:white;padding:6px 8px;border-radius:8px;border:none}
        .btn-reset{background:#f3f4f6;color:#111;padding:6px 8px;border-radius:8px;border:none}
        .btn-reset:hover{background:#e5e7eb}
        .text-muted{color:var(--muted, #9aa4b2)}
        .corrected-view mark{padding:0 2px;border-radius:4px}
        .hl-correct{background:linear-gradient(90deg, rgba(16,185,129,0.12), rgba(16,185,129,0.03));border-bottom:2px solid rgba(16,185,129,0.18)}
        .hl-suggest{background:linear-gradient(90deg, rgba(245,158,11,0.12), rgba(245,158,11,0.03));border-bottom:2px dashed rgba(245,158,11,0.15)}
        .hl-accepted{box-shadow:0 6px 18px rgba(16,185,129,0.04)}
        .hl-rejected{opacity:0.6;text-decoration:line-through}
        mark[data-idx]{position:relative}
        mark[data-idx]:hover::after{content:attr(data-note);position:absolute;left:0;top:100%;background:rgba(0,0,0,0.85);color:white;padding:6px 8px;border-radius:6px;white-space:nowrap;transform:translateY(8px);font-size:12px}
      `}</style>
    </div>
  );
}
