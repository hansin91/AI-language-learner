import { Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import { HERO_IMAGE, CHARACTER_IMAGES } from "@/lib/api";
import { ArrowRight, Mic, MessagesSquare, Gauge, Globe2 } from "lucide-react";

const SAMPLE_CHARS = [
  { id: "immigration_officer", name: "Immigration Officer", tone: "Strict" },
  { id: "french_waiter", name: "French Waiter", tone: "Witty" },
  { id: "angry_customer", name: "Angry Customer", tone: "Furious" },
  { id: "job_interviewer", name: "Interviewer", tone: "Probing" },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/70 to-[#0a0a0a]" aria-hidden />
        <div className="hero-grid absolute inset-0 opacity-40" aria-hidden />

        <div className="relative max-w-7xl mx-auto px-6 pt-24 pb-32 lg:pt-32 lg:pb-40">
          <div className="max-w-3xl fade-up">
            <div className="eyebrow mb-5">Live language simulator · v1</div>
            <h1 className="font-display font-black text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tighter">
              Talk to <span className="text-[#d97736]">realistic people</span>,<br />
              not exercises.
            </h1>
            <p className="mt-7 text-lg lg:text-xl text-zinc-300 max-w-2xl leading-relaxed">
              Step into a roleplay with an immigration officer, a snooty French waiter, an
              angry customer, or a job interviewer. The AI adapts accent, slang, speed and
              emotion — so the moment you speak, it feels real.
            </p>

            <div className="mt-10 flex flex-wrap gap-4">
              <Link to="/register" className="btn-primary" data-testid="hero-start-btn">
                Start practicing free
                <ArrowRight size={16} />
              </Link>
              <Link to="/scenarios" className="btn-ghost text-sm" data-testid="hero-browse-btn">
                Browse scenarios
              </Link>
            </div>

            <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3 text-sm text-zinc-400">
              <span className="flex items-center gap-2"><Mic size={14} className="text-[#d97736]" /> Voice in & out</span>
              <span className="flex items-center gap-2"><Globe2 size={14} className="text-[#d97736]" /> EN · ES · FR</span>
              <span className="flex items-center gap-2"><Gauge size={14} className="text-[#d97736]" /> 3 difficulty levels</span>
              <span className="flex items-center gap-2"><MessagesSquare size={14} className="text-[#d97736]" /> Powered by Claude</span>
            </div>
          </div>
        </div>
      </section>

      {/* Cast preview */}
      <section className="relative max-w-7xl mx-auto px-6 py-24">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-10">
          <div>
            <div className="eyebrow mb-2">The cast</div>
            <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight">
              Eight characters. Eight scenes. Zero rehearsal.
            </h2>
          </div>
          <Link to="/scenarios" className="btn-ghost text-sm" data-testid="cast-browse-all-btn">
            See all 8 →
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 stagger">
          {SAMPLE_CHARS.map((c) => (
            <div
              key={c.id}
              className="scenario-card"
              style={{ backgroundImage: `url(${CHARACTER_IMAGES[c.id]})`, minHeight: 340 }}
              data-testid={`landing-char-${c.id}`}
            >
              <div className="scenario-card-content">
                <span className="eyebrow text-[#d97736] mb-1">{c.tone}</span>
                <div className="font-display font-bold text-2xl text-white">{c.name}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="relative bg-[#0d0d0d] border-y border-white/5 py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="eyebrow mb-2">How it works</div>
          <h2 className="font-display font-bold text-3xl sm:text-4xl tracking-tight mb-14">
            Pick a scene. Speak. Get real feedback.
          </h2>
          <div className="grid md:grid-cols-3 gap-8 stagger">
            {[
              { n: "01", t: "Choose your scene", d: "Eight handcrafted personas — each with a real-world setting, mood, and motive." },
              { n: "02", t: "Live conversation", d: "Type or speak. The AI replies in character with the right accent, slang and pace for your level." },
              { n: "03", t: "Coach review", d: "End the scene to get fluency, grammar, vocab scores plus exact phrase fixes." },
            ].map((s) => (
              <div key={s.n} className="p-7 rounded-2xl glass">
                <div className="font-display text-5xl font-black text-[#d97736] mb-4">{s.n}</div>
                <div className="font-display font-bold text-xl mb-2">{s.t}</div>
                <p className="text-zinc-400 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-4xl mx-auto px-6 py-28 text-center">
        <h2 className="font-display font-black text-4xl sm:text-5xl tracking-tighter">
          Your first scene is one click away.
        </h2>
        <p className="mt-5 text-lg text-zinc-400">
          Free to try. No credit card. Just press record.
        </p>
        <Link to="/register" className="btn-primary mt-9 inline-flex" data-testid="cta-bottom-btn">
          Step into a scene
          <ArrowRight size={16} />
        </Link>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-500">
        © 2026 Roleplay Simulator · Built for learners who hate textbooks.
      </footer>
    </div>
  );
}
