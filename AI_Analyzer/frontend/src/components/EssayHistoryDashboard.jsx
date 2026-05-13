import React, { useEffect, useMemo, useState } from "react";
// import axios from "axios";
import { jsPDF } from "jspdf";
import api from "../services/api";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";

const COLORS = ["#4f46e5", "#0f766e", "#f59e0b", "#e11d48", "#2563eb"];
const FILTERS = [
  { label: "All", value: "all" },
  { label: "30 days", value: "30" },
  { label: "7 days", value: "7" },
];
const DEFAULT_GOALS = {
  targetScore: 8,
  targetReadability: 70,
  maxGrammarIssues: 5,
};

const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });

const getGrammarCount = (essay) => essay.grammar_issues?.length || 0;
const getSuggestionCount = (essay) => essay.suggestions?.length || 0;
const getReadabilityValue = (essay) => {
  const value = essay?.readability;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const numeric = Number(value.match(/\d+(\.\d+)?/)?.[0]);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return 0;
};
const getEssayTitle = (essay, index) =>
  essay.title || essay.filename || essay.fileName || `Essay ${index + 1}`;
const getEssayId = (essay, index) =>
  essay._id || essay.id || `${essay.createdAt || "essay"}-${index}`;
const getWordCount = (essay) => {
  const text = essay.corrected_text || essay.raw_text || essay.text || "";
  return text.trim() ? text.trim().split(/\s+/).length : 0;
};
const getEssayText = (essay) => essay?.corrected_text || essay?.raw_text || essay?.text || "";

