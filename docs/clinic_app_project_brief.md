# Project Brief: Clinic Therapy Session & Case Management Tool

**For: Dr. Jash, Aarogya Minds clinic, Surat**
**Purpose: Personal, single-user clinic tool for recording, transcribing, and analyzing therapy sessions. Must be free/low-cost to build and run. No login/multi-user system needed — Dr. Jash is the only user.**

Give this whole document, `gemini_clinical_prompts.md`, and `clinic_app_prototype.jsx` to Claude Code as the first message when starting the build. The `.jsx` file is a **working front-end prototype** already built and tested in a chat artifact environment — it proves out the full design (UI, data flow, live Gemini calls) but has real gaps that need fixing before production use (see Section 7). Use it as the reference implementation to build from, not a from-scratch spec.

---

## 1. Overview

A single-user tool for Dr. Jash to:
- Register patients and maintain profiles
- Record therapy sessions (in-person and via Google Meet) OR upload existing `.docx` session files
- Auto-generate transcripts and summaries using the Gemini API
- Maintain 5 auto-updating "clinical assistant" tabs per patient that build over time
- Keep dated, editable/deletable therapist notes per patient
- Reuse one Google Meet link per patient, with copy/email actions
- Email session summaries to clients
- Store everything per-patient, free of cost, with a smooth path to paid infrastructure later without data loss

Must work in two modes: **Offline (in-person)** and **Online (Google Meet)**. No login system — single user only.

---

## 2. Core Design Decisions Already Made

### 2.1 Two document types per session — do not conflate these
| | Transcript | Session Summary |
|---|---|---|
| Audience | Clinician only (legal/documentation record) | Client-facing |
| Editable? | **No** — locked after generation. If corrections are needed, add a separate timestamped "clinician note," never edit the original. | Yes — shown to clinician for review/edit BEFORE saving or emailing |
| Feeds into | The 5 Gemini tabs (below) — always the source of truth | Nothing — it's an output only |

