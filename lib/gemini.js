// Server-only Gemini client + the tested prompts from docs/gemini_clinical_prompts.md,
// ported verbatim. This module must only be imported from app/api/** route handlers —
// the API key never reaches the browser.

// Deliberately pinned to a specific, established model rather than a "-latest"
// alias: brand-new models start with a tiny free-tier daily cap (we measured
// gemini-3.8-flash, what "gemini-flash-latest" resolved to on 2026-09-22, at
// only 20 requests/day) that grows over months as Google scales capacity.
// gemini-3.1-flash-lite is a few versions back and has a much larger free daily
// budget (several hundred+ requests/day) — comfortably enough for a clinic
// doing multiple sessions a day, at ~6 Gemini calls per session. When this
// model eventually gets retired for new users, bump the version here (and
// re-check the new one's quota before switching) rather than pointing at
// "-latest" again.
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=";

// None of our prompts need multi-step reasoning (extraction/summarization only),
// so extended "thinking" is pure wasted cost — this cuts token usage drastically.
const NO_THINKING = { thinkingConfig: { thinkingBudget: 0 } };

function apiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");
  return key;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY_DELAYS_MS = [2000, 5000, 10000];

// Gemini's free tier returns 429 (rate/quota) or 503 (temporary overload) under
// load — both are transient and worth a few spaced-out retries rather than
// surfacing an error to the clinician for something that clears up in seconds.
async function fetchGeminiWithRetry(body) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const res = await fetch(GEMINI_URL + apiKey(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return res;
    const t = await res.text();
    lastErr = new Error(`Gemini error (${res.status}): ${t.slice(0, 300)}`);
    if ((res.status === 429 || res.status === 503) && attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    }
    throw lastErr;
  }
  throw lastErr;
}

export async function callGeminiText(prompt, parts = []) {
  const res = await fetchGeminiWithRetry({ contents: [{ parts: [{ text: prompt }, ...parts] }], generationConfig: NO_THINKING });
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
}

export async function callGeminiJSON(prompt) {
  const text = await callGeminiText(prompt);
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const err = new Error("Gemini returned malformed JSON");
    err.rawText = text;
    throw err;
  }
}

export async function transcribeAndSummarize(base64Audio, mimeType) {
  const prompt = `You are a clinical documentation assistant. You will receive audio of a therapy session between a psychiatrist/therapist and a client.

Produce:
1. A full, accurate transcript with speaker labels (Clinician / Client) where distinguishable.
2. A brief client-facing session summary (plain, warm, non-clinical language, 3-5 sentences) suitable to email directly to the client.

Respond ONLY with valid JSON, no explanation, no markdown fences:
{"transcript": "string", "summary": "string"}`;

  const text = await callGeminiText(prompt, [{ inline_data: { mime_type: mimeType, data: base64Audio } }]);
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    const err = new Error("Gemini returned malformed JSON for transcript+summary");
    err.rawText = text;
    throw err;
  }
}

export async function summarizeUploadedText(docText) {
  const prompt = `You are a clinical documentation assistant. Below is the raw text of a past therapy session document (extracted from a Word file).

Write a brief client-facing session summary (plain, warm, non-clinical language, 3-5 sentences), as if this session had just occurred.

Respond with ONLY the summary text, no preamble, no JSON.

DOCUMENT TEXT:
${docText.slice(0, 15000)}`;
  return callGeminiText(prompt);
}

export function buildBriefPrompt(transcript, date) {
  return `You are a clinical documentation assistant supporting a psychiatrist preparing for an upcoming therapy session. You are not making a diagnosis or treatment decision — you are organizing information the clinician already has to help them prepare efficiently.

Below is the transcript of the client's MOST RECENT session only. Based on this transcript alone, produce a brief pre-session note with the following sections:

1. Key topics addressed last session (2-3 bullet points, concise)
2. Unresolved or open items
3. Homework / between-session tasks assigned (if any)
4. Risk indicators — explicitly note any mentions of self-harm, suicidal ideation, substance use escalation, or safety concerns. If none, state "No risk indicators noted in this transcript."
5. Suggested focus for this session — 1-2 sentences, framed as a starting point for the clinician's own judgment.

Ground observations in standard clinical frameworks (CBT, ACT, motivational interviewing) where relevant. Use psychodynamic framing only where clearly supported by the transcript.

Write in a brief narration style, as if reporting to a supervising clinician — reference the session date naturally within sentences (e.g., "In the session on ${date}, the client raised...").

Keep total output under 200 words. This is a working note for the clinician only.

SESSION DATE: ${date}

TRANSCRIPT:
${transcript.slice(0, 15000)}`;
}

