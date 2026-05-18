from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import re
import json
import uuid
import secrets
import logging
import tempfile
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Form
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText, OpenAITextToSpeech

from auth import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    set_auth_cookies, clear_auth_cookies, get_current_user,
    check_lockout, record_failed_attempt, clear_attempts,
)
from scenarios import (
    SCENARIOS, LANGUAGES, DIFFICULTIES,
    build_system_prompt, build_system_prompt_from_char, build_feedback_prompt,
)

# ----- Setup -----
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
CLAUDE_MODEL = "claude-sonnet-4-5-20250929"

app = FastAPI(title="AI Roleplay Simulator")
api_router = APIRouter(prefix="/api")


# ----- Models -----
class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: str = "user"
    created_at: str


class SessionStartRequest(BaseModel):
    scenario_id: Optional[str] = None
    custom_id: Optional[str] = None
    language: Literal["en", "es", "fr"] = "en"
    difficulty: Literal["beginner", "intermediate", "advanced"] = "intermediate"


class CustomScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    tagline: str = Field(min_length=1, max_length=140)
    location: str = Field(min_length=1, max_length=120)
    personality: str = Field(min_length=10, max_length=600)
    tone_label: str = Field(min_length=1, max_length=40)
    voice: Literal["alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"] = "alloy"
    image_key: str = Field(default="immigration_officer")
    opener: str = Field(min_length=1, max_length=400)


class PronunciationResult(BaseModel):
    overall_score: int
    accuracy: int
    pace_wpm: int
    transcript: str
    words: List[dict]


class SessionMessage(BaseModel):
    role: Literal["user", "assistant"]
    text: str
    created_at: str


class SessionOut(BaseModel):
    id: str
    scenario_id: str
    scenario_name: str
    language: str
    difficulty: str
    voice: str
    messages: List[SessionMessage]
    created_at: str
    ended: bool = False


class ChatSendRequest(BaseModel):
    session_id: str
    text: str = Field(min_length=1, max_length=2000)


class ChatSendResponse(BaseModel):
    reply: str
    tone_label: str
    voice: str


class TtsRequest(BaseModel):
    text: str
    voice: str = "alloy"
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


# ----- Helpers -----
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _user_public(user_doc: dict) -> dict:
    return {
        "id": user_doc["id"],
        "name": user_doc["name"],
        "email": user_doc["email"],
        "role": user_doc.get("role", "user"),
        "created_at": user_doc["created_at"],
    }


async def _current_user(request: Request) -> dict:
    return await get_current_user(request, db)


# ----- Public catalog -----
@api_router.get("/")
async def root():
    return {"app": "AI Roleplay Simulator", "status": "ok"}


@api_router.get("/catalog")
async def catalog():
    return {
        "scenarios": list(SCENARIOS.values()),
        "languages": list(LANGUAGES.values()),
        "difficulties": list(DIFFICULTIES.values()),
    }


# ----- Auth -----
@api_router.post("/auth/register")
async def register(payload: RegisterRequest, response: Response):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "name": payload.name.strip(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "role": "user",
        "created_at": _now_iso(),
    }
    await db.users.insert_one(user_doc)
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return {"user": _user_public(user_doc), "access_token": access}


@api_router.post("/auth/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    email = payload.email.lower().strip()
    client_ip = request.client.host if request.client else "unknown"
    identifier = f"{client_ip}:{email}"
    await check_lockout(db, identifier)
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await record_failed_attempt(db, identifier)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    await clear_attempts(db, identifier)
    access = create_access_token(user["id"], user["email"])
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {"user": _user_public(user), "access_token": access}


@api_router.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}


@api_router.get("/auth/me")
async def auth_me(user=Depends(_current_user)):
    return user