### 2.2 Registration & Profile
- Registration fields: name, email, age, basic address
- Each patient gets a `patient_id` (don't use email as primary key — it can change)
- Profile page shows: session history list, each session's saved Word file (transcript + summary), the 5-tab Gemini box, latest follow-up date, dedicated Google Meet link (see below), "email this link" button

### 2.3 Google Meet link per patient
- Generate via Google Calendar API — create a long-duration/recurring calendar event per patient, which produces a persistent Meet link
- Link stays valid roughly 1 year; store it on the patient's profile
- Note: clinician (host) must join for the room to activate each time — it's not a public walk-in room

### 2.4 Session flow — "Engage" button
- Click **Engage** → visible timer starts
- **Offline mode:** "Start Recording" captures mic audio directly via browser `MediaRecorder` API
- **Online mode:** clinician always joins via laptop/desktop (confirmed — no mobile case to handle). Requires **tab/system audio capture** (`getDisplayMedia` with audio, Chrome-specific) since the client's voice comes through speakers, not the mic. This is a genuinely different code path from offline — build and fully test offline mode first, then build online capture as a second phase.
- **Stop** → audio sent to Gemini API → transcript + draft summary returned
- Summary shown in an **editable text box** for clinician review before saving (confirmed: NOT auto-saved/emailed immediately — review step is required)
- Clinician clicks **Save** → Word file generated (transcript + finalized summary) → attached to that session in the patient's profile
- Separate **Email** button (not automatic) sends the saved file to the patient's registered email

### 2.5 Data architecture principle (important for smooth free→paid migration)
- Keep session storage (database/files) completely separate from the AI provider (Gemini) and from billing tier
- Switching from free-tier Gemini API key to a paid one is a config change only — no data migration needed
- Only a future move to Vertex AI (enterprise Google Cloud, different auth model) would require code changes — but stored data stays untouched either way

---

## 3. The 5 Gemini Clinical Tabs (clinician-facing only — never shown to patient)

All 5 tabs are generated from the **transcript**, never the client-facing summary (summary is simplified/edited, so it loses clinical detail).

| Tab | Storage type | Update behavior |
|---|---|---|
| **1. Pre-session brief** | Single text field, overwritten each time | Full regeneration using ONLY the most recent transcript. Narration style, dates woven into sentences. Under 200 words. |
| **2. Longitudinal recap** | Single text field, merged/appended | Incremental — always current. No length cap. Narration style like a report to a supervising clinician, with dates woven naturally into the story (not headers). Older material can compress; recent stays detailed. |
| **3. Life context** (people/incidents/circumstances) | Structured list, **per-entity mention history** | Incremental, permanent — entries and mentions are NEVER deleted. See token-efficiency design below — this is the one that needed the most careful design. |
| **4. Patterns** | Single text field, capped at ~5 patterns | Incremental — short narration-style entries, each tracks an arc (when first noted → how it evolved → current/resolved status). **Resolved patterns stay visible, marked [Resolved]** — this tab doubles as an informal progress marker over the course of therapy. |
| **5. Open threads** | Structured list, status-tracked | Incremental — topics raised but not followed up, plus clinician's own "revisit later" notes. Status: open/resolved. Resolved items stay visible (never deleted), but only OPEN threads are re-sent to Gemini each session (see below). |

### 3.1 Token-efficiency design (critical — do not build the naive version)
Early design sent the FULL existing record to Gemini every session and had it return the full updated record. This does not scale — cost, latency, and JSON-truncation risk all grow with every session. **Correct design, already specified in the tested prompts:**

- **Life context:** Gemini receives only a lightweight INDEX of existing entities (id, name, type — no history) + the new transcript. It returns only new/changed mentions this session, tagged as matching an `existing_id` or `new`. **The software (not Gemini) appends this to the permanent per-entity mention history in the database.** Gemini's job is entity matching (e.g. recognizing "my mom" = existing "Mother" entry) and extraction — not data management.
- **Open threads:** Gemini receives only currently-OPEN threads (resolved ones excluded — never re-sent). It returns which existing thread ids got resolved this session (with a resolution note) plus any brand-new threads. Software does the merging.
- **Patterns:** naturally stays small since capped at ~5 patterns — no special handling needed.
- **Longitudinal recap:** naturally grows sub-linearly since older material gets compressed in the writing — low risk, monitor over time.
- **Pre-session brief:** never grows — always single-transcript in, single output out.

This means every Gemini API call for a given tab stays roughly constant in size, whether it's session 3 or session 300.

### 3.2 Tested & finalized prompts
A separate file — **`gemini_clinical_prompts.md`** — contains the exact, tested prompt text for all 5 tabs (both the real incremental versions used in production, and separate "testing-only, do not build" batch versions used to validate the incremental approach against raw multi-transcript processing). Use those prompts verbatim as the system/instruction text sent to the Gemini API for each tab. Give Claude Code that file alongside this one.

---

## 4. Build Order (recommended phases)

1. **Patient registration + profile page** (no AI yet) — just CRUD basics
2. **Offline session recording loop**: Engage → timer → record → stop → Gemini transcript+summary → editable review → Save → Word file → attach to profile. **Get this fully working and tested with real sessions before moving on.**
3. **Wire in the 5 Gemini tabs** using the tested prompts, with the token-efficient index-based design above
4. **Email button** (send saved Word file to patient's registered email)
5. **Online mode**: Calendar API for per-patient Meet links + email-the-link button + tab/system audio capture for online recording (hardest technical piece — deliberately last)

---

## 5. Constraints & Non-negotiables
- Must run on free tiers where possible (Gemini API free tier, free hosting like Vercel, free database like Supabase/Firebase) — understood that "free" may need occasional maintenance attention (quota/policy changes), not truly zero-maintenance forever
- Data storage must be encrypted/access-restricted (Dr. Jash only) — sensitive health data, India's DPDP Act 2023 obligations apply as data fiduciary
- Recording requires explicit, timestamped, in-app informed consent capture — do not assume consent
- Transcript is a legal/documentation record — must remain unedited after generation (see 2.1)
- The 5 tabs are clinician-only — never exposed to or emailed to patients
- No psychoanalytic framing forced by default — evidence-based frameworks (CBT/ACT/biopsychosocial) preferred; psychodynamic concepts used only where genuinely evident in the material

---

## 6. Prototype Status — What Works vs. What's Missing (read this before starting)

`clinic_app_prototype.jsx` is a real, working React artifact, not a mockup. Built and tested in a sandboxed chat environment with browser-only persistence (`window.storage`). It validates the full design end-to-end. Treat it as the reference implementation.

### 6.1 What already works correctly in the prototype (build on this, don't redesign it)
- Patient registration + profile, with persistent storage
- Live audio recording (browser `MediaRecorder`) → real Gemini API call → real transcript + client summary
- Editable summary review step before saving
- All 5 clinical tabs wired to real Gemini calls using the tested prompts, including the token-efficient index-based design for Life Context and Open Threads
- `.docx` upload (via `mammoth` library) → text extraction → summary generation → feeds into the same 5-tab pipeline as a live session
- Therapist notes box: add, edit, delete, date-stamped, persistent
- Reusable Google Meet link box per patient: manual paste (not auto-generated — see 6.2), Copy button, Email button
- Per-session summary view with an "Email this summary" action
- Visual design system already chosen and implemented: deep indigo (`#26314F`) + warm ivory (`#FAF6EF`) + muted sage (`#8A9A7E`) for resolved/positive states + dusty rose (`#B96B72`) reserved for risk flags only. Fraunces (serif) for headings/names, Inter (sans) for UI/data. Carry this styling into the production build.

### 6.2 What is faked, missing, or unsafe in the prototype — must be fixed for production
- **Gemini API key is exposed client-side.** It's typed into a Settings panel and stored in browser storage, then sent directly from the browser to Google. For production: move all Gemini calls behind a backend/serverless function so the key never reaches the browser.
- **Data storage is chat-artifact-only**, not a real database. Doesn't sync across devices, isn't a durable production store. Needs a real free-tier database (e.g. Supabase/Firebase).
- **No real hosting** — only runs inside this chat. Needs real deployment (e.g. Vercel) with a stable URL.
- **No `.docx` file generation** — no Word-writing library was available in the prototype's environment, so "saving" a session currently only stores transcript/summary as text/JSON, not an actual downloadable Word file. Production needs real `.docx` export attached to each session.
- **No real email sending** — the "Email" buttons currently just open a `mailto:` link (pre-fills the user's own email client, can't attach files). Production should ideally send directly (e.g. via a transactional email API) with the `.docx` attached, or at minimum keep the `mailto:` fallback if that's judged sufficient.
- **Google Meet link is manually pasted, not auto-generated.** No Calendar API/OAuth integration exists yet. Production should replace manual paste with real Calendar API generation, per the original design in Section 2.3 — OAuth flows don't work reliably in a sandboxed chat artifact, which is why this was deferred.
- **No login/auth** — intentional, per single-user decision above. Note: without any access control, anyone with the exact deployed URL could open the app. Acceptable for single-user personal use as long as the URL isn't shared/indexed; optionally add one simple shared password as a lightweight deterrent if desired (not a full auth system).
- **Silent JSON failures**: if Gemini returns malformed JSON for Life Context or Open Threads, the app currently fails silently (logged to console only) rather than surfacing an error. Production should show a visible error/retry state instead.

---

## 7. Open / Not Yet Decided
- Exact database schema (tables/fields) — not yet finalized, should be one of the first things Claude Code proposes
- Risk-flag alerting: passive (shown in review) vs. active (mid-session alert) — leaning passive, not fully settled
- Whether resolved Life Context entities need any UI treatment beyond staying in the list (not yet designed)
