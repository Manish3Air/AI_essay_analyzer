import React, { useEffect, useState } from "react";
import EssayUpload from "./components/EssayUpload";
import EssayHistoryDashboard from "./components/EssayHistoryDashboard";

const getInitialTheme = () => localStorage.getItem("ai-analyzer-theme") || "auto";

export default function App() {
  const [theme, setTheme] = useState(getInitialTheme);
  const [view, setView] = useState("analyzer");

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme =
        theme === "auto" ? (mediaQuery.matches ? "dark" : "light") : theme;
    };

    localStorage.setItem("ai-analyzer-theme", theme);
    applyTheme();

    if (theme !== "auto") return undefined;
    mediaQuery.addEventListener("change", applyTheme);
    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [theme]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark">AI</span>
          <div>
            <h1>Essay Analyzer</h1>
            <p className="subtitle">
              Review grammar, clarity, readability, tone, and long-term writing
              progress.
            </p>
          </div>
        </div>

        <div className="app-controls">
          <div className="segmented-control" aria-label="Primary view">
            <button
              type="button"
              aria-pressed={view === "analyzer"}
              className={view === "analyzer" ? "is-active" : ""}
              onClick={() => setView("analyzer")}
            >
              Analyzer
            </button>
            <button
              type="button"
              aria-pressed={view === "history"}
              className={view === "history" ? "is-active" : ""}
              onClick={() => setView("history")}
            >
              History
            </button>
          </div>

          <label className="theme-picker">
            <span>Theme</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </header>

      <main className="app-main">
        {view === "analyzer" ? <EssayUpload /> : <EssayHistoryDashboard />}
      </main>

      <footer className="app-footer">
        v3 includes inline highlights, score analytics, PDF export, and history
        tracking.
      </footer>
    </div>
  );
}
