import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import Navbar from "@/components/Navbar";
import api, { API, CHARACTER_IMAGES, formatApiError } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Mic, MicOff, Send, MapPin, Square, Volume2, VolumeX, Flag, Repeat, X } from "lucide-react";

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

  // Pronunciation challenge state
  const [pronMsgIdx, setPronMsgIdx] = useState(null);
  const [pronRecording, setPronRecording] = useState(false);
  const [pronScoring, setPronScoring] = useState(false);
  const [pronResult, setPronResult] = useState(null);
  const [pronError, setPronError] = useState("");
  const pronRecorderRef = useRef(null);
  const pronChunksRef = useRef([]);
  const pronTextRef = useRef("");

  // Speaking speed (TTS) — persisted per session
  const [speed, setSpeed] = useState(1.0);

  // Accessibility: announce state changes to screen readers
  const [announce, setAnnounce] = useState("");
  // Track if browser/permission supports mic at all
  const [micSupported] = useState(
    () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined"
  );
  const [permissionHelp, setPermissionHelp] = useState(false);

  // Recording timer (for live aria-region & user feedback)
  const [recordingSec, setRecordingSec] = useState(0);
  const recordingTimerRef = useRef(null);

  const scrollRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioRef = useRef(null);

  useEffect(() => {
    setSpeakReply(sessionStorage.getItem(`voice-${sessionId}`) !== "0");
    const savedSpeed = parseFloat(sessionStorage.getItem(`speed-${sessionId}`) || "1");
    if (!Number.isNaN(savedSpeed) && savedSpeed >= 0.5 && savedSpeed <= 2) setSpeed(savedSpeed);
    api.get(`/sessions/${sessionId}`).then((r) => setSession(r.data)).catch(() => nav("/scenarios"));
  }, [sessionId, nav]);

  const changeSpeed = (v) => {
    setSpeed(v);
    sessionStorage.setItem(`speed-${sessionId}`, String(v));
  };

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
        body: JSON.stringify({ text, voice: session?.voice || "alloy", speed }),
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
  }, [session, speed]);

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
    setPermissionHelp(false);
    if (!micSupported) {
      setError("Your browser doesn't support audio recording. Use the text input instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      audioChunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && audioChunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        setRecordingSec(0);
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        await transcribe(blob);
      };
      mediaRecorderRef.current = rec;
      rec.start();
      setRecording(true);
      setAnnounce("Recording started. Press the microphone again, or press Space, to stop.");
      setRecordingSec(0);
      recordingTimerRef.current = setInterval(() => setRecordingSec((s) => s + 1), 1000);
    } catch (e) {
      if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
        setPermissionHelp(true);
        setError("Microphone permission denied.");
        setAnnounce("Microphone permission denied. Use the text field instead.");
      } else if (e?.name === "NotFoundError") {
        setError("No microphone found on this device. Use the text field instead.");
      } else {
        setError("Couldn't access the microphone. Use the text field instead.");
      }
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    setAnnounce("Recording stopped. Transcribing your speech.");
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
        setAnnounce(`Heard: ${text.trim()}`);
        await send(text.trim());
      } else {
        setError("Couldn't hear that — try again.");
        setAnnounce("No speech detected. Try speaking again.");
      }
    } catch (e) {
      setError(e.message);
      setAnnounce("Transcription failed.");
    } finally {
      setTranscribing(false);
    }
  };

  // Keyboard shortcut: Space toggles main mic (when not typing in input), Esc cancels
  useEffect(() => {
    const isTypingTarget = (el) => {
      const tag = (el?.tagName || "").toLowerCase();
      return tag === "input" || tag === "textarea" || el?.isContentEditable;
    };
    const onKey = (e) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === "Space" || e.key === " ") {
        if (transcribing || sending) return;
        e.preventDefault();
        if (recording) stopRecording();
        else startRecording();
      } else if (e.key === "Escape" && recording) {
        e.preventDefault();
        stopRecording();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, transcribing, sending, micSupported]);

  // Cleanup recording timer on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

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

  // ---- Pronunciation challenge ----
  const openPron = (idx, text) => {
    setPronMsgIdx(idx);
    setPronResult(null);
    setPronError("");
    pronTextRef.current = text;
  };

  const closePron = () => {
    if (pronRecording) {
      try { pronRecorderRef.current?.stop(); } catch {}
    }
    setPronMsgIdx(null);
    setPronResult(null);
    setPronError("");
    setPronRecording(false);
    setPronScoring(false);
  };

  const startPronRecording = async () => {
    setPronError("");
    setPronResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      pronChunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && pronChunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(pronChunksRef.current, { type: "audio/webm" });
        await scorePron(blob);
      };
      pronRecorderRef.current = rec;
      rec.start();
      setPronRecording(true);
    } catch {
      setPronError("Microphone access denied.");
    }
  };

  const stopPronRecording = () => {
    pronRecorderRef.current?.stop();
    setPronRecording(false);
  };

  const scorePron = async (blob) => {
    setPronScoring(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, "pron.webm");
      fd.append("reference_text", pronTextRef.current);
      fd.append("language", session?.language || "en");
      const token = localStorage.getItem("access_token");
      const resp = await fetch(`${API}/voice/pronunciation`, {
        method: "POST",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(formatApiError(j.detail) || "Pronunciation failed");
      }
      const data = await resp.json();
      setPronResult(data);
    } catch (e) {
      setPronError(e.message);
    } finally {
      setPronScoring(false);
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
              style={{ backgroundImage: `url(${CHARACTER_IMAGES[session.char?.image_key || session.scenario_id] || CHARACTER_IMAGES.immigration_officer})` }}
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
            <div
              className="hidden sm:flex items-center gap-1 bg-[#141414] border border-white/10 rounded-full p-1"
              data-testid="chat-speed-control"
              title="AI speaking speed"
            >
              {[
                { v: 0.75, label: "0.75x" },
                { v: 1.0, label: "1x" },
                { v: 1.25, label: "1.25x" },
              ].map((s) => (
                <button
                  key={s.v}
                  onClick={() => changeSpeed(s.v)}
                  className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full transition ${
                    speed === s.v
                      ? "bg-[#d97736] text-[#0a0a0a]"
                      : "text-zinc-400 hover:text-white"
                  }`}
                  data-testid={`chat-speed-${String(s.v).replace(".", "_")}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
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
            <div key={i} className="fade-up">
              <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "assistant" && (
                  <div
                    className="w-9 h-9 rounded-full bg-cover bg-center border border-white/10 mr-3 shrink-0"
                    style={{ backgroundImage: `url(${CHARACTER_IMAGES[session.char?.image_key || session.scenario_id] || CHARACTER_IMAGES.immigration_officer})` }}
                  />
                )}
                <div className="flex flex-col gap-1 max-w-[80%]">
                  <div className={m.role === "user" ? "bubble-user" : "bubble-ai"} data-testid={`msg-${i}`}>
                    {m.text}
                    {m.role === "assistant" && (
                      <span className="ml-2 inline-flex items-center gap-2">
                        <button
                          onClick={() => speakText(m.text, i)}
                          className="text-xs opacity-60 hover:opacity-100"
                          title="Play audio"
                          aria-label={playingMsg === i ? "Currently playing this message" : "Play this message as audio"}
                          data-testid={`play-msg-${i}`}
                        >
                          <Volume2 size={12} className={`inline ${playingMsg === i ? "text-[#d97736]" : ""}`} aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => openPron(i, m.text)}
                          className="text-xs opacity-60 hover:opacity-100"
                          title="Practice this line — Repeat after me"
                          aria-label="Practice pronouncing this line. Opens a recording panel."
                          data-testid={`pron-msg-${i}`}
                        >
                          <Repeat size={12} className="inline" aria-hidden="true" />
                        </button>
                      </span>
                    )}
                  </div>
                  {pronMsgIdx === i && (
                    <PronChallengePanel
                      text={m.text}
                      recording={pronRecording}
                      scoring={pronScoring}
                      result={pronResult}
                      error={pronError}
                      onStart={startPronRecording}
                      onStop={stopPronRecording}
                      onClose={closePron}
                    />
                  )}
                </div>
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
          {/* SR-only live region — announces recording/transcribe state */}
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="chat-aria-live">
            {announce}
          </div>

          {error && (
            <div
              className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5"
              role="alert"
              data-testid="chat-error"
            >
              {error}
              {permissionHelp && (
                <div className="mt-2 text-zinc-400 text-[11px] leading-relaxed">
                  To enable: click the <span className="text-white">🔒 lock</span> icon in your browser's address bar →
                  <span className="text-white"> Site settings</span> → set <span className="text-white">Microphone</span> to <span className="text-white">Allow</span>, then reload.
                </div>
              )}
            </div>
          )}

          {recording && (
            <div className="mb-3 flex items-center gap-2 text-xs text-[#d97736]" data-testid="recording-indicator">
              <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
              Recording · {String(Math.floor(recordingSec / 60)).padStart(2, "0")}:{String(recordingSec % 60).padStart(2, "0")} ·
              <span className="text-zinc-500">press Space or click to stop</span>
            </div>
          )}

          <div className="flex items-end gap-3">
            <button
              onClick={recording ? stopRecording : startRecording}
              disabled={transcribing || sending || !micSupported}
              className={`mic-btn shrink-0 ${recording ? "recording" : ""}`}
              title={
                !micSupported
                  ? "Microphone not supported"
                  : recording
                    ? "Stop recording (Space or Esc)"
                    : "Start recording (Space)"
              }
              aria-label={
                recording
                  ? `Stop voice recording. Currently recording for ${recordingSec} seconds.`
                  : "Start voice recording. Press Space to start or stop."
              }
              aria-pressed={recording}
              aria-keyshortcuts="Space Escape"
              data-testid="chat-mic-btn"
            >
              {transcribing ? (
                <span aria-hidden="true">
                  <span className="typing-dots"><span /><span /><span /></span>
                </span>
              ) : recording ? (
                <Square size={20} fill="currentColor" aria-hidden="true" />
              ) : (
                <Mic size={22} aria-hidden="true" />
              )}
              <span className="sr-only">
                {transcribing ? "Transcribing your speech" : recording ? "Recording — tap to stop" : "Voice input"}
              </span>
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

function PronChallengePanel({ text, recording, scoring, result, error, onStart, onStop, onClose }) {
  const scoreColor = (s) =>
    s >= 85 ? "text-emerald-400" : s >= 65 ? "text-[#d97736]" : "text-red-400";
  return (
    <div
      className="rounded-2xl bg-[#141414] border border-[#d97736]/40 p-4 mt-1 shadow-[0_0_20px_rgba(217,119,54,0.15)]"
      data-testid="pron-panel"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-[#d97736] font-bold flex items-center gap-1.5">
          <Repeat size={11} /> Repeat after me
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-white"
          title="Close"
          data-testid="pron-close-btn"
        >
          <X size={14} />
        </button>
      </div>

      <div className="text-sm text-zinc-300 mb-4 leading-relaxed italic">"{text}"</div>

      {!result && (
        <div className="flex items-center gap-3">
          <button
            onClick={recording ? onStop : onStart}
            disabled={scoring}
            className={`mic-btn ${recording ? "recording" : ""}`}
            style={{ width: 48, height: 48 }}
            aria-label={recording ? "Stop recording your pronunciation attempt" : "Start recording your pronunciation attempt"}
            aria-pressed={recording}
            title={recording ? "Stop recording" : "Start recording"}
            data-testid="pron-mic-btn"
          >
            {scoring ? (
              <span aria-hidden="true">
                <span className="typing-dots"><span /><span /><span /></span>
              </span>
            ) : recording ? (
              <Square size={16} fill="currentColor" aria-hidden="true" />
            ) : (
              <Mic size={18} aria-hidden="true" />
            )}
            <span className="sr-only">{recording ? "Recording" : "Record"}</span>
          </button>
          <div className="text-xs text-zinc-400" aria-live="polite">
            {scoring ? "Scoring…" : recording ? "Recording — tap to stop." : "Tap and say it out loud."}
          </div>
        </div>
      )}

      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}

      {result && (
        <div data-testid="pron-result">
          <div className="flex items-end gap-6 mb-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">Score</div>
              <div className={`font-display font-black text-4xl leading-none ${scoreColor(result.overall_score)}`} data-testid="pron-score">
                {result.overall_score}
              </div>
            </div>
            <div className="text-xs text-zinc-500 space-y-1">
              <div>Accuracy: <span className="text-white font-semibold">{result.accuracy}%</span></div>
              <div>Pace: <span className="text-white font-semibold">{result.pace_wpm || "—"} wpm</span></div>
            </div>
          </div>
          <Progress value={result.overall_score} className="h-1.5 bg-white/5 mb-3" />
          <div className="flex flex-wrap gap-1.5">
            {result.words.map((w, i) => (
              <span
                key={i}
                className={`px-2 py-0.5 rounded text-sm ${
                  w.status === "hit"
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-red-500/15 text-red-300 line-through"
                }`}
              >
                {w.word}
              </span>
            ))}
          </div>
          {result.transcript && (
            <div className="mt-3 text-[11px] text-zinc-500 italic">You said: "{result.transcript}"</div>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={onStart} className="btn-ghost text-xs" data-testid="pron-retry-btn">
              <Repeat size={11} /> Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
