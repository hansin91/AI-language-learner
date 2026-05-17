"""Backend integration tests for AI Roleplay Simulator.

Covers: catalog, auth (register/login/me/wrong-password), sessions (start/list),
chat/send (Claude Sonnet 4.5), session end (Claude feedback JSON),
voice TTS, voice transcribe, stats.
"""
import io
import os
import math
import struct
import uuid
import wave
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ai-roleplay-chat-25.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@roleplay.ai"
ADMIN_PASSWORD = "Admin123!"


# ----- Fixtures -----
@pytest.fixture(scope="session")
def admin_token() -> str:
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    return data["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def test_user():
    """Create a unique test user for each run."""
    email = f"test_user_{uuid.uuid4().hex[:8]}@roleplay.ai"
    payload = {"name": "TEST User", "email": email, "password": "Tester123!"}
    r = requests.post(f"{API}/auth/register", json=payload, timeout=20)
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    data = r.json()
    return {"email": email, "password": "Tester123!", "token": data["access_token"], "user": data["user"]}


@pytest.fixture(scope="session")
def user_headers(test_user):
    return {"Authorization": f"Bearer {test_user['token']}", "Content-Type": "application/json"}


# ----- Catalog -----
class TestCatalog:
    def test_catalog_returns_scenarios_languages_difficulties(self):
        r = requests.get(f"{API}/catalog", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data["scenarios"]) == 8
        assert len(data["languages"]) == 3
        assert len(data["difficulties"]) == 3
        ids = {s["id"] for s in data["scenarios"]}
        expected = {"immigration_officer", "angry_customer", "french_waiter", "job_interviewer",
                    "doctor", "partner", "landlord", "police_officer"}
        assert ids == expected
        lang_codes = {l["code"] for l in data["languages"]}
        assert lang_codes == {"en", "es", "fr"}
        diff_codes = {d["code"] for d in data["difficulties"]}
        assert diff_codes == {"beginner", "intermediate", "advanced"}


# ----- Auth -----
class TestAuth:
    def test_register_returns_token_and_user(self, test_user):
        assert test_user["token"]
        assert test_user["user"]["email"] == test_user["email"]
        assert "id" in test_user["user"]

    def test_admin_login_success(self, admin_token):
        assert isinstance(admin_token, str) and len(admin_token) > 20

    def test_login_wrong_password_returns_401(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "WrongPass!!"}, timeout=15)
        assert r.status_code in (401, 429)  # 429 possible if lockout hit from prior tests
        if r.status_code == 401:
            assert "Invalid" in r.json().get("detail", "")

    def test_me_with_bearer_token(self, admin_headers):
        r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == ADMIN_EMAIL
        assert u["role"] == "admin"
        assert "password_hash" not in u

    def test_me_without_token_returns_401(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401


# ----- Sessions / Chat / Feedback -----
class TestSessionFlow:
    def test_start_session_seeds_opener(self, user_headers):
        r = requests.post(f"{API}/sessions",
                          headers=user_headers,
                          json={"scenario_id": "doctor", "language": "en", "difficulty": "beginner"},
                          timeout=20)
        assert r.status_code == 200, r.text
        sess = r.json()
        assert sess["scenario_id"] == "doctor"
        assert sess["scenario_name"] == "Doctor"
        assert sess["language"] == "en"
        assert sess["difficulty"] == "beginner"
        assert len(sess["messages"]) == 1
        assert sess["messages"][0]["role"] == "assistant"
        assert len(sess["messages"][0]["text"]) > 0
        pytest.session_id_for_chat = sess["id"]

    def test_start_session_invalid_scenario(self, user_headers):
        r = requests.post(f"{API}/sessions",
                          headers=user_headers,
                          json={"scenario_id": "nope", "language": "en", "difficulty": "beginner"},
                          timeout=15)
        assert r.status_code == 404

    def test_chat_send_returns_claude_reply(self, user_headers):
        sid = getattr(pytest, "session_id_for_chat", None)
        assert sid, "Session must be created first"
        r = requests.post(f"{API}/chat/send",
                          headers=user_headers,
                          json={"session_id": sid, "text": "I have a sore throat and a small fever since yesterday."},
                          timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "reply" in data
        assert len(data["reply"]) > 0
        assert data["voice"] == "sage"

    def test_chat_send_persists_messages(self, user_headers):
        sid = getattr(pytest, "session_id_for_chat", None)
        r = requests.get(f"{API}/sessions/{sid}", headers=user_headers, timeout=15)
        assert r.status_code == 200
        sess = r.json()
        # opener + user + assistant reply = 3
        assert len(sess["messages"]) >= 3
        roles = [m["role"] for m in sess["messages"]]
        assert "user" in roles and "assistant" in roles

    def test_list_sessions(self, user_headers):
        r = requests.get(f"{API}/sessions", headers=user_headers, timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert any(s["id"] == getattr(pytest, "session_id_for_chat", None) for s in rows)

    def test_end_session_generates_feedback(self, user_headers):
        sid = getattr(pytest, "session_id_for_chat", None)
        r = requests.post(f"{API}/sessions/{sid}/end", headers=user_headers, timeout=90)
        assert r.status_code == 200, r.text
        fb = r.json()["feedback"]
        for k in ("overall_score", "fluency", "grammar", "vocabulary"):
            assert isinstance(fb[k], int)
            assert 0 <= fb[k] <= 100
        assert isinstance(fb["summary"], str) and len(fb["summary"]) > 0
        assert isinstance(fb["strengths"], list)
        assert isinstance(fb["corrections"], list)
        assert isinstance(fb["vocab_suggestions"], list)


# ----- Voice -----
def _make_silent_wav() -> bytes:
    """Create a 1-second 16kHz silent WAV in-memory."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        # 1 second silence
        w.writeframes(b"\x00\x00" * 16000)
    return buf.getvalue()


def _make_sine_wav(seconds=1, freq=440) -> bytes:
    buf = io.BytesIO()
    framerate = 16000
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(framerate)
        frames = bytearray()
        for i in range(framerate * seconds):
            sample = int(16000 * math.sin(2 * math.pi * freq * i / framerate))
            frames += struct.pack("<h", sample)
        w.writeframes(bytes(frames))
    return buf.getvalue()


class TestVoice:
    def test_tts_returns_mp3(self, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        r = requests.post(f"{API}/voice/tts",
                          headers=headers,
                          json={"text": "Hello", "voice": "alloy"},
                          timeout=60)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("audio/mpeg")
        assert len(r.content) > 500  # has audio bytes

    def test_transcribe_accepts_wav(self, admin_token):
        headers = {"Authorization": f"Bearer {admin_token}"}
        wav_bytes = _make_sine_wav()
        files = {"file": ("audio.wav", wav_bytes, "audio/wav")}
        data = {"language": "en"}
        r = requests.post(f"{API}/voice/transcribe",
                          headers=headers, files=files, data=data,
                          timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "text" in body
        assert isinstance(body["text"], str)


# ----- Stats -----
class TestStats:
    def test_stats_me(self, user_headers):
        r = requests.get(f"{API}/stats/me", headers=user_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        for k in ("total_sessions", "completed_sessions", "average_score", "scenarios_tried"):
            assert k in data
        assert data["total_sessions"] >= 1
