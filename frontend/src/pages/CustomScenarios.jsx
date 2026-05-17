import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import api, { CHARACTER_IMAGES, formatApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, MapPin, ArrowLeft, Sparkles, Play } from "lucide-react";

const VOICES = [
  { id: "alloy", label: "Alloy — neutral, balanced" },
  { id: "ash", label: "Ash — clear, articulate" },
  { id: "coral", label: "Coral — warm, friendly" },
  { id: "echo", label: "Echo — smooth, calm" },
  { id: "fable", label: "Fable — expressive, storyteller" },
  { id: "nova", label: "Nova — energetic, upbeat" },
  { id: "onyx", label: "Onyx — deep, authoritative" },
  { id: "sage", label: "Sage — wise, measured" },
  { id: "shimmer", label: "Shimmer — bright, cheerful" },
];

const IMAGE_KEYS = [
  "immigration_officer", "angry_customer", "french_waiter", "job_interviewer",
  "doctor", "partner", "landlord", "police_officer",
];

const BLANK = {
  name: "", tagline: "", location: "",
  personality: "", tone_label: "", voice: "alloy",
  image_key: "immigration_officer", opener: "",
};

export default function CustomScenarios() {
  const nav = useNavigate();
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reload = () => api.get("/custom-scenarios").then((r) => setList(r.data));

  useEffect(() => {
    reload();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/custom-scenarios", form);
      toast.success("Character saved");
      setForm(BLANK);
      setOpen(false);
      reload();
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm("Delete this character permanently?")) return;
    await api.delete(`/custom-scenarios/${id}`);
    toast.success("Deleted");
    reload();
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <Navbar />
      <div className="max-w-6xl mx-auto px-6 py-12">
        <Link to="/scenarios" className="text-sm text-zinc-400 hover:text-white inline-flex items-center gap-2 mb-6" data-testid="custom-back-link">
          <ArrowLeft size={14} /> Back to scenes
        </Link>

        <div className="flex items-end justify-between flex-wrap gap-6 mb-10 fade-up">
          <div>
            <div className="eyebrow mb-3">Director's chair</div>
            <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tighter">
              Write your own characters.
            </h1>
            <p className="mt-3 text-zinc-400 max-w-xl">
              Don't see the scene you need? Build a custom character — set their mood, voice, and the opening line. The AI will play them in any of 3 languages.
            </p>
          </div>
          <button onClick={() => setOpen((o) => !o)} className="btn-primary" data-testid="custom-new-btn">
            <Plus size={14} /> {open ? "Cancel" : "New character"}
          </button>
        </div>

        {open && (
          <form onSubmit={submit} className="rounded-2xl glass p-7 mb-10 space-y-6 fade-up" data-testid="custom-form">
            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <Label className="text-zinc-300 mb-2 block">Character name</Label>
                <Input
                  required maxLength={60} value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="bg-[#141414] border-white/10 text-white focus:border-[#d97736]"
                  placeholder="e.g. Berlin Techno DJ"
                  data-testid="custom-name-input"
                />
              </div>
              <div>
                <Label className="text-zinc-300 mb-2 block">Tagline</Label>
                <Input
                  required maxLength={140} value={form.tagline}
                  onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
                  className="bg-[#141414] border-white/10 text-white focus:border-[#d97736]"
                  placeholder="A one-line hook for the scene."
                  data-testid="custom-tagline-input"
                />
              </div>
              <div>
                <Label className="text-zinc-300 mb-2 block">Location</Label>
                <Input
                  required maxLength={120} value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  className="bg-[#141414] border-white/10 text-white focus:border-[#d97736]"
                  placeholder="e.g. Backstage at Berghain"
                  data-testid="custom-location-input"
                />
              </div>
              <div>
                <Label className="text-zinc-300 mb-2 block">Tone label</Label>
                <Input
                  required maxLength={40} value={form.tone_label}
                  onChange={(e) => setForm((f) => ({ ...f, tone_label: e.target.value }))}
                  className="bg-[#141414] border-white/10 text-white focus:border-[#d97736]"
                  placeholder="e.g. Cool · Aloof"
                  data-testid="custom-tone-input"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-zinc-300 mb-2 block">Personality (how they speak, behave)</Label>
                <Textarea
                  required minLength={10} maxLength={600} value={form.personality}
                  onChange={(e) => setForm((f) => ({ ...f, personality: e.target.value }))}
                  rows={4}
                  className="resize-none bg-[#141414] border-white/10 text-white focus:border-[#d97736]"
                  placeholder="Short, cool sentences. Uses Berlin slang. Doesn't make eye contact. Skeptical of small talk but warms up if you mention vinyl."
                  data-testid="custom-personality-input"
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-zinc-300 mb-2 block">Opening line (in your target language)</Label>
                <Textarea
                  required maxLength={400} value={form.opener}
                  onChange={(e) => setForm((f) => ({ ...f, opener: e.target.value }))}
                  rows={2}
                  className="resize-none bg-[#141414] border-white/10 text-white focus:border-[#d97736]"
                  placeholder="What they say to start the scene."
                  data-testid="custom-opener-input"
                />
              </div>
              <div>
                <Label className="text-zinc-300 mb-2 block">Voice</Label>
                <Select value={form.voice} onValueChange={(v) => setForm((f) => ({ ...f, voice: v }))}>
                  <SelectTrigger className="bg-[#141414] border-white/10 text-white h-11" data-testid="custom-voice-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#141414] border-white/10 text-white">
                    {VOICES.map((v) => (
                      <SelectItem key={v.id} value={v.id} data-testid={`custom-voice-${v.id}`}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-zinc-300 mb-2 block">Cover image</Label>
                <div className="grid grid-cols-4 gap-2">
                  {IMAGE_KEYS.map((k) => (
                    <button
                      key={k} type="button"
                      onClick={() => setForm((f) => ({ ...f, image_key: k }))}
                      className={`aspect-square rounded-lg bg-cover bg-center border-2 transition ${
                        form.image_key === k ? "border-[#d97736]" : "border-white/10 hover:border-white/30"
                      }`}
                      style={{ backgroundImage: `url(${CHARACTER_IMAGES[k]})` }}
                      data-testid={`custom-img-${k}`}
                      aria-label={k}
                    />
                  ))}
                </div>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-3" data-testid="custom-error">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving} className="btn-primary" data-testid="custom-save-btn">
                <Sparkles size={14} /> {saving ? "Saving…" : "Save character"}
              </button>
              <button type="button" onClick={() => { setOpen(false); setForm(BLANK); }} className="btn-ghost text-sm">
                Cancel
              </button>
            </div>
          </form>
        )}

        {list.length === 0 ? (
          !open && (
            <div className="rounded-2xl glass p-10 text-center">
              <div className="font-display font-bold text-xl mb-2">No custom characters yet.</div>
              <p className="text-sm text-zinc-500 mb-6">Click "New character" to write your own.</p>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 stagger">
            {list.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-white/10 bg-[#141414] overflow-hidden flex flex-col"
                data-testid={`custom-card-${c.id}`}
              >
                <div
                  className="aspect-[16/9] bg-cover bg-center relative"
                  style={{ backgroundImage: `url(${CHARACTER_IMAGES[c.image_key]})` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-[#141414] to-transparent" />
                  <Badge className="absolute top-3 left-3 bg-[#d97736] text-[#0a0a0a] hover:bg-[#d97736] rounded-full px-3 py-1 text-[10px] tracking-wider uppercase font-bold">
                    {c.tone_label}
                  </Badge>
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  <div className="font-display font-bold text-xl mb-1.5">{c.name}</div>
                  <div className="text-sm text-zinc-400 mb-3 line-clamp-2">{c.tagline}</div>
                  <div className="text-xs text-zinc-500 flex items-center gap-1.5 mb-4">
                    <MapPin size={11} /> {c.location}
                  </div>
                  <div className="flex gap-2 mt-auto">
                    <button
                      onClick={() => nav(`/setup/custom-${c.id}`)}
                      className="btn-primary text-xs py-2 px-4 flex-1 justify-center"
                      data-testid={`custom-play-${c.id}`}
                    >
                      <Play size={12} fill="currentColor" /> Play
                    </button>
                    <button
                      onClick={() => onDelete(c.id)}
                      className="btn-ghost text-xs p-2"
                      data-testid={`custom-delete-${c.id}`}
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
