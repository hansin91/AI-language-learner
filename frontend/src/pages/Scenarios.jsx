import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/Navbar";
import api, { CHARACTER_IMAGES } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";

export default function Scenarios() {
  const [data, setData] = useState({ scenarios: [], languages: [], difficulties: [] });
  const [loading, setLoading] = useState(true);
  const nav = useNavigate();

  useEffect(() => {
    api.get("/catalog").then((r) => {
      setData(r.data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-6 py-14">
        <div className="flex items-end justify-between flex-wrap gap-6 mb-10 fade-up">
          <div>
            <div className="eyebrow mb-3">Browse · 8 scenes</div>
            <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter">
              Pick a scene to step into.
            </h1>
            <p className="mt-3 text-zinc-400 max-w-xl">
              Each character speaks differently. Some are formal. Some are furious. All of them will make you better.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-zinc-500">Loading scenes…</div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
