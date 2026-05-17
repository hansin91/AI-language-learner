import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import api, { CHARACTER_IMAGES, formatApiError } from "@/lib/api";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MapPin, Play, ArrowLeft } from "lucide-react";

export default function Setup() {
  const { scenarioId } = useParams();
  const isCustom = scenarioId?.startsWith("custom-");
  const customId = isCustom ? scenarioId.slice("custom-".length) : null;

  const nav = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [language, setLanguage] = useState("en");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [voice, setVoice] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/catalog").then((r) => {
      setCatalog(r.data);
      if (!isCustom) {
        setScenario(r.data.scenarios.find((s) => s.id === scenarioId));
      }
    });
    if (isCustom && customId) {
      api.get(`/custom-scenarios/${customId}`)
        .then((r) => setScenario({ ...r.data, is_custom: true }))
        .catch(() => setError("Custom character not found"));
    }
  }, [scenarioId, isCustom, customId]);

  const start = async () => {
    setStarting(true);
    setError("");
    try {
      const body = isCustom
        ? { custom_id: customId, language, difficulty }
        : { scenario_id: scenarioId, language, difficulty };
      const { data } = await api.post("/sessions", body);
      sessionStorage.setItem(`voice-${data.id}`, voice ? "1" : "0");
      nav(`/chat/${data.id}`);
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail) || e.message);
      setStarting(false);
    }
  };

  if (!scenario || !catalog) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <Navbar />
        <div className="max-w-3xl mx-auto px-6 py-24 text-zinc-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-6 py-12">
        <Link to="/scenarios" className="text-sm text-zinc-400 hover:text-white inline-flex items-center gap-2 mb-8" data-testid="setup-back-link">
          <ArrowLeft size={14} /> Back to scenes
        </Link>

        <div className="grid md:grid-cols-[1.1fr_1fr] gap-10 items-start">
          <div className="relative rounded-2xl overflow-hidden border border-white/10 fade-up">
            <div
              className="aspect-[4/5] bg-cover bg-center"
              style={{ backgroundImage: `url(${CHARACTER_IMAGES[scenario.image_key]})` }}
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0a0a0a] to-transparent p-6">
              <Badge className="bg-[#d97736] text-[#0a0a0a] hover:bg-[#d97736] mb-3 rounded-full px-3 py-1 text-[10px] tracking-wider uppercase font-bold">
                {scenario.tone_label}
              </Badge>
              <h2 className="font-display font-black text-3xl tracking-tighter">{scenario.name}</h2>
              <div className="text-zinc-400 mt-1 flex items-center gap-1.5 text-sm">
                <MapPin size={12} /> {scenario.location}
              </div>
            </div>
          </div>

          <div className="space-y-7 fade-up">
            <div>
              <div className="eyebrow mb-2">Set the scene</div>
              <h1 className="font-display font-black text-3xl tracking-tighter mb-3">
                Tune your roleplay.
              </h1>
              <p className="text-zinc-400">{scenario.personality}</p>
            </div>

            <div>
              <Label className="text-zinc-300 mb-2 block">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger
                  className="bg-[#141414] border-white/10 text-white h-12"
                  data-testid="setup-language-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#141414] border-white/10 text-white">
                  {catalog.languages.map((l) => (
                    <SelectItem key={l.code} value={l.code} data-testid={`lang-option-${l.code}`}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-zinc-300 mb-2 block">Difficulty</Label>
              <div className="grid grid-cols-3 gap-3">
                {catalog.difficulties.map((d) => (
                  <button
                    key={d.code}
                    onClick={() => setDifficulty(d.code)}
                    data-testid={`difficulty-${d.code}`}
                    className={`px-4 py-3 rounded-xl border text-sm font-semibold transition ${
                      difficulty === d.code
                        ? "bg-[#d97736] text-[#0a0a0a] border-[#d97736]"
                        : "bg-[#141414] text-zinc-300 border-white/10 hover:border-white/30"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {catalog.difficulties.find((d) => d.code === difficulty)?.rules}
              </p>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-[#141414] border border-white/10">
              <div>
                <div className="font-semibold text-sm">Voice mode</div>
                <div className="text-xs text-zinc-500">Speak with the AI and hear it reply.</div>
              </div>
              <Switch checked={voice} onCheckedChange={setVoice} data-testid="setup-voice-toggle" />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3" data-testid="setup-error">
                {error}
              </div>
            )}

            <button
              onClick={start}
              disabled={starting}
              className="btn-primary w-full justify-center"
              data-testid="setup-start-btn"
            >
              <Play size={16} fill="currentColor" />
              {starting ? "Setting the stage…" : "Start the scene"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
