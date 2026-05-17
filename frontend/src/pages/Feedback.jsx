import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import api from "@/lib/api";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, MessagesSquare, RotateCcw, LayoutDashboard, Sparkles } from "lucide-react";

function ScoreBar({ label, value }) {
  return (
    <div data-testid={`score-${label.toLowerCase()}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">{label}</span>
        <span className="text-sm font-bold text-[#d97736]">{value}</span>
      </div>
      <Progress value={value} className="h-2 bg-white/5" />
    </div>
  );
}

export default function Feedback() {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const [sess, setSess] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get(`/sessions/${sessionId}`);
        if (!data.feedback) {
          // request feedback
          const r = await api.post(`/sessions/${sessionId}/end`);
          setSess({ ...data, feedback: r.data.feedback, ended: true });
        } else {
          setSess(data);
        }
      } catch {
        nav("/dashboard");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [sessionId, nav]);

  if (loading || !sess) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <Navbar />
        <div className="max-w-3xl mx-auto px-6 py-24">
          <h2 className="font-display font-bold text-2xl mb-3">Your coach is reviewing the scene…</h2>
          <div className="typing-dots"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  const fb = sess.feedback || {};

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="eyebrow mb-3">Scene · review</div>
        <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mb-2">
          That's a wrap.
        </h1>
        <p className="text-zinc-400 mb-10">
          Your performance as a {sess.language.toUpperCase()} learner with{" "}
          <span className="text-white font-semibold">{sess.scenario_name}</span>.
        </p>

        {/* Score */}
        <div className="rounded-3xl glass p-8 mb-8 fade-up" data-testid="feedback-score-card">
          <div className="flex items-center gap-8 flex-wrap">
            <div>
              <div className="eyebrow mb-2">Overall</div>
              <div className="font-display font-black text-7xl text-[#d97736] leading-none" data-testid="feedback-overall-score">
                {fb.overall_score ?? 0}
              </div>
              <div className="text-xs text-zinc-500 mt-1">out of 100</div>
            </div>
            <div className="flex-1 min-w-[260px] space-y-4">
              <ScoreBar label="Fluency" value={fb.fluency ?? 0} />
              <ScoreBar label="Grammar" value={fb.grammar ?? 0} />
              <ScoreBar label="Vocabulary" value={fb.vocabulary ?? 0} />
            </div>
          </div>

          {fb.summary && (
            <p className="mt-7 text-zinc-300 leading-relaxed border-t border-white/5 pt-6" data-testid="feedback-summary">
              {fb.summary}
            </p>
          )}
        </div>

        {/* Strengths */}
        {fb.strengths?.length > 0 && (
          <div className="mb-8 fade-up">
            <h3 className="font-display font-bold text-xl mb-4 flex items-center gap-2">
              <CheckCircle2 size={20} className="text-[#2e8b57]" /> What you did well
            </h3>
            <ul className="space-y-2 text-zinc-300">
              {fb.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-2.5" data-testid={`strength-${i}`}>
                  <span className="text-[#2e8b57] mt-1">▸</span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Corrections */}
        {fb.corrections?.length > 0 && (
          <div className="mb-8 fade-up">
            <h3 className="font-display font-bold text-xl mb-4">Fix-ups</h3>
            <div className="space-y-3">
              {fb.corrections.map((c, i) => (
                <div key={i} className="rounded-2xl bg-[#141414] border border-white/10 p-5" data-testid={`correction-${i}`}>
                  <div className="text-sm text-red-300 line-through opacity-70">{c.original}</div>
                  <div className="text-sm text-emerald-300 mt-1">{c.fixed}</div>
                  {c.note && <div className="text-xs text-zinc-500 mt-2">{c.note}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Vocab */}
        {fb.vocab_suggestions?.length > 0 && (
          <div className="mb-8 fade-up">
            <h3 className="font-display font-bold text-xl mb-4 flex items-center gap-2">
              <Sparkles size={18} className="text-[#d97736]" /> Try these next time
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {fb.vocab_suggestions.map((v, i) => (
                <div key={i} className="rounded-2xl bg-[#141414] border border-white/10 p-4" data-testid={`vocab-${i}`}>
                  <div className="font-semibold">{v.phrase}</div>
                  <div className="text-xs text-zinc-500 mt-1">{v.meaning}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-4">
          <Link to={`/setup/${sess.scenario_id}`} className="btn-primary" data-testid="feedback-replay-btn">
            <RotateCcw size={14} /> Try this scene again
          </Link>
          <Link to="/scenarios" className="btn-ghost text-sm" data-testid="feedback-newscene-btn">
            <MessagesSquare size={14} /> Pick a different scene
          </Link>
          <Link to="/dashboard" className="btn-ghost text-sm" data-testid="feedback-dashboard-btn">
            <LayoutDashboard size={14} /> Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
