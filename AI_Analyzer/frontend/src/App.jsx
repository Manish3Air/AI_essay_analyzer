import React, { useState, useEffect } from "react";
import EssayUpload from "./components/EssayUpload";
import EssayHistoryDashboard from "./components/EssayHistoryDashboard";

export default function App() {
  const [theme, setTheme] = useState("auto");
  const [view, setView] = useState("analyzer");

  // handle theme preference
  useEffect(() => {
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (theme === "auto")
      document.documentElement.dataset.theme = prefersDark ? "dark" : "light";
    else document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app min-h-screen flex flex-col bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="header bg-gray-900 border-b border-gray-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">🧠 AI Essay Analyzer</h1>
          <p className="subtitle text-gray-400 text-sm">
            Upload PDF → AI corrections, inline highlights, suggestions & downloadable report.
          </p>
        </div>

        <div className="controls flex items-center gap-4 mt-3 sm:mt-0">
          {/* View toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setView("analyzer")}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                view === "analyzer"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 hover:bg-gray-700"
              }`}
            >
              Analyzer
            </button>
            <button
              onClick={() => setView("history")}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                view === "history"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 hover:bg-gray-700"
              }`}
            >
              History
            </button>
          </div>

          {/* Theme selector */}
          <label className="text-sm flex items-center gap-2">
            Theme:
            <select
              onChange={(e) => setTheme(e.target.value)}
              defaultValue="auto"
              className="bg-gray-800 text-gray-200 rounded px-2 py-1"
            >
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-6">
        {view === "analyzer" ? <EssayUpload /> : <EssayHistoryDashboard />}
      </main>

      {/* Footer */}
      <footer className="footer text-center py-3 text-gray-500 text-sm border-t border-gray-800">
        v3 • Includes highlights, animated score meter, styled PDF export & history tracking
      </footer>
    </div>
  );
}