# ----- Sessions -----
@api_router.post("/sessions", response_model=SessionOut)
async def start_session(payload: SessionStartRequest, user=Depends(_current_user)):
    if not payload.scenario_id and not payload.custom_id:
        raise HTTPException(status_code=400, detail="scenario_id or custom_id required")

    if payload.custom_id:
        custom = await db.custom_scenarios.find_one(
            {"id": payload.custom_id, "user_id": user["id"]}, {"_id": 0}
        )
        if not custom:
            raise HTTPException(status_code=404, detail="Custom scenario not found")
        char = {
            "name": custom["name"],
            "location": custom["location"],
            "personality": custom["personality"],
            "tone": custom["tone_label"],
            "tone_label": custom["tone_label"],
            "voice": custom["voice"],
            "image_key": custom.get("image_key", "immigration_officer"),
            "is_custom": True,
        }
        scenario_id = f"custom-{custom['id']}"
        opener = custom["opener"]
    else:
        if payload.scenario_id not in SCENARIOS:
            raise HTTPException(status_code=404, detail="Scenario not found")
        sc = SCENARIOS[payload.scenario_id]
        char = {
            "name": sc["name"], "location": sc["location"],
            "personality": sc["personality"], "tone": sc["tone"],
            "tone_label": sc["tone_label"], "voice": sc["voice"],
            "image_key": sc["image_key"], "is_custom": False,
        }
        scenario_id = payload.scenario_id
        opener = sc["opener"].get(payload.language, sc["opener"]["en"])

    session_id = str(uuid.uuid4())
    doc = {
        "id": session_id,
        "user_id": user["id"],
        "scenario_id": scenario_id,
        "scenario_name": char["name"],
        "language": payload.language,
        "difficulty": payload.difficulty,
        "voice": char["voice"],
        "tone_label": char["tone_label"],
        "char": char,
        "messages": [
            {"role": "assistant", "text": opener, "created_at": _now_iso()},
        ],
        "created_at": _now_iso(),
        "ended": False,
    }
    await db.sessions.insert_one(doc)
    return SessionOut(**{k: v for k, v in doc.items() if k not in ("user_id", "char")})


@api_router.get("/sessions")
async def list_sessions(user=Depends(_current_user)):
    rows = await db.sessions.find(
        {"user_id": user["id"]},
        {"_id": 0, "user_id": 0},
    ).sort("created_at", -1).to_list(100)
    return rows


@api_router.get("/sessions/{session_id}")
async def get_session(session_id: str, user=Depends(_current_user)):
    sess = await db.sessions.find_one({"id": session_id, "user_id": user["id"]}, {"_id": 0, "user_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    return sess


@api_router.post("/chat/send", response_model=ChatSendResponse)
async def chat_send(payload: ChatSendRequest, user=Depends(_current_user)):
    sess = await db.sessions.find_one({"id": payload.session_id, "user_id": user["id"]})
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if sess.get("ended"):
        raise HTTPException(status_code=400, detail="Session has ended")
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")

    char = sess.get("char") or {
        "name": sess["scenario_name"], "location": "", "personality": "", "tone": "",
    }
    system_msg = build_system_prompt_from_char(char, sess["language"], sess["difficulty"])
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=payload.session_id,
        system_message=system_msg,
    ).with_model("anthropic", CLAUDE_MODEL)

    # Replay prior turns so Claude has full context
    for m in sess["messages"]:
        if m["role"] == "user":
            await chat.send_message(UserMessage(text=m["text"]))
        # assistant openers are seeded via system prompt context; replay is enough through user turns

    try:
        reply = await chat.send_message(UserMessage(text=payload.text))
    except Exception as e:
        logger.exception("LLM call failed")
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)[:120]}")

    reply_text = (reply or "").strip()
    now = _now_iso()
    await db.sessions.update_one(
        {"id": payload.session_id},
        {"$push": {"messages": {"$each": [
            {"role": "user", "text": payload.text, "created_at": now},
            {"role": "assistant", "text": reply_text, "created_at": _now_iso()},
        ]}}},
    )
    return ChatSendResponse(reply=reply_text, tone_label=sess["tone_label"], voice=sess["voice"])


@api_router.post("/sessions/{session_id}/end")
async def end_session(session_id: str, user=Depends(_current_user)):
    sess = await db.sessions.find_one({"id": session_id, "user_id": user["id"]})
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if sess.get("feedback"):
        return {"feedback": sess["feedback"]}

    user_msgs = [m for m in sess["messages"] if m["role"] == "user"]
    if not user_msgs:
        raise HTTPException(status_code=400, detail="No user messages to evaluate")

    transcript_lines = []
    for m in sess["messages"]:
        speaker = "USER" if m["role"] == "user" else f"AI ({sess['scenario_name']})"
        transcript_lines.append(f"{speaker}: {m['text']}")
    transcript = "\n".join(transcript_lines)

    feedback_chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"{session_id}-feedback",
        system_message=build_feedback_prompt(sess["language"], sess["scenario_name"]),
    ).with_model("anthropic", CLAUDE_MODEL)

    try:
        raw = await feedback_chat.send_message(UserMessage(text=f"Transcript:\n{transcript}"))
    except Exception as e:
        logger.exception("Feedback LLM failed")
        raise HTTPException(status_code=502, detail=f"AI feedback error: {str(e)[:120]}")

    feedback = _parse_feedback_json(raw)
    share_id = sess.get("share_id") or secrets.token_urlsafe(10)
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {
            "ended": True,
            "feedback": feedback,
            "ended_at": _now_iso(),
            "share_id": share_id,
        }},
    )
    return {"feedback": feedback, "share_id": share_id}