export function buildRecapPrompt(existingRecap, transcript, date) {
  return `You are a clinical documentation assistant maintaining a running narrative summary of a client's course of therapy, for the treating clinician's own reference.

You will be given (a) the EXISTING longitudinal recap and (b) the transcript of the MOST RECENT session. Produce an UPDATED recap integrating the new session into the existing narrative.

Guidelines:
- Preserve continuity (presenting concerns, how they've evolved, what's improved, what remains active).
- Write in a narration style, as if reporting to a supervising clinician — weave dates naturally into sentences (e.g., "On ${date}, the client first described...").
- Use plain clinical language. Reference CBT/ACT/biopsychosocial frameworks where useful; psychodynamic concepts only where clearly evident.
- Do not speculate beyond what is stated or implied.
- No fixed length limit — compress older, well-established material; keep recent developments detailed.

EXISTING RECAP:
${existingRecap || "(none — this is the first session)"}

SESSION DATE: ${date}

MOST RECENT SESSION TRANSCRIPT:
${transcript.slice(0, 15000)}

Return only the updated recap text.`;
}

export function buildPatternsPrompt(existingPatterns, transcript, date) {
  return `You are a clinical documentation assistant tracking recurring psychological and behavioral patterns across a client's course of therapy.

You will be given (a) the EXISTING patterns summary and (b) the MOST RECENT transcript. Produce an UPDATED summary:

- For each tracked pattern, note continuation, escalation, improvement, or resolution — extend its trajectory.
- If a pattern first appears now, add it with when it was first observed.
- If fully resolved, keep it visible marked "[Resolved]" rather than removing it — this list doubles as a progress marker.
- Ground descriptions in CBT/ACT frameworks where applicable; psychodynamic framing only where clearly evident.
- Track no more than 5 patterns.
- Write in narration style with dates woven naturally into sentences (e.g., "First noted on ${date} as...").
- Keep compact — scannable in under 30 seconds.

EXISTING PATTERNS SUMMARY:
${existingPatterns || "(none yet)"}

SESSION DATE: ${date}

MOST RECENT SESSION TRANSCRIPT:
${transcript.slice(0, 15000)}

Return only the updated patterns summary text.`;
}

export function buildLifeContextPrompt(indexArr, transcript, date) {
  return `You are a clinical documentation assistant identifying new or updated mentions of recurring people, incidents, and circumstances in a client's therapy session.

You will be given (a) a lightweight INDEX of entities already on record (id, name, type only) and (b) the MOST RECENT transcript. Report ONLY what's new or discussed this session — do not rewrite the full record.

For each person/incident/circumstance discussed:
- If it clearly matches an existing INDEX entry (even referred to differently, e.g. "my mom" = "Mother"), report as update to that existing_id.
- If it doesn't match anything, report as new.
- If an indexed entity isn't mentioned this session, don't include it.

Classify as: "person", "incident", or "circumstance". Each note: one short sentence.

Respond ONLY with valid JSON, no markdown fences:
{"updates": [{"match_type": "existing|new", "existing_id": "string or null", "name": "string", "type": "person|incident|circumstance", "session_date": "${date}", "note": "string"}]}

EXISTING INDEX:
${JSON.stringify(indexArr)}

SESSION DATE: ${date}

MOST RECENT SESSION TRANSCRIPT:
${transcript.slice(0, 15000)}`;
}

export function buildOpenThreadsPrompt(openArr, transcript, date) {
  return `You are a clinical documentation assistant tracking topics raised but not fully explored, plus the clinician's own noted intentions to revisit something later.

You will be given (a) CURRENTLY OPEN threads only and (b) the MOST RECENT transcript. Report only what changed.

- If a listed thread is clearly addressed in this transcript, report its id as resolved with a one-line resolution note.
- If not addressed, don't include it.
- Identify any NEW unresolved threads from this session.

Respond ONLY with valid JSON, no markdown fences:
{"resolved": [{"existing_id": "string", "resolution_note": "string"}], "new_threads": [{"description": "string", "session_date": "${date}"}]}

CURRENTLY OPEN THREADS:
${JSON.stringify(openArr)}

SESSION DATE: ${date}

MOST RECENT SESSION TRANSCRIPT:
${transcript.slice(0, 15000)}`;
}