function getTextMetrics(text) {
  const cleanText = text || "";
  const words = cleanText
    .replace(/\n+/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/[^\w'-]/g, ""))
    .filter(Boolean);
  const sentences = cleanText
    .replace(/\n+/g, " ")
    .split(/(?<=[.?!])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const uniqueWords = new Set(words.map((word) => word.toLowerCase()));
  const longWords = words.filter((word) => word.length >= 7);

  return {
    avgSentenceLength: sentences.length ? words.length / sentences.length : 0,
    lexicalDiversity: words.length ? uniqueWords.size / words.length : 0,
    longWordRatio: words.length ? longWords.length / words.length : 0,
    sentenceCount: sentences.length,
    wordCount: words.length,
  };
}

function average(items, key) {
  if (!items.length) return 0;
  return (
    items.reduce((sum, item) => {
      const value = key === "readability" ? getReadabilityValue(item) : Number(item[key] || 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0) / items.length
  );
}

function compareFirstLast(items, key) {
  if (items.length < 2) return 0;
  const first = key === "readability" ? getReadabilityValue(items[0]) : Number(items[0]?.[key] || 0);
  const last =
    key === "readability"
      ? getReadabilityValue(items[items.length - 1])
      : Number(items[items.length - 1]?.[key] || 0);
  return last - first;
}

function buildIssueTypes(items) {
  const counts = {};
  items.forEach((essay) => {
    (essay.grammar_issues || []).forEach((issue) => {
      const issueTypes = Array.isArray(issue?.issues) ? issue.issues : [issue];
      issueTypes.forEach((entry) => {
        const type = entry?.type || issue?.type || "grammar";
        counts[type] = (counts[type] || 0) + 1;
      });
    });
  });

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function buildIssueTrend(items) {
  const midpoint = Math.ceil(items.length / 2);
  const firstHalf = buildIssueTypes(items.slice(0, midpoint));
  const secondHalf = buildIssueTypes(items.slice(midpoint));
  const names = new Set([...firstHalf, ...secondHalf].map((item) => item.name));

  return [...names]
    .map((name) => {
      const before = firstHalf.find((item) => item.name === name)?.count || 0;
      const after = secondHalf.find((item) => item.name === name)?.count || 0;
      return { after, before, change: after - before, name };
    })
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 5);
}

function getFeedbackStats(items) {
  const annotations = items.flatMap((essay) => essay.annotations || []);
  const accepted = annotations.filter((annotation) => annotation.accepted === true).length;
  const rejected = annotations.filter((annotation) => annotation.accepted === false).length;
  const reviewed = accepted + rejected;

  return {
    accepted,
    acceptanceRate: reviewed ? Math.round((accepted / reviewed) * 100) : 0,
    pending: annotations.length - reviewed,
    rejected,
    reviewed,
    total: annotations.length,
  };
}

function getWritingStreak(items) {
  const daySet = new Set(
    items.map((essay) => new Date(essay.createdAt).toISOString().slice(0, 10))
  );
  const sortedDays = [...daySet].sort();
  let currentStreak = 0;
  let cursor = new Date();

  while (daySet.has(cursor.toISOString().slice(0, 10))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  let bestStreak = 0;
  let running = 0;
  let previous = null;

  sortedDays.forEach((day) => {
    const current = new Date(day);
    if (previous) {
      const diff = (current - previous) / (24 * 60 * 60 * 1000);
      running = diff === 1 ? running + 1 : 1;
    } else {
      running = 1;
    }
    bestStreak = Math.max(bestStreak, running);
    previous = current;
  });

  const weekdayCounts = items.reduce((acc, essay) => {
    const day = new Date(essay.createdAt).toLocaleDateString("en-IN", {
      weekday: "long",
    });
    acc[day] = (acc[day] || 0) + 1;
    return acc;
  }, {});
  const bestDay =
    Object.entries(weekdayCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";

  return { bestDay, bestStreak, currentStreak };
}

function StatCard({ label, value, detail, tone = "neutral" }) {
  return (
    <motion.div whileHover={{ y: -2 }} className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </motion.div>
  );
}

function ChartCard({ title, subtitle, children, className = "" }) {
  return (
    <section className={`dashboard-card ${className}`}>
      <div className="card-heading">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function ComparisonMetric({ label, before, after, reverse = false, suffix = "" }) {
  const delta = Number(after || 0) - Number(before || 0);
  const isGood = reverse ? delta <= 0 : delta >= 0;
  const sign = delta > 0 ? "+" : "";

  return (
    <div className="comparison-metric">
      <span>{label}</span>
      <strong>
        {before ?? "N/A"}
        {suffix} {"->"} {after ?? "N/A"}
        {suffix}
      </strong>
      <small className={isGood ? "good" : "warn"}>
        {sign}
        {delta.toFixed(1)}
        {suffix}
      </small>
    </div>
  );
}

function loadGoals() {
  try {
    const saved = localStorage.getItem("ai-analyzer-goals");
    return saved ? { ...DEFAULT_GOALS, ...JSON.parse(saved) } : DEFAULT_GOALS;
  } catch {
    return DEFAULT_GOALS;
  }
}

function GoalProgress({ label, value, target, reverse = false, suffix = "" }) {
  const numericValue = Number(value || 0);
  const numericTarget = Number(target || 0);
  const progress = reverse
    ? numericTarget <= 0
      ? 100
      : Math.max(0, Math.min(100, (numericTarget / Math.max(numericValue, 1)) * 100))
    : numericTarget <= 0
    ? 0
    : Math.max(0, Math.min(100, (numericValue / numericTarget) * 100));
  const achieved = reverse ? numericValue <= numericTarget : numericValue >= numericTarget;

  return (
    <div className="goal-progress">
      <div>
        <span>{label}</span>
        <strong>
          {numericValue.toFixed(reverse ? 0 : 1)}
          {suffix}
          <small> target {numericTarget}{suffix}</small>
        </strong>
      </div>
      <div className="goal-bar">
        <i className={achieved ? "achieved" : ""} style={{ width: `${progress}%` }} />
      </div>
      <p>{achieved ? "Goal reached" : `${Math.round(progress)}% complete`}</p>
    </div>
  );
}

export default function EssayHistoryDashboard() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [query, setQuery] = useState("");
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [goals, setGoals] = useState(loadGoals);
  const [selectedEssay, setSelectedEssay] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data } = await api.get("/api/essay/history");
        setHistory(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Error loading history:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  useEffect(() => {
    localStorage.setItem("ai-analyzer-goals", JSON.stringify(goals));
  }, [goals]);

  const filteredHistory = useMemo(() => {
    const now = Date.now();
    const byDate = history.filter((essay) => {
      if (filter === "all") return true;
      const createdAt = new Date(essay.createdAt).getTime();
      const days = Number(filter);
      return now - createdAt <= days * 24 * 60 * 60 * 1000;
    });

    const bySearch = byDate.filter((essay, index) => {
      const text = [
        getEssayTitle(essay, index),
        essay.tone,
        essay.raw_text,
        essay.corrected_text,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(query.trim().toLowerCase());
    });

    return [...bySearch].sort((a, b) => {
      if (sortBy === "score") return (b.score || 0) - (a.score || 0);
      if (sortBy === "issues") return getGrammarCount(b) - getGrammarCount(a);
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [filter, history, query, sortBy]);

  const chronological = useMemo(
    () => [...filteredHistory].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
    [filteredHistory]
  );

  const essayOptions = useMemo(
    () =>
      chronological.map((essay, index) => ({
        essay,
        id: getEssayId(essay, index),
        title: getEssayTitle(essay, index),
      })),
    [chronological]
  );

  useEffect(() => {
    if (essayOptions.length < 2) return;

    const ids = essayOptions.map((item) => item.id);
    if (!ids.includes(compareA)) setCompareA(ids[0]);
    if (!ids.includes(compareB) || compareB === ids[0])
      setCompareB(ids[ids.length - 1]);
  }, [compareA, compareB, essayOptions]);

  const dashboardData = useMemo(() => {
    const avgScore = average(chronological, "score");
    const avgReadability = average(chronological, "readability");
    const scoreDelta = compareFirstLast(chronological, "score");
    const issueDelta =
      chronological.length < 2
        ? 0
        : getGrammarCount(chronological[chronological.length - 1]) -
          getGrammarCount(chronological[0]);

    const chartRows = chronological.map((essay, index) => ({
      ...essay,
      label: formatDate(essay.createdAt),
      title: getEssayTitle(essay, index),
      score: Number(essay.score || 0),
      readability: getReadabilityValue(essay),
      grammarCount: getGrammarCount(essay),
      suggestionCount: getSuggestionCount(essay),
    }));

    const toneData = Object.entries(
      chronological.reduce((acc, item) => {
        const tone = item.tone || "Neutral";
        acc[tone] = (acc[tone] || 0) + 1;
        return acc;
      }, {})
    ).map(([name, value]) => ({ name, value }));

    const commonTone =
      [...toneData].sort((a, b) => b.value - a.value)[0]?.name || "N/A";
    const bestEssay = [...chronological].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    const issueTypes = buildIssueTypes(chronological);
    const issueTrend = buildIssueTrend(chronological);
    const feedbackStats = getFeedbackStats(chronological);
    const streaks = getWritingStreak(chronological);
    const latestEssay = chronological[chronological.length - 1];
    const latestMetrics = getTextMetrics(getEssayText(latestEssay));
    const avgGrammarPerEssay = chronological.length
      ? chronological.reduce((sum, item) => sum + getGrammarCount(item), 0) /
        chronological.length
      : 0;
    const skillProfile = [
      { name: "Grammar", value: Math.max(0, Math.round(100 - avgGrammarPerEssay * 10)) },
      { name: "Clarity", value: Math.min(100, Math.round(avgReadability)) },
      { name: "Structure", value: Math.min(100, Math.round(avgScore * 10)) },
      {
        name: "Vocabulary",
        value: Math.min(100, Math.round((latestMetrics.lexicalDiversity || 0) * 120)),
      },
      {
        name: "Consistency",
        value: Math.max(0, Math.round(100 - Math.abs(scoreDelta) * 8)),
      },
    ];

    return {
      avgScore,
      avgReadability,
      bestEssay,
      chartRows,
      commonTone,
      feedbackStats,
      issueDelta,
      issueTrend,
      issueTypes,
      latestMetrics,
      scoreDelta,
      skillProfile,
      streaks,
      toneData,
      totalGrammar: chronological.reduce((sum, item) => sum + getGrammarCount(item), 0),
      totalSuggestions: chronological.reduce(
        (sum, item) => sum + getSuggestionCount(item),
        0
      ),
    };
  }, [chronological]);

  const insightCards = useMemo(() => {
    const { avgScore, commonTone, issueDelta, issueTypes, scoreDelta } = dashboardData;
    const topIssue = issueTypes[0]?.name || "grammar";

    return [
      {
        title: scoreDelta >= 0 ? "Score momentum" : "Score dip",
        text:
          chronological.length < 2
            ? "Analyze more essays to unlock progress trends."
            : `Your score changed by ${scoreDelta.toFixed(1)} points across this view.`,
      },
      {
        title: "Focus area",
        text:
          issueTypes.length > 0
            ? `${topIssue} appears most often in your grammar feedback.`
            : "No recurring grammar pattern is visible yet.",
      },
      {
        title: "Writing profile",
        text: `Average score is ${avgScore.toFixed(1)}/10 and the most common tone is ${commonTone}.`,
      },
      {
        title: issueDelta <= 0 ? "Cleaner drafts" : "Issue pressure",
        text:
          chronological.length < 2
            ? "Grammar movement will appear after another essay."
            : `Grammar issues changed by ${Math.abs(issueDelta)} from first to latest essay.`,
      },
    ];
  }, [chronological.length, dashboardData]);

  const comparison = useMemo(() => {
    const first = essayOptions.find((item) => item.id === compareA);
    const second = essayOptions.find((item) => item.id === compareB);
    if (!first || !second) return null;

    const firstEssay = first.essay;
    const secondEssay = second.essay;
    const scoreDelta = Number(secondEssay.score || 0) - Number(firstEssay.score || 0);
    const readabilityDelta =
      getReadabilityValue(secondEssay) - getReadabilityValue(firstEssay);
    const issueDelta = getGrammarCount(secondEssay) - getGrammarCount(firstEssay);
    const suggestionDelta =
      getSuggestionCount(secondEssay) - getSuggestionCount(firstEssay);

    const summary =
      scoreDelta > 0 && issueDelta <= 0
        ? "This is a strong improvement: score rose while grammar pressure went down."
        : scoreDelta > 0
        ? "Score improved, but the feedback load still needs attention."
        : issueDelta < 0
        ? "Grammar issues decreased, even though score did not rise yet."
        : "This comparison shows a useful checkpoint for the next revision goal.";

    return {
      first,
      second,
      issueDelta,
      readabilityDelta,
      scoreDelta,
      suggestionDelta,
      summary,
    };
  }, [compareA, compareB, essayOptions]);

  const goalStatus = useMemo(() => {
    const latestEssay = chronological[chronological.length - 1];
    const latestScore = Number(latestEssay?.score || 0);
    const latestReadability = getReadabilityValue(latestEssay);
    const latestIssues = latestEssay ? getGrammarCount(latestEssay) : 0;
    const reached = [
      latestScore >= Number(goals.targetScore || 0),
      latestReadability >= Number(goals.targetReadability || 0),
      latestIssues <= Number(goals.maxGrammarIssues || 0),
    ].filter(Boolean).length;

    const message =
      reached === 3
        ? "All goals are currently met. This is a strong writing checkpoint."
        : reached === 2
        ? "Two goals are on track. One focused revision can close the gap."
        : reached === 1
        ? "One goal is on track. Use the weak-area panel to decide the next fix."
        : "Your current targets are ambitious. Start with the smallest gap first.";

    return {
      latestIssues,
      latestReadability,
      latestScore,
      message,
      reached,
    };
  }, [chronological, goals]);

  const improvementPlan = useMemo(() => {
    const topIssue = dashboardData.issueTypes[0]?.name || "grammar";
    const latestScore = goalStatus.latestScore;
    const latestReadability = goalStatus.latestReadability;
    const latestIssues = goalStatus.latestIssues;
    const plan = [];

    if (latestScore < Number(goals.targetScore || 0)) {
      plan.push(`Raise score by focusing on structure and argument clarity before polishing language.`);
    }
    if (latestReadability < Number(goals.targetReadability || 0)) {
      plan.push(`Improve readability by shortening long sentences and keeping one idea per sentence.`);
    }
    if (latestIssues > Number(goals.maxGrammarIssues || 0)) {
      plan.push(`Reduce ${topIssue} issues first because it is the most repeated feedback pattern.`);
    }
    if (dashboardData.latestMetrics.wordCount < 250) {
      plan.push("Write fuller drafts with clearer examples; recent essays are still quite short.");
    }
    if (!plan.length) {
      plan.push("Maintain the current standard and focus on more ambitious vocabulary and transitions.");
    }

    return plan.slice(0, 4);
  }, [dashboardData, goalStatus, goals]);

  const revisionCoach = useMemo(() => {
    const topIssue = dashboardData.issueTypes[0]?.name || "grammar";
    const readabilityGap =
      Number(goals.targetReadability || 0) - goalStatus.latestReadability;
    const scoreGap = Number(goals.targetScore || 0) - goalStatus.latestScore;

    if (!chronological.length) return "Analyze essays to unlock coaching.";
    if (scoreGap <= 0 && readabilityGap <= 0 && goalStatus.latestIssues <= Number(goals.maxGrammarIssues || 0)) {
      return "Your latest essay meets the current targets. Try raising the score target or working on a more advanced writing style.";
    }
    if (goalStatus.latestIssues > Number(goals.maxGrammarIssues || 0)) {
      return `Start the next revision by fixing ${topIssue} issues, then reread the essay aloud for sentence flow.`;
    }
    if (readabilityGap > 0) {
      return "The next draft should aim for cleaner readability: shorter sentences, clearer transitions, and fewer stacked clauses.";
    }
    return "The next draft should improve argument depth: add stronger examples, clearer paragraph topic sentences, and a tighter conclusion.";
  }, [chronological.length, dashboardData.issueTypes, goalStatus, goals]);

  const deleteEssayById = async (id) => {
    if (!id) return;
    const confirmed = window.confirm("Delete this essay from history?");
    if (!confirmed) return;

    await api.delete(`/api/essay/${id}`);
    setHistory((current) => current.filter((essay, index) => getEssayId(essay, index) !== id));
    setSelectedEssay(null);
  };

  const clearHistory = async () => {
    const confirmed = window.confirm("Clear all essay history? This cannot be undone.");
    if (!confirmed) return;

    await api.delete("/api/essay/history");
    setHistory([]);
    setSelectedEssay(null);
  };

  const exportDashboardPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    const lines = [
      "AI Essay Analyzer - Dashboard Report",
      `Generated: ${new Date().toLocaleString()}`,
      "",
      `Essays: ${filteredHistory.length}`,
      `Average score: ${dashboardData.avgScore.toFixed(1)}/10`,
      `Average readability: ${dashboardData.avgReadability.toFixed(1)}`,
      `Grammar issues: ${dashboardData.totalGrammar}`,
      `Suggestions: ${dashboardData.totalSuggestions}`,
      `Common tone: ${dashboardData.commonTone}`,
      "",
      "Improvement Plan:",
      ...improvementPlan.map((item, index) => `${index + 1}. ${item}`),
      "",
      `Revision Coach: ${revisionCoach}`,
    ];

    doc.setFontSize(16);
    doc.text("AI Essay Analyzer - Dashboard Report", margin, 50);
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(lines.slice(1).join("\n"), 515), margin, 78);
    doc.save("ai-essay-dashboard-report.pdf");
  };

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-skeleton" />
        <div className="dashboard-skeleton grid" />
      </div>
    );
  }

  if (!history.length) {
    return (
      <div className="empty-state">
        <h2>No essay history yet</h2>
        <p>Analyze a PDF or pasted essay first, then your trend dashboard will appear here.</p>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-hero">
        <div>
          <p className="eyebrow">Writing analytics</p>
          <h2>History Dashboard</h2>
          <p>
            Track score movement, recurring grammar patterns, readability, tone,
            and recent essay performance.
          </p>
        </div>

        <div className="dashboard-filters">
          <button type="button" className="table-action" onClick={exportDashboardPDF}>
            Export PDF
          </button>
          <button type="button" className="danger-action" onClick={clearHistory}>
            Clear History
          </button>
          <div className="segmented-control compact">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={filter === item.value ? "is-active" : ""}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search essays"
          />
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="newest">Newest first</option>
            <option value="score">Highest score</option>
            <option value="issues">Most issues</option>
          </select>
        </div>
      </div>

      <div className="metrics-grid">
        <StatCard
          label="Essays"
          value={filteredHistory.length}
          detail={`${history.length} total saved`}
        />
        <StatCard
          label="Avg Score"
          value={`${dashboardData.avgScore.toFixed(1)}/10`}
          detail={`${dashboardData.scoreDelta >= 0 ? "+" : ""}${dashboardData.scoreDelta.toFixed(1)} trend`}
          tone={dashboardData.scoreDelta >= 0 ? "good" : "warn"}
        />
        <StatCard
          label="Readability"
          value={dashboardData.avgReadability.toFixed(1)}
          detail="Average across filtered essays"
        />
        <StatCard
          label="Grammar Load"
          value={dashboardData.totalGrammar}
          detail={`${dashboardData.totalSuggestions} suggestions found`}
          tone="warn"
        />
      </div>

      <div className="insight-grid">
        {insightCards.map((insight) => (
          <motion.article
            key={insight.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="insight-card"
          >
            <span>{insight.title}</span>
            <p>{insight.text}</p>
          </motion.article>
        ))}
      </div>

      <div className="dashboard-grid">
        <ChartCard
          title="Personal Improvement Plan"
          subtitle="A short action list generated from goals and history patterns"
          className="plan-card"
        >
          <ol className="plan-list">
            {improvementPlan.map((item, index) => (
              <li key={item}>
                <span>{index + 1}</span>
                <p>{item}</p>
              </li>
            ))}
          </ol>
        </ChartCard>

        <ChartCard title="Revision Coach" subtitle="Next best move for the next essay">
          <div className="coach-card">
            <p>{revisionCoach}</p>
          </div>
        </ChartCard>
      </div>

      <ChartCard
        title="Writing Goals"
        subtitle="Set personal targets and track the latest essay against them"
        className="goals-card"
      >
        <div className="goal-editor">
          <label>
            <span>Target score</span>
            <input
              type="number"
              min="1"
              max="10"
              step="0.1"
              value={goals.targetScore}
              onChange={(event) =>
                setGoals((current) => ({
                  ...current,
                  targetScore: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Target readability</span>
            <input
              type="number"
              min="1"
              max="100"
              step="1"
              value={goals.targetReadability}
              onChange={(event) =>
                setGoals((current) => ({
                  ...current,
                  targetReadability: event.target.value,
                }))
              }
            />
          </label>
          <label>
            <span>Max grammar issues</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={goals.maxGrammarIssues}
              onChange={(event) =>
                setGoals((current) => ({
                  ...current,
                  maxGrammarIssues: event.target.value,
                }))
              }
            />
          </label>
        </div>

        <div className="goals-grid">
          <GoalProgress
            label="Latest score"
            value={goalStatus.latestScore}
            target={goals.targetScore}
            suffix="/10"
          />
          <GoalProgress
            label="Latest readability"
            value={goalStatus.latestReadability}
            target={goals.targetReadability}
          />
          <GoalProgress
            label="Latest grammar issues"
            value={goalStatus.latestIssues}
            target={goals.maxGrammarIssues}
            reverse
          />
        </div>

        <div className="goal-summary">
          <strong>{goalStatus.reached}/3 goals reached</strong>
          <p>{goalStatus.message}</p>
        </div>
      </ChartCard>

      <div className="dashboard-grid">
        <ChartCard
          title="Score and Readability Trend"
          subtitle="A combined view of quality and readability over time"
          className="wide"
        >
          <ResponsiveContainer width="100%" height={330}>
            <AreaChart data={dashboardData.chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="label" stroke="var(--muted)" />
              <YAxis stroke="var(--muted)" />
              <Tooltip contentStyle={{ background: "var(--surface)", borderColor: "var(--border)" }} />
              <Area
                type="monotone"
                dataKey="readability"
                fill="#0f766e22"
                stroke="#0f766e"
                name="Readability"
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#4f46e5"
                strokeWidth={3}
                name="Score"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tone Mix" subtitle="Distribution of detected writing tone">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={dashboardData.toneData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={58}
                outerRadius={92}
                paddingAngle={3}
              >
                {dashboardData.toneData.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "var(--surface)", borderColor: "var(--border)" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="legend-list">
            {dashboardData.toneData.map((entry, index) => (
              <span key={entry.name}>
                <i style={{ background: COLORS[index % COLORS.length] }} />
                {entry.name}: {entry.value}
              </span>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Issues vs Suggestions" subtitle="How much feedback each essay needed">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dashboardData.chartRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="label" stroke="var(--muted)" />
              <YAxis stroke="var(--muted)" />
              <Tooltip contentStyle={{ background: "var(--surface)", borderColor: "var(--border)" }} />
              <Bar dataKey="grammarCount" fill="#e11d48" name="Grammar issues" radius={[6, 6, 0, 0]} />
              <Bar dataKey="suggestionCount" fill="#f59e0b" name="Suggestions" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Score vs Readability" subtitle="Find whether clearer essays score better">
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="readability" name="Readability" stroke="var(--muted)" />
              <YAxis dataKey="score" name="Score" domain={[0, 10]} stroke="var(--muted)" />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: "var(--surface)", borderColor: "var(--border)" }} />
              <Scatter name="Essays" data={dashboardData.chartRows} fill="#2563eb" />
            </ScatterChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="analytics-strip">
        <ChartCard title="Feedback Decisions" subtitle="Accepted and rejected AI suggestions">
          <div className="mini-stats-grid">
            <div>
              <span>Accepted</span>
              <strong>{dashboardData.feedbackStats.accepted}</strong>
            </div>
            <div>
              <span>Rejected</span>
              <strong>{dashboardData.feedbackStats.rejected}</strong>
            </div>
            <div>
              <span>Acceptance Rate</span>
              <strong>{dashboardData.feedbackStats.acceptanceRate}%</strong>
            </div>
            <div>
              <span>Pending</span>
              <strong>{dashboardData.feedbackStats.pending}</strong>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Readability Details" subtitle="Latest essay text metrics">
          <div className="mini-stats-grid">
            <div>
              <span>Words</span>
              <strong>{dashboardData.latestMetrics.wordCount}</strong>
            </div>
            <div>
              <span>Sentences</span>
              <strong>{dashboardData.latestMetrics.sentenceCount}</strong>
            </div>
            <div>
              <span>Avg Sentence</span>
              <strong>{dashboardData.latestMetrics.avgSentenceLength.toFixed(1)}</strong>
            </div>
            <div>
              <span>Lexical Diversity</span>
              <strong>{dashboardData.latestMetrics.lexicalDiversity.toFixed(2)}</strong>
            </div>
          </div>
        </ChartCard>
      </div>

      <div className="dashboard-grid">
        <ChartCard title="Writing Activity" subtitle="Streaks and writing rhythm">
          <div className="mini-stats-grid">
            <div>
              <span>Current Streak</span>
              <strong>{dashboardData.streaks.currentStreak}</strong>
            </div>
            <div>
              <span>Best Streak</span>
              <strong>{dashboardData.streaks.bestStreak}</strong>
            </div>
            <div>
              <span>Best Day</span>
              <strong>{dashboardData.streaks.bestDay}</strong>
            </div>
            <div>
              <span>This View</span>
              <strong>{filteredHistory.length}</strong>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Skill Breakdown" subtitle="Estimated writing strengths">
          <div className="skill-list">
            {dashboardData.skillProfile.map((skill) => (
              <div key={skill.name}>
                <span>{skill.name}</span>
                <strong>{skill.value}</strong>
                <div>
                  <i style={{ width: `${skill.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      </div>

      {essayOptions.length >= 2 && comparison && (
        <ChartCard
          title="Essay Comparison"
          subtitle="Pick any two essays and inspect how the writing changed"
          className="comparison-card"
        >
          <div className="comparison-controls">
            <label>
              <span>Baseline</span>
              <select value={compareA} onChange={(event) => setCompareA(event.target.value)}>
                {essayOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} - {formatDate(item.essay.createdAt)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Compare with</span>
              <select value={compareB} onChange={(event) => setCompareB(event.target.value)}>
                {essayOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} - {formatDate(item.essay.createdAt)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="comparison-summary">
            <div>
              <span>{comparison.first.title}</span>
              <strong>{comparison.first.essay.score ?? "N/A"}/10</strong>
              <small>{formatDate(comparison.first.essay.createdAt)}</small>
            </div>
            <div className="comparison-arrow">{"->"}</div>
            <div>
              <span>{comparison.second.title}</span>
              <strong>{comparison.second.essay.score ?? "N/A"}/10</strong>
              <small>{formatDate(comparison.second.essay.createdAt)}</small>
            </div>
          </div>

          <div className="comparison-metrics-grid">
            <ComparisonMetric
              label="Score"
              before={Number(comparison.first.essay.score || 0)}
              after={Number(comparison.second.essay.score || 0)}
              suffix="/10"
            />
            <ComparisonMetric
              label="Readability"
              before={getReadabilityValue(comparison.first.essay)}
              after={getReadabilityValue(comparison.second.essay)}
            />
            <ComparisonMetric
              label="Grammar Issues"
              before={getGrammarCount(comparison.first.essay)}
              after={getGrammarCount(comparison.second.essay)}
              reverse
            />
            <ComparisonMetric
              label="Suggestions"
              before={getSuggestionCount(comparison.first.essay)}
              after={getSuggestionCount(comparison.second.essay)}
              reverse
            />
          </div>

          <div className="comparison-foot">
            <p>{comparison.summary}</p>
            <div>
              <span>Words</span>
              <strong>
                {getWordCount(comparison.first.essay)} {"->"}{" "}
                {getWordCount(comparison.second.essay)}
              </strong>
            </div>
            <div>
              <span>Tone</span>
              <strong>
                {comparison.first.essay.tone || "Neutral"} {"->"}{" "}
                {comparison.second.essay.tone || "Neutral"}
              </strong>
            </div>
          </div>
        </ChartCard>
      )}

      <div className="dashboard-lower-grid">
        <ChartCard title="Recurring Weak Areas" subtitle="Most frequent issue categories">
          {dashboardData.issueTypes.length ? (
            <div className="weakness-list">
              {dashboardData.issueTypes.map((issue) => (
                <div key={issue.name}>
                  <span>{issue.name}</span>
                  <strong>{issue.count}</strong>
                  <div>
                    <i
                      style={{
                        width: `${Math.min(100, issue.count * 12)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-copy">No categorized grammar issues found yet.</p>
          )}
        </ChartCard>

        <ChartCard title="Issue Type Trends" subtitle="First half vs second half of filtered history">
          {dashboardData.issueTrend.length ? (
            <div className="trend-list">
              {dashboardData.issueTrend.map((item) => (
                <div key={item.name}>
                  <span>{item.name}</span>
                  <strong className={item.change <= 0 ? "good" : "warn"}>
                    {item.change > 0 ? "+" : ""}
                    {item.change}
                  </strong>
                  <small>
                    {item.before} before, {item.after} after
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-copy">More categorized issues are needed for trend analysis.</p>
          )}
        </ChartCard>

        <ChartCard title="Recent Essays" subtitle="Sortable, filtered essay records" className="table-card">
          <div className="essay-table-wrap">
            <table className="essay-table">
              <thead>
                <tr>
                  <th>Essay</th>
                  <th>Date</th>
                  <th>Score</th>
                  <th>Readability</th>
                  <th>Tone</th>
                  <th>Issues</th>
                  <th>Suggestions</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.slice(0, 8).map((essay, index) => (
                  <tr key={getEssayId(essay, index)}>
                    <td>{getEssayTitle(essay, index)}</td>
                    <td>{formatDate(essay.createdAt)}</td>
                    <td>
                      <strong>{essay.score ?? "N/A"}</strong>
                    </td>
                    <td>{getReadabilityValue(essay) || "N/A"}</td>
                    <td>{essay.tone || "Neutral"}</td>
                    <td>{getGrammarCount(essay)}</td>
                    <td>{getSuggestionCount(essay)}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="table-action"
                          onClick={() => setSelectedEssay(essay)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="table-action"
                          onClick={() => setCompareB(getEssayId(essay, index))}
                        >
                          Compare
                        </button>
                        <button
                          type="button"
                          className="danger-action small"
                          onClick={() => deleteEssayById(getEssayId(essay, index))}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      </div>

      {selectedEssay && (
        <div className="essay-detail-overlay" role="dialog" aria-modal="true">
          <section className="essay-detail-panel">
            <div className="essay-detail-header">
              <div>
                <p className="eyebrow">Essay detail</p>
                <h3>{getEssayTitle(selectedEssay, 0)}</h3>
                <p>{formatDate(selectedEssay.createdAt)}</p>
              </div>
              <div className="table-actions">
                <button
                  type="button"
                  className="danger-action"
                  onClick={() => deleteEssayById(getEssayId(selectedEssay, 0))}
                >
                  Delete
                </button>
                <button
                  type="button"
                  className="table-action"
                  onClick={() => setSelectedEssay(null)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="essay-detail-stats">
              <div>
                <span>Score</span>
                <strong>{selectedEssay.score ?? "N/A"}/10</strong>
              </div>
              <div>
                <span>Readability</span>
                <strong>{getReadabilityValue(selectedEssay) || "N/A"}</strong>
              </div>
              <div>
                <span>Tone</span>
                <strong>{selectedEssay.tone || "Neutral"}</strong>
              </div>
              <div>
                <span>Issues</span>
                <strong>{getGrammarCount(selectedEssay)}</strong>
              </div>
            </div>

            <div className="essay-detail-grid">
              <article>
                <h4>Original Essay</h4>
                <div className="essay-text-box">
                  {selectedEssay.raw_text || "No original text saved."}
                </div>
              </article>
              <article>
                <h4>Corrected Essay</h4>
                <div className="essay-text-box">
                  {selectedEssay.corrected_text || "No corrected text saved."}
                </div>
              </article>
            </div>

            <div className="essay-detail-grid">
              <article>
                <h4>Grammar Issues</h4>
                <div className="detail-list">
                  {(selectedEssay.grammar_issues || []).length ? (
                    selectedEssay.grammar_issues.map((issue, index) => (
                      <div key={`${issue.sentence}-${index}`}>
                        <strong>{issue.sentence || "Issue"}</strong>
                        <p>{issue.corrected || "No correction text available."}</p>
                      </div>
                    ))
                  ) : (
                    <p className="muted-copy">No grammar issues saved.</p>
                  )}
                </div>
              </article>
              <article>
                <h4>Suggestions</h4>
                <div className="detail-list">
                  {(selectedEssay.suggestions || []).length ? (
                    selectedEssay.suggestions.map((suggestion, index) => (
                      <div key={`${suggestion}-${index}`}>
                        <p>{suggestion}</p>
                      </div>
                    ))
                  ) : (
                    <p className="muted-copy">No suggestions saved.</p>
                  )}
                </div>
              </article>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
