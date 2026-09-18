# Aarogya Minds — Clinic Session Workspace

Production build of the prototype in [docs/clinic_app_prototype.jsx](docs/clinic_app_prototype.jsx), per
[docs/clinic_app_project_brief.md](docs/clinic_app_project_brief.md).

Stack: Next.js (App Router) + Supabase (Postgres + Storage) + Gemini, deployed on Vercel.
The Gemini key and DB credentials live only in server-side code — the browser never sees them.

## One-time setup

1. **Install Node.js** (LTS) and **Git** if you haven't already.
2. `npm install`
3. Copy `.env.local.example` to `.env.local` and fill in the values (see account setup below).
4. Run the SQL in [supabase/schema.sql](supabase/schema.sql) once, in your Supabase project's SQL Editor.
5. In Supabase, create two Storage buckets (both **private**, not public):
   - `session-audio` — temporary holding spot for raw recordings, deleted right after transcription.
   - `session-docs` — the generated `.docx` file for every session.
6. `npm run dev` and open http://localhost:3000

## Accounts needed (created by you, not automated)

- **Google AI Studio** — Gemini API key ([GEMINI_API_KEY])
- **Supabase** — free Postgres DB + file storage ([SUPABASE_URL], [SUPABASE_SERVICE_ROLE_KEY], [NEXT_PUBLIC_SUPABASE_URL], [NEXT_PUBLIC_SUPABASE_ANON_KEY])
- **GitHub** — hosts the code so Vercel can deploy it
- **Vercel** — free hosting with a stable URL

`APP_PASSWORD` and `SESSION_SECRET` are values you make up yourself (see comments in `.env.local.example`)
— no account needed for those.

## What's deliberately not built yet

Per the brief's own build order (Section 4) and prototype status notes (Section 6.2):

- **Google Calendar API auto-generated Meet links** — still manual paste-once-and-reuse, same as the prototype.
  Needs a Google Cloud OAuth setup, planned as a later phase.
- **Real email sending with attachments** — still `mailto:` (opens your own email client, no attachment).
  Resend (free tier) is the planned upgrade.
- **Online-mode (tab/system audio) capture** is implemented but untested against a real Google Meet call —
  the brief calls this the hardest piece and says to fully validate offline mode with real sessions first.

## Data model

See [supabase/schema.sql](supabase/schema.sql). Notes on the trickier tables:

- `life_context_entities` / `life_context_mentions` — entities and mentions are permanent and append-only;
  Gemini only ever sees a lightweight index (id/name/type) of existing entities, never full history,
  keeping the prompt size constant regardless of session count (brief Section 3.1).
- `open_threads` — only rows with `status = 'open'` are ever sent back to Gemini; resolved threads stay
  in the DB and in the UI, just excluded from the prompt payload.
- `sessions.transcript` is written once and never updated by the app. `sessions.summary` is editable any
  time — editing it regenerates the stored `.docx` so the file and on-screen text can't drift apart.
- `sessions.consent_given_at` is required (non-null) for any session with `source = 'recording'` — the API
  rejects the request otherwise. It's null for uploaded past-session `.docx` files, since there's no live
  recording to consent to.
