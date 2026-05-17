# AI Roleplay Simulator — PRD

## Problem Statement
Build AI Roleplay Simulator — "Talk to realistic people, not exercises."
Users practice languages by interacting with AI characters: immigration officer,
angry customer, French waiter, job interviewer, doctor, partner, landlord, police officer.
The AI adapts accent, slang, speaking speed, emotional tone.

## User Choices (gathered)
- LLM model: **Claude Sonnet 4.5** (claude-sonnet-4-5-20250929) via Emergent LLM Key
- Voice: **Text + Voice** — OpenAI Whisper (whisper-1) STT + OpenAI TTS (tts-1)
- Languages: **English, Spanish, French**
- Auth: **JWT email/password** (cookies + Bearer fallback)
- Scenarios: **all 8** + 3 difficulty levels + post-conversation grammar/vocab feedback

## Architecture
- **Backend**: FastAPI + MongoDB (motor)
  - `/api/auth/*` (register, login, logout, me) with bcrypt + JWT + brute-force lockout
  - `/api/catalog` (8 scenarios, 3 languages, 3 difficulties)
  - `/api/sessions` (create/list/get) + `/api/chat/send` (Claude Sonnet 4.5 in-character reply)
  - `/api/sessions/{id}/end` (Claude generates structured JSON feedback)
  - `/api/voice/transcribe` (Whisper STT) and `/api/voice/tts` (OpenAI TTS stream)
  - `/api/stats/me` (dashboard counters)
- **Frontend**: React + Shadcn UI + Tailwind, cinematic dark theme (Cabinet Grotesk + Satoshi)
  - Landing → Login/Register → Scenarios → Setup → Chat → Feedback → Dashboard

## User Personas
- **Casual learner** — wants conversational practice without textbooks
- **Travel prep** — practicing border control / waiter / police interactions before a trip
- **Job seeker** — running mock interviews in target language

## Core Requirements (static)
- 8 named characters with distinct personalities, voices, openers (EN/ES/FR each)
- Realistic in-character replies — no "as an AI" disclaimers
- Voice input + voice output per character
- Beginner / Intermediate / Advanced difficulty modifies vocabulary, pace, slang
- End-of-scene coach review with overall + sub-scores + corrections + vocab tips

## What's been implemented (2026-02-17)
- ✅ JWT auth + admin seed + brute force protection
- ✅ 8 character scenarios (immigration officer, angry customer, French waiter, job interviewer,
       doctor, partner, landlord, police officer) with EN/ES/FR openers
- ✅ Claude Sonnet 4.5 chat with character-specific system prompts + difficulty modifiers
- ✅ OpenAI Whisper STT integration (voice → text)
- ✅ OpenAI TTS integration (per-character voice: onyx, nova, fable, ash, sage, shimmer, echo, coral)
- ✅ Post-scene Claude feedback (overall_score, fluency, grammar, vocabulary, summary, strengths, corrections, vocab_suggestions)
- ✅ React frontend: Landing, Login, Register, Scenarios gallery, Setup, Chat (text+voice), Feedback, Dashboard
- ✅ Cinematic dark theme with character imagery + film-grain texture
- ✅ Tested: 15/15 backend tests passing (catalog, auth, sessions, chat, feedback, voice, stats)

## Prioritized Backlog
### P1
- [ ] Streak tracking + daily-goal flame
- [ ] Save & share a scene transcript link (social proof)
- [ ] Adjustable AI speaking speed (tts speed param)

### P2
- [ ] Pronunciation scoring (forced alignment using Whisper word timestamps)
- [ ] Custom scenarios (user-defined character + setting)
- [ ] Leaderboard / social
- [ ] Mobile PWA install + push notifications for daily practice
