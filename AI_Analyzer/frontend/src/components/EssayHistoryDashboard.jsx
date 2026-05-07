import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, Legend, ScatterChart, Scatter
} from "recharts";
import { motion } from "framer-motion";

export default function EssayHistoryDashboard() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data } = await axios.get(`/api/essay/history`);
        setHistory(data);
      } catch (err) {
        console.error("Error loading history:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  if (loading) return <div className="text-center p-6">Loading history...</div>;
  if (!history.length) return <div className="text-center p-6 text-gray-500">No essay history found.</div>;

  const sortedHistory = [...history].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  const COLORS = ["#6366F1", "#F59E0B", "#10B981", "#EF4444", "#3B82F6"];

  const toneData = Object.entries(
    sortedHistory.reduce((acc, item) => {
      const t = item.tone || "Neutral";
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {})
  ).map(([tone, value]) => ({ name: tone, value }));

  const monthlyData = Object.entries(
    sortedHistory.reduce((acc, e) => {
      const month = new Date(e.createdAt).toLocaleString("en-IN", { month: "short" });
      acc[month] = (acc[month] || 0) + 1;
      return acc;
    }, {})
  ).map(([month, count]) => ({ month, count }));

  const avgScore = (sortedHistory.reduce((a, b) => a + (b.score || 0), 0) / sortedHistory.length).toFixed(1);
  const avgRead = (sortedHistory.reduce((a, b) => a + (b.readability || 0), 0) / sortedHistory.length).toFixed(1);
  const commonTone = toneData.sort((a, b) => b.value - a.value)[0]?.name || "N/A";

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-10">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-3xl font-bold mb-2">📊 Essay History Dashboard</h2>
        <p className="text-sm text-gray-400">Track your progress, tone balance, and writing quality trends</p>
      </motion.div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div whileHover={{ scale: 1.05 }} className="stat-card">📚 Total Essays<br /><span>{history.length}</span></motion.div>
        <motion.div whileHover={{ scale: 1.05 }} className="stat-card">⭐ Avg Score<br /><span>{avgScore}</span></motion.div>
        <motion.div whileHover={{ scale: 1.05 }} className="stat-card">🧠 Avg Readability<br /><span>{avgRead}</span></motion.div>
        <motion.div whileHover={{ scale: 1.05 }} className="stat-card">🎭 Common Tone<br /><span>{commonTone}</span></motion.div>
      </div>

      {/* Score Trend */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
        <div className="card p-4">
          <h3 className="text-lg font-semibold mb-3">Score Trend Over Time</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={sortedHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={(item) => new Date(item.createdAt).toLocaleDateString()} angle={-25} textAnchor="end" height={60} />
              <YAxis domain={[0, 10]} />
              <Tooltip />
              <Line type="monotone" dataKey="score" stroke="#6366F1" strokeWidth={3} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Grammar Issues */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
        <div className="card p-4">
          <h3 className="text-lg font-semibold mb-3">Grammar Issues per Essay</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sortedHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={(i) => new Date(i.createdAt).toLocaleDateString()} />
              <YAxis />
              <Tooltip />
              <Bar dataKey={(i) => i.grammar_issues?.length || 0} fill="#EF4444" barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Suggestions */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
        <div className="card p-4">
          <h3 className="text-lg font-semibold mb-3">AI Suggestions Count</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sortedHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={(i) => new Date(i.createdAt).toLocaleDateString()} />
              <YAxis />
              <Tooltip />
              <Bar dataKey={(i) => i.suggestions?.length || 0} fill="#F59E0B" barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Score vs Readability */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
        <div className="card p-4">
          <h3 className="text-lg font-semibold mb-3">Score vs Readability</h3>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="readability" name="Readability" />
              <YAxis dataKey="score" name="Score" domain={[0, 10]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Scatter name="Essays" data={sortedHistory} fill="#3B82F6" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Monthly Upload Activity */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        <div className="card p-4">
          <h3 className="text-lg font-semibold mb-3">Monthly Essay Uploads</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#6366F1" barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Tone Distribution */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
        <div className="card p-4">
          <h3 className="text-lg font-semibold mb-3">Tone Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={toneData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                {toneData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      <style>{`
        .card {
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          box-shadow: 0 6px 18px rgba(2,6,23,0.08);
        }
        .stat-card {
          background: rgba(255,255,255,0.05);
          border-radius: 10px;
          padding: 16px;
          text-align: center;
          font-weight: 500;
          box-shadow: 0 3px 10px rgba(0,0,0,0.1);
        }
        .stat-card span {
          display: block;
          font-size: 1.4rem;
          font-weight: bold;
          color: #6366F1;
        }
      `}</style>
    </div>
  );
}
