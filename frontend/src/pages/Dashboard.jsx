import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import api, { CHARACTER_IMAGES } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { MessagesSquare, Trophy, Flame, Compass, ChevronRight } from "lucide-react";

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-2xl glass p-6" data-testid={`stat-${label.replace(/\s/g, "-").toLowerCase()}`}>
      <div className="flex items-center gap-3 mb-3 text-zinc-400">
        <Icon size={16} className="text-[#d97736]" />
        <span className="eyebrow text-[10px]">{label}</span>
      </div>
      <div className="font-display font-black text-4xl tracking-tight">{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);

  useEffect(() => {
    Promise.all([api.get("/stats/me"), api.get("/sessions")]).then(([s, l]) => {
      setStats(s.data);
      setSessions(l.data);
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="eyebrow mb-3">Studio · welcome back</div>
        <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter mb-2">
          Hey {user?.name || "there"}.
        </h1>
        <p className="text-zinc-400 mb-10">Here's the tape from your recent scenes.</p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-12 stagger">
          <StatCard icon={MessagesSquare} label="Total scenes" value={stats?.total_sessions ?? 0} />
          <StatCard icon={Flame} label="Completed" value={stats?.completed_sessions ?? 0} sub="with coach review" />
          <StatCard icon={Trophy} label="Avg score" value={stats?.average_score ?? 0} sub="out of 100" />
          <StatCard icon={Compass} label="Characters tried" value={stats?.scenarios_tried ?? 0} sub="of 8" />
        </div>

        <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
          <h2 className="font-display font-bold text-2xl tracking-tight">Recent scenes</h2>
          <Link to="/scenarios" className="btn-primary text-sm" data-testid="dashboard-new-scene-btn">
            New scene
          </Link>
        </div>

        {sessions.length === 0 ? (
          <div className="rounded-2xl glass p-10 text-center">
            <div className="text-zinc-300 mb-2 font-semibold">No scenes yet.</div>
            <p className="text-sm text-zinc-500 mb-6">Pick a character and step in — your first conversation is free.</p>
            <Link to="/scenarios" className="btn-primary inline-flex" data-testid="dashboard-empty-cta">
              Browse scenarios
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <Link
                key={s.id}
                to={s.feedback ? `/feedback/${s.id}` : `/chat/${s.id}`}
                className="group flex items-center gap-4 rounded-2xl bg-[#141414] border border-white/10 hover:border-white/30 p-4 transition"
                data-testid={`session-row-${s.id}`}
              >
                <div
                  className="w-14 h-14 rounded-xl bg-cover bg-center border border-white/10 shrink-0"
                  style={{ backgroundImage: `url(${CHARACTER_IMAGES[s.scenario_id]})` }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-lg leading-tight">{s.scenario_name}</div>
                  <div className="text-xs text-zinc-500 mt-1">
                    {s.language.toUpperCase()} · {s.difficulty} · {new Date(s.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="text-right">
                  {s.feedback ? (
                    <div className="text-2xl font-display font-black text-[#d97736]">{s.feedback.overall_score}</div>
                  ) : (
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">In progress</span>
                  )}
                </div>
                <ChevronRight size={16} className="text-zinc-500 group-hover:text-white" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