def _parse_feedback_json(raw: str) -> dict:
    text = (raw or "").strip()
    # strip code fences if present
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    # extract first {...}
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start:end + 1]
    try:
        data = json.loads(text)
    except Exception:
        data = {
            "overall_score": 70, "fluency": 70, "grammar": 70, "vocabulary": 70,
            "summary": "Nice work! Keep practicing — try to vary your sentence structure.",
            "strengths": ["You stayed in the conversation", "You kept replying"],
            "corrections": [],
            "vocab_suggestions": [],
        }
    # sanitize
    data.setdefault("strengths", [])
    data.setdefault("corrections", [])
    data.setdefault("vocab_suggestions", [])
    for k in ("overall_score", "fluency", "grammar", "vocabulary"):
        try:
            data[k] = max(0, min(100, int(data.get(k, 0))))
        except Exception:
            data[k] = 0
    return data


# ----- Voice (STT + TTS) -----
@api_router.post("/voice/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("en"),
    user=Depends(_current_user),
):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio")
    # Whisper requires a file-like object with a name (extension matters)
    ext = (file.filename or "audio.webm").split(".")[-1].lower()
    if ext not in {"mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"}:
        ext = "webm"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
    try:
        tmp.write(data)
        tmp.flush()
        tmp.close()
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        with open(tmp.name, "rb") as f:
            resp = await stt.transcribe(
                file=f, model="whisper-1",
                response_format="json", language=language,
            )
        return {"text": getattr(resp, "text", str(resp))}
    except Exception as e:
        logger.exception("STT failed")
        raise HTTPException(status_code=502, detail=f"STT error: {str(e)[:120]}")
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass


