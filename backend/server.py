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
    build_system_prompt, build_feedback_prompt,
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
    scenario_id: str
    language: Literal["en", "es", "fr"] = "en"
    difficulty: Literal["beginner", "intermediate", "advanced"] = "intermediate"


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
    if payload.scenario_id not in SCENARIOS:
        raise HTTPException(status_code=404, detail="Scenario not found")
    sc = SCENARIOS[payload.scenario_id]
    session_id = str(uuid.uuid4())
    opener = sc["opener"].get(payload.language, sc["opener"]["en"])
    doc = {
        "id": session_id,
        "user_id": user["id"],
        "scenario_id": payload.scenario_id,
        "scenario_name": sc["name"],
        "language": payload.language,
        "difficulty": payload.difficulty,
        "voice": sc["voice"],
        "tone_label": sc["tone_label"],
        "messages": [
            {"role": "assistant", "text": opener, "created_at": _now_iso()},
        ],
        "created_at": _now_iso(),
        "ended": False,
    }
    await db.sessions.insert_one(doc)
    return SessionOut(**{k: v for k, v in doc.items() if k != "user_id"})


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

    system_msg = build_system_prompt(sess["scenario_id"], sess["language"], sess["difficulty"])
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
        system_message=build_feedback_prompt(sess["language"], sess["scenario_id"]),
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
    try:
        tts_client = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
        audio_bytes = await tts_client.generate_speech(
            text=text, model="tts-1", voice=voice, response_format="mp3"
        )
    except Exception as e:
        logger.exception("TTS failed")
        raise HTTPException(status_code=502, detail=f"TTS error: {str(e)[:120]}")
    return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/mpeg")


# ----- Stats -----
DAILY_GOAL = 1  # scenes per day


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
