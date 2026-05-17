import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import api, { CHARACTER_IMAGES } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus, Wand2 } from "lucide-react";

export default function Scenarios() {
  const [data, setData] = useState({ scenarios: [], languages: [], difficulties: [] });
  const [customs, setCustoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    Promise.all([api.get("/catalog"), api.get("/custom-scenarios").catch(() => ({ data: [] }))]).then(([cat, cust]) => {
      setData(cat.data);
      setCustoms(cust.data || []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-10 fade-up">
          <div>
            <div className="eyebrow mb-3">Browse · 8 scenes + custom</div>
            <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter">
              Pick a scene to step into.
            </h1>
            <p className="mt-3 text-zinc-400 max-w-xl">
              Each character speaks differently. Some are formal. Some are furious. All of them will make you better.
            </p>
          </div>
          <Link to="/custom-scenarios" className="btn-ghost text-sm" data-testid="scenarios-custom-link">
            <Wand2 size={14} className="inline mr-1.5" /> My custom characters
          </Link>
        </div>

        {loading ? (
          <div className="text-zinc-500">Loading scenes…</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 stagger">
              {data.scenarios.map((s) => (
                <button
                  key={s.id}
                  onClick={() => nav(`/setup/${s.id}`)}
                  className="scenario-card text-left"
                  style={{ backgroundImage: `url(${CHARACTER_IMAGES[s.image_key]})` }}
                  data-testid={`scenario-card-${s.id}`}
                >
                  <div className="scenario-card-content">
                    <Badge className="self-start bg-[#d97736] text-[#0a0a0a] hover:bg-[#d97736] mb-3 rounded-full px-3 py-1 text-[10px] tracking-wider uppercase font-bold">
                      {s.tone_label}
                    </Badge>
                    <div className="font-display font-black text-2xl text-white leading-tight mb-1.5">
                      {s.name}
                    </div>
                    <div className="text-sm text-zinc-300 line-clamp-2 mb-3">{s.tagline}</div>
                    <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <MapPin size={12} />
                      {s.location}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom section */}
            <div className="mt-16 flex items-end justify-between gap-4 mb-6">
              <div>
                <div className="eyebrow mb-2">Your custom characters</div>
                <h2 className="font-display font-bold text-2xl tracking-tight">Director's chair</h2>
              </div>
              <Link to="/custom-scenarios" className="btn-primary text-sm" data-testid="scenarios-create-custom-btn">
                <Plus size={14} /> Create
              </Link>
            </div>

            {customs.length === 0 ? (
              <Link
                to="/custom-scenarios"
                className="block rounded-2xl border border-dashed border-white/15 hover:border-[#d97736] p-10 text-center text-zinc-400 hover:text-white transition"
                data-testid="custom-empty-cta"
              >
                <Wand2 size={28} className="mx-auto mb-3 text-[#d97736]" />
                <div className="font-display font-bold text-lg text-white mb-1">No custom characters yet</div>
                <p className="text-sm">Build your own scene — set the mood, voice, and opening line.</p>
              </Link>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 stagger">
                {customs.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => nav(`/setup/custom-${c.id}`)}
                    className="scenario-card text-left"
                    style={{ backgroundImage: `url(${CHARACTER_IMAGES[c.image_key]})` }}
                    data-testid={`scenario-custom-card-${c.id}`}
                  >
                    <div className="scenario-card-content">
                      <Badge className="self-start bg-white/15 text-white hover:bg-white/15 mb-3 rounded-full px-3 py-1 text-[10px] tracking-wider uppercase font-bold border border-white/20">
                        Custom · {c.tone_label}
                      </Badge>
                      <div className="font-display font-black text-2xl text-white leading-tight mb-1.5">
                        {c.name}
                      </div>
                      <div className="text-sm text-zinc-300 line-clamp-2 mb-3">{c.tagline}</div>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <MapPin size={12} />
                        {c.location}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