@api_router.post("/voice/tts")
async def tts(payload: TtsRequest, user=Depends(_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    voice = payload.voice if payload.voice in {
        "alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"
    } else "alloy"
    text = payload.text[:4000]
    speed = max(0.5, min(2.0, float(payload.speed or 1.0)))
    try:
        tts_client = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        audio_bytes = await tts_client.generate_speech(
            text=text, model="tts-1", voice=voice, response_format="mp3", speed=speed,
        )
    except Exception as e:
        logger.exception("TTS failed")
        raise HTTPException(status_code=502, detail=f"TTS error: {str(e)[:120]}")
    return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/mpeg")


# ----- Custom Scenarios -----
@api_router.post("/custom-scenarios")
async def create_custom(payload: CustomScenarioCreate, user=Depends(_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        **payload.model_dump(),
        "created_at": _now_iso(),
    }
    await db.custom_scenarios.insert_one(doc)
    return {k: v for k, v in doc.items() if k not in ("user_id", "_id")}


@api_router.get("/custom-scenarios")
async def list_customs(user=Depends(_current_user)):
    rows = await db.custom_scenarios.find(
        {"user_id": user["id"]}, {"_id": 0, "user_id": 0}
    ).sort("created_at", -1).to_list(100)
    return rows


@api_router.get("/custom-scenarios/{custom_id}")
async def get_custom(custom_id: str, user=Depends(_current_user)):
    row = await db.custom_scenarios.find_one(
        {"id": custom_id, "user_id": user["id"]}, {"_id": 0, "user_id": 0}
    )
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    return row


@api_router.delete("/custom-scenarios/{custom_id}")
async def delete_custom(custom_id: str, user=Depends(_current_user)):
    result = await db.custom_scenarios.delete_one({"id": custom_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ----- Pronunciation Scoring -----
def _normalize_word(w: str) -> str:
    import unicodedata
    w = unicodedata.normalize("NFD", w.lower())
    w = "".join(c for c in w if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "", w)


def _lcs_align(ref: list[str], hyp: list[str]) -> list[tuple[int, str]]:
    """Return list of (ref_index, status) where status ∈ {'hit','miss'} for each ref word."""
    # standard LCS
    n, m = len(ref), len(hyp)
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n):
        for j in range(m):
            dp[i + 1][j + 1] = dp[i][j] + 1 if ref[i] == hyp[j] else max(dp[i + 1][j], dp[i][j + 1])
    matched = set()
    i, j = n, m
    while i > 0 and j > 0:
        if ref[i - 1] == hyp[j - 1]:
            matched.add(i - 1)
            i -= 1
            j -= 1
        elif dp[i - 1][j] >= dp[i][j - 1]:
            i -= 1
        else:
            j -= 1
    return [(idx, "hit" if idx in matched else "miss") for idx in range(n)]


@api_router.post("/voice/pronunciation")
async def pronunciation_score(
    file: UploadFile = File(...),
    reference_text: str = Form(...),
    language: str = Form("en"),
    user=Depends(_current_user),
):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio")
    ext = (file.filename or "audio.webm").split(".")[-1].lower()
    if ext not in {"mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"}:
        ext = "webm"
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
    try:
        tmp.write(data)
        tmp.flush()
        tmp.close()
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        with open(tmp.name, "rb") as f:
            resp = await stt.transcribe(
                file=f, model="whisper-1",
                response_format="verbose_json",
                language=language,
                timestamp_granularities=["word"],
            )
    except Exception as e:
        logger.exception("Pronunciation STT failed")
        raise HTTPException(status_code=502, detail=f"STT error: {str(e)[:120]}")
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass

    transcript = (getattr(resp, "text", "") or "").strip()
    word_objs = getattr(resp, "words", None) or []
    # Build hyp word tokens with timestamps where available
    hyp_words_raw = []
    for w in word_objs:
        word = getattr(w, "word", None) or (w.get("word") if isinstance(w, dict) else None) or ""
        start = getattr(w, "start", None) or (w.get("start") if isinstance(w, dict) else None) or 0
        end = getattr(w, "end", None) or (w.get("end") if isinstance(w, dict) else None) or 0
        hyp_words_raw.append({"word": word, "start": float(start or 0), "end": float(end or 0)})
    if not hyp_words_raw and transcript:
        hyp_words_raw = [{"word": w, "start": 0, "end": 0} for w in transcript.split()]

    ref_tokens = [t for t in re.split(r"\s+", reference_text) if t]
    ref_norm = [_normalize_word(t) for t in ref_tokens]
    hyp_norm = [_normalize_word(w["word"]) for w in hyp_words_raw]

    # filter empty normalisations (punctuation only)
    ref_pairs = [(i, t) for i, t in enumerate(ref_norm) if t]
    hyp_filt = [t for t in hyp_norm if t]
    matches = _lcs_align([t for _, t in ref_pairs], hyp_filt) if ref_pairs else []

    word_results = []
    match_lookup = {ref_pairs[k][0]: matches[k][1] for k in range(len(matches))}
    for i, original in enumerate(ref_tokens):
        status = match_lookup.get(i, "miss") if ref_norm[i] else "hit"
        word_results.append({"word": original, "status": status})

    hits = sum(1 for r in word_results if r["status"] == "hit")
    total = max(1, len([r for r in word_results if _normalize_word(r["word"])]))
    accuracy = round(hits / total * 100)

    # WPM
    duration_s = 0.0
    if hyp_words_raw:
        duration_s = max(w["end"] for w in hyp_words_raw) - min(w["start"] for w in hyp_words_raw)
    wpm = int((len(hyp_filt) / (duration_s / 60))) if duration_s > 0.5 else 0
    # bonus/penalty for pace vs natural conversational ~120-160 wpm
    pace_penalty = 0
    if 90 <= wpm <= 180:
        pace_penalty = 0
    elif wpm == 0:
        pace_penalty = 5
    else:
        pace_penalty = min(15, abs(wpm - 135) // 8)

    overall = max(0, min(100, accuracy - pace_penalty))

    # Persist the attempt for the pronunciation streak
    await db.pronunciation_attempts.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "overall_score": overall,
        "accuracy": accuracy,
        "pace_wpm": wpm,
        "reference_text": reference_text[:400],
        "transcript": transcript[:400],
        "created_at": _now_iso(),
    })

    return {
        "overall_score": overall,
        "accuracy": accuracy,
        "pace_wpm": wpm,
        "transcript": transcript,
        "words": word_results,
    }


# ----- Stats -----
DAILY_GOAL = 1  # scenes per day
PRON_STREAK_THRESHOLD = 80  # min overall score needed to keep the pronunciation streak alive


def _compute_streaks(active_dates: set[date]) -> tuple[int, int, bool]:
    """Return (current_streak, longest_streak, practiced_today)."""
    today = datetime.now(timezone.utc).date()
    practiced_today = today in active_dates
    # current streak: walk back from today (or yesterday if not practiced today)
    current = 0
    cursor = today if practiced_today else today - timedelta(days=1)
    while cursor in active_dates:
        current += 1
        cursor -= timedelta(days=1)
    # longest streak: scan all dates
    longest = 0
    if active_dates:
        sorted_dates = sorted(active_dates)
        run = 1
        longest = 1
        for i in range(1, len(sorted_dates)):
            if (sorted_dates[i] - sorted_dates[i - 1]).days == 1:
                run += 1
                longest = max(longest, run)
            else:
                run = 1
    return current, longest, practiced_today


@api_router.get("/stats/me")
async def my_stats(user=Depends(_current_user)):
    cursor = db.sessions.find({"user_id": user["id"]}, {"_id": 0, "messages": 0})
    sessions = await cursor.to_list(1000)
    completed = [s for s in sessions if s.get("feedback")]
    scores = [s["feedback"]["overall_score"] for s in completed if s.get("feedback", {}).get("overall_score") is not None]
    avg = round(sum(scores) / len(scores), 1) if scores else 0

    # Streaks: a "practice day" = any day the user started at least one session
    active_dates: set[date] = set()
    today = datetime.now(timezone.utc).date()
    todays_count = 0
    for s in sessions:
        ts = s.get("created_at")
        try:
            dt = datetime.fromisoformat(ts) if isinstance(ts, str) else ts
            d = dt.date()
            active_dates.add(d)
            if d == today:
                todays_count += 1
        except Exception:
            pass

    current_streak, longest_streak, practiced_today = _compute_streaks(active_dates)

    # Pronunciation streak: a "pronunciation day" = any day the user hit >= threshold on at least one attempt
    pron_cursor = db.pronunciation_attempts.find(
        {"user_id": user["id"]},
        {"_id": 0, "overall_score": 1, "created_at": 1},
    )
    pron_attempts = await pron_cursor.to_list(2000)
    pron_dates_qualified: set[date] = set()
    pron_today_best = 0
    pron_total = len(pron_attempts)
    for a in pron_attempts:
        try:
            dt = datetime.fromisoformat(a["created_at"])
            d = dt.date()
            if a.get("overall_score", 0) >= PRON_STREAK_THRESHOLD:
                pron_dates_qualified.add(d)
            if d == today:
                pron_today_best = max(pron_today_best, int(a.get("overall_score", 0)))
        except Exception:
            pass
    pron_current, pron_longest, pron_practiced_today = _compute_streaks(pron_dates_qualified)

    return {
        "total_sessions": len(sessions),
        "completed_sessions": len(completed),
        "average_score": avg,
        "scenarios_tried": len({s["scenario_id"] for s in sessions}),
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "practiced_today": practiced_today,
        "todays_count": todays_count,
        "daily_goal": DAILY_GOAL,
        "active_dates": sorted([d.isoformat() for d in active_dates])[-30:],
        "pron_current_streak": pron_current,
        "pron_longest_streak": pron_longest,
        "pron_practiced_today": pron_practiced_today,
        "pron_today_best": pron_today_best,
        "pron_total_attempts": pron_total,
        "pron_threshold": PRON_STREAK_THRESHOLD,
    }


# ----- Sharing (public, no auth) -----
@api_router.get("/share/{share_id}")
async def get_shared_scene(share_id: str):
    sess = await db.sessions.find_one({"share_id": share_id}, {"_id": 0})
    if not sess:
        raise HTTPException(status_code=404, detail="Scene not found")
    owner = await db.users.find_one({"id": sess["user_id"]}, {"_id": 0, "name": 1})
    return {
        "id": sess["id"],
        "scenario_id": sess["scenario_id"],
        "scenario_name": sess["scenario_name"],
        "language": sess["language"],
        "difficulty": sess["difficulty"],
        "tone_label": sess.get("tone_label", ""),
        "messages": sess["messages"],
        "feedback": sess.get("feedback"),
        "owner_name": owner["name"] if owner else None,
        "created_at": sess["created_at"],
    }


# ----- App wiring -----
app.include_router(api_router)

frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.sessions.create_index([("user_id", 1), ("created_at", -1)])
    await db.sessions.create_index("share_id")
    await db.custom_scenarios.create_index([("user_id", 1), ("created_at", -1)])
    await db.pronunciation_attempts.create_index([("user_id", 1), ("created_at", -1)])
    await db.login_attempts.create_index("identifier")
    # admin seed
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "name": "Admin",
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "created_at": _now_iso(),
        })
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )
    logger.info("Startup complete. Admin: %s", admin_email)


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
