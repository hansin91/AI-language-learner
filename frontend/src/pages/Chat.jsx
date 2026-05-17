import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import api, { API, CHARACTER_IMAGES, formatApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Mic, MicOff, Send, MapPin, Square, Volume2, VolumeX, Flag } from "lucide-react";

export default function Chat() {
  const { sessionId } = useParams();
  const nav = useNavigate();
  const [session, setSession] = useState(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speakReply, setSpeakReply] = useState(true);
  const [ending, setEnding] = useState(false);
  const [playingMsg, setPlayingMsg] = useState(null);

  const scrollRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);

  useEffect(() => {
    setSpeakReply(sessionStorage.getItem(`voice-${sessionId}`) !== "0");
    api.get(`/sessions/${sessionId}`).then((r) => setSession(r.data)).catch(() => nav("/scenarios"));
  }, [sessionId, nav]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session]);

  // Auto-speak the very first AI opener once
  const openerSpokenRef = useRef(false);
  useEffect(() => {
    if (!session || openerSpokenRef.current || !speakReply) return;
    const first = session.messages?.[0];
    if (first && first.role === "assistant") {
      openerSpokenRef.current = true;
      speakText(first.text, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, speakReply]);

  const speakText = useCallback(async (text, msgIdx) => {
    if (!text) return;
    try {
      setPlayingMsg(msgIdx);
      const token = localStorage.getItem("access_token");
      const resp = await fetch(`${API}/voice/tts`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, voice: session?.voice || "alloy" }),
      });
      if (!resp.ok) throw new Error("TTS failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setPlayingMsg(null);
      await audioRef.current.play();
    } catch (e) {
      setPlayingMsg(null);
    }
  }, [session]);

  const send = async (text) => {
    const t = (text ?? input).trim();
    if (!t || sending) return;
    setSending(true);
    setError("");
    // optimistic
    setSession((s) => ({
      ...s,
      messages: [...s.messages, { role: "user", text: t, created_at: new Date().toISOString() }],
    }));
    setInput("");
    try {
      const { data } = await api.post("/chat/send", { session_id: sessionId, text: t });
      setSession((s) => {
        const newMsgs = [...s.messages, {
          role: "assistant", text: data.reply, created_at: new Date().toISOString(),
        }];
        if (speakReply) speakText(data.reply, newMsgs.length - 1);
        return { ...s, messages: newMsgs };
      });
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail) || e.message);
      // rollback the optimistic user msg
      setSession((s) => ({ ...s, messages: s.messages.slice(0, -1) }));
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && audioChunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await transcribe(blob);
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e) {
      setError("Microphone access denied. Use text instead.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const transcribe = async (blob) => {
    setTranscribing(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, "voice.webm");
      fd.append("language", session?.language || "en");
      const token = localStorage.getItem("access_token");
      const resp = await fetch(`${API}/voice/transcribe`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(formatApiError(j.detail) || "Transcribe failed");
      }
      const { text } = await resp.json();
      if (text && text.trim()) {
        await send(text.trim());
      } else {
        setError("Couldn't hear that — try again.");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setTranscribing(false);
    }
  };

  const endScene = async () => {
    if (ending) return;
    setEnding(true);
    try {
      await api.post(`/sessions/${sessionId}/end`);
      nav(`/feedback/${sessionId}`);
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail) || e.message);
      setEnding(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white">
        <Navbar />
        <div className="max-w-3xl mx-auto px-6 py-24 text-zinc-500">Curtain rising…</div>
      </div>
    );
  }

  const userCount = session.messages.filter((m) => m.role === "user").length;

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      <Navbar minimal />

      {/* Scene strip */}
      <div className="border-b border-white/5 bg-[#0d0d0d]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-full bg-cover bg-center border border-white/10"
              style={{ backgroundImage: `url(${CHARACTER_IMAGES[session.scenario_id]})` }}
              data-testid="chat-character-avatar"
            />
            <div>
              <div className="font-display font-bold text-xl leading-tight">{session.scenario_name}</div>
              <div className="text-xs text-zinc-500 flex items-center gap-1.5 mt-0.5">
                <MapPin size={11} />
                {session.language.toUpperCase()} · {session.difficulty}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSpeakReply((v) => !v)}
              className="btn-ghost text-xs"
              title="Toggle TTS"
              data-testid="chat-tts-toggle"
            >
              {speakReply ? <Volume2 size={14} /> : <VolumeX size={14} />}
              <span className="ml-1.5">{speakReply ? "Voice on" : "Voice off"}</span>
            </button>
            <button
              onClick={endScene}
              disabled={ending || userCount === 0}
              className="btn-primary text-xs py-2 px-4"
              data-testid="chat-end-btn"
            >
              <Flag size={13} />
              {ending ? "Wrapping…" : "End & review"}
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto relative film-grain">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-5 relative z-[2]">
          {session.messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} fade-up`}>
              {m.role === "assistant" && (
                <div
                  className="w-9 h-9 rounded-full bg-cover bg-center border border-white/10 mr-3 shrink-0"
                  style={{ backgroundImage: `url(${CHARACTER_IMAGES[session.scenario_id]})` }}
                />
              )}
              <div className={m.role === "user" ? "bubble-user" : "bubble-ai"} data-testid={`msg-${i}`}>
                {m.text}
                {m.role === "assistant" && (
                  <button
                    onClick={() => speakText(m.text, i)}
                    className="ml-2 text-xs opacity-60 hover:opacity-100"
                    title="Play"
                    data-testid={`play-msg-${i}`}
                  >
                    <Volume2 size={12} className={`inline ${playingMsg === i ? "text-[#d97736]" : ""}`} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bubble-ai">
                <div className="typing-dots"><span /><span /><span /></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-white/5 glass-strong">
        <div className="max-w-3xl mx-auto px-6 py-5">
          {error && (
            <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5" data-testid="chat-error">
              {error}
            </div>
          )}
          <div className="flex items-end gap-3">
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={transcribing || sending}
              className={`mic-btn shrink-0 ${recording ? "recording" : ""}`}
              title={recording ? "Stop" : "Speak"}
              data-testid="chat-mic-btn"
            >
              {transcribing ? (
                <div className="typing-dots"><span /><span /><span /></div>
              ) : recording ? (
                <Square size={20} fill="currentColor" />
              ) : (
                <Mic size={22} />
              )}
            </button>

            <div className="flex-1">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={recording ? "Listening…" : "Type your line, or press the mic and speak."}
                rows={1}
                className="resize-none bg-[#141414] border-white/10 text-white focus:border-[#d97736] min-h-[48px] max-h-32 py-3"
                data-testid="chat-input"
              />
            </div>

            <button
              onClick={() => send()}
              disabled={sending || !input.trim()}
              className="btn-primary shrink-0"
              data-testid="chat-send-btn"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
