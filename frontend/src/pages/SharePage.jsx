import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { API, CHARACTER_IMAGES } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Clapperboard, MapPin, Trophy, Sparkles, ArrowRight } from "lucide-react";

export default function SharePage() {
  const { shareId } = useParams();
  const [scene, setScene] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    axios.get(`${API}/share/${shareId}`).then(
      (r) => setScene(r.data),
      () => setError("This scene is no longer available."),
    );
  }, [shareId]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="font-display font-black text-4xl mb-3">404</div>
          <p className="text-zinc-400 mb-6">{error}</p>
          <Link to="/" className="btn-primary inline-flex">
            <Clapperboard size={14} /> Try Roleplay yourself
          </Link>
        </div>
      </div>
    );
  }

  if (!scene) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="typing-dots"><span /><span /><span /></div>
      </div>
    );
  }

  const fb = scene.feedback || {};

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Light public header */}
      <header className="sticky top-0 z-50 glass-strong border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5" data-testid="share-logo">
            <span className="w-9 h-9 rounded-xl bg-[#d97736] flex items-center justify-center text-[#0a0a0a]">
              <Clapperboard size={18} strokeWidth={2.5} />
            </span>
            <div className="leading-tight">
              <div className="font-display font-black text-lg tracking-tight">ROLEPLAY</div>
              <div className="eyebrow text-[10px] -mt-0.5">Live Simulator</div>
            </div>
          </Link>
          <Link to="/register" className="btn-primary text-sm" data-testid="share-cta-btn">
            <Sparkles size={14} /> Try your own scene
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Hero card */}
        <div className="rounded-3xl overflow-hidden border border-white/10 mb-8 fade-up" data-testid="share-hero">
          <div className="grid sm:grid-cols-[180px_1fr]">
            <div
              className="aspect-square sm:aspect-auto bg-cover bg-center"
              style={{ backgroundImage: `url(${CHARACTER_IMAGES[scene.scenario_id]})` }}
            />
            <div className="p-6 bg-[#141414]">
              <div className="eyebrow mb-2">Shared scene</div>
              <h1 className="font-display font-black text-3xl tracking-tighter">{scene.scenario_name}</h1>
              {scene.tone_label && (
                <Badge className="mt-3 bg-[#d97736] text-[#0a0a0a] hover:bg-[#d97736] rounded-full px-3 py-1 text-[10px] tracking-wider uppercase font-bold">
                  {scene.tone_label}
                </Badge>
              )}
              <div className="text-xs text-zinc-500 mt-3 flex items-center gap-1.5">
                <MapPin size={12} />
                {scene.language.toUpperCase()} · {scene.difficulty}
              </div>
              {scene.owner_name && (
                <p className="text-sm text-zinc-400 mt-4">
                  Performed by <span className="text-white font-semibold">{scene.owner_name}</span>
                </p>
              )}
              {fb.overall_score !== undefined && (
                <div className="mt-4 inline-flex items-center gap-3 px-4 py-2.5 rounded-full bg-[#0a0a0a] border border-white/10">
                  <Trophy size={14} className="text-[#d97736]" />
                  <span className="text-sm text-zinc-400">Score</span>
                  <span className="font-display font-black text-2xl text-[#d97736]" data-testid="share-score">
                    {fb.overall_score}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Transcript */}
        <h2 className="font-display font-bold text-2xl mb-4 tracking-tight">Transcript</h2>
        <div className="space-y-4 relative film-grain p-6 rounded-2xl bg-[#0d0d0d] border border-white/5">
          <div className="relative z-[2] space-y-4">
            {scene.messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div
                    className="w-9 h-9 rounded-full bg-cover bg-center border border-white/10 mr-3 shrink-0"
                    style={{ backgroundImage: `url(${CHARACTER_IMAGES[scene.scenario_id]})` }}
                  />
                )}
                <div className={m.role === "user" ? "bubble-user" : "bubble-ai"} data-testid={`share-msg-${i}`}>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-12 rounded-3xl glass p-8 text-center fade-up">
          <h3 className="font-display font-black text-3xl tracking-tighter mb-2">
            Want to try your own scene?
          </h3>
          <p className="text-zinc-400 mb-6">
            Practice languages by talking to realistic people — not exercises.
          </p>
          <Link to="/register" className="btn-primary inline-flex" data-testid="share-bottom-cta">
            Start free <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
