import React, { useState, useEffect, useRef } from "react";
import mammoth from "mammoth";
import {
  Plus, Play, Mic, Square, Mail, Clock, Users, AlertCircle, Settings,
  Loader2, Key, Upload, Copy, Check, Link2, StickyNote, ChevronDown, ChevronUp, Send,
  Edit2, Trash2, X,
} from "lucide-react";

const emptyTabs = {
  brief: "No sessions yet.",
  recap: "No sessions yet.",
  lifeContext: [],
  patterns: "No sessions yet.",
  openThreads: [],
};

const tabList = [
  { key: "brief", label: "Pre-session Brief" },
  { key: "recap", label: "Longitudinal Recap" },
  { key: "lifeContext", label: "Life Context" },
  { key: "patterns", label: "Patterns" },
  { key: "openThreads", label: "Open Threads" },
];

const newId = () => `id_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const mailtoLink = (email, subject, body) =>
  `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

// ---------------- Gemini calls ----------------

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=";

async function callGeminiText(apiKey, prompt) {
  const res = await fetch(GEMINI_URL + apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini error (${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
}

async function callGeminiJSON(apiKey, prompt) {
  const text = await callGeminiText(apiKey, prompt);
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    console.error("JSON parse failed:", text);
    return null;
  }
}

async function transcribeAndSummarize(apiKey, base64Audio, mimeType) {
  const prompt = `You are a clinical documentation assistant. You will receive audio of a therapy session between a psychiatrist/therapist and a client.

Produce:
1. A full, accurate transcript with speaker labels (Clinician / Client) where distinguishable.
2. A brief client-facing session summary (plain, warm, non-clinical language, 3-5 sentences) suitable to email directly to the client.

Respond ONLY with valid JSON, no explanation, no markdown fences:
{"transcript": "string", "summary": "string"}`;

  const res = await fetch(GEMINI_URL + apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Audio } }] }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    return { transcript: text, summary: "(Could not auto-parse — check raw transcript.)" };
  }
}

async function summarizeUploadedText(apiKey, docText) {
  const prompt = `You are a clinical documentation assistant. Below is the raw text of a past therapy session document (extracted from a Word file).

Write a brief client-facing session summary (plain, warm, non-clinical language, 3-5 sentences), as if this session had just occurred.

Respond with ONLY the summary text, no preamble, no JSON.

DOCUMENT TEXT:
${docText.slice(0, 15000)}`;
  return callGeminiText(apiKey, prompt);
}

// ---- Prompt builders (tested versions) ----

function buildBriefPrompt(transcript, date) {
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

function buildRecapPrompt(existingRecap, transcript, date) {
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

function buildPatternsPrompt(existingPatterns, transcript, date) {
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

function buildLifeContextPrompt(indexArr, transcript, date) {
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

function buildOpenThreadsPrompt(openArr, transcript, date) {
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

async function processAllTabs(apiKey, patient, transcript, sessionDate) {
  const tabs = patient.tabs;

  const [briefText, recapText, patternsText] = await Promise.all([
    callGeminiText(apiKey, buildBriefPrompt(transcript, sessionDate)),
    callGeminiText(apiKey, buildRecapPrompt(tabs.recap === "No sessions yet." ? "" : tabs.recap, transcript, sessionDate)),
    callGeminiText(apiKey, buildPatternsPrompt(tabs.patterns === "No sessions yet." ? "" : tabs.patterns, transcript, sessionDate)),
  ]);

  const lcIndex = (tabs.lifeContext || []).map((e) => ({ id: e.id, name: e.name, type: e.type }));
  const lcResult = await callGeminiJSON(apiKey, buildLifeContextPrompt(lcIndex, transcript, sessionDate));
  let newLifeContext = [...(tabs.lifeContext || [])];
  if (lcResult?.updates) {
    for (const u of lcResult.updates) {
      if (u.match_type === "existing" && u.existing_id) {
        const idx = newLifeContext.findIndex((e) => e.id === u.existing_id);
        if (idx >= 0) {
          newLifeContext[idx] = { ...newLifeContext[idx], mentions: [...newLifeContext[idx].mentions, { date: u.session_date, note: u.note }] };
          continue;
        }
      }
      newLifeContext.push({ id: newId(), name: u.name, type: u.type, mentions: [{ date: u.session_date, note: u.note }] });
    }
  }

  const openArr = (tabs.openThreads || []).filter((t) => t.status === "open").map((t) => ({ id: t.id, description: t.desc }));
  const otResult = await callGeminiJSON(apiKey, buildOpenThreadsPrompt(openArr, transcript, sessionDate));
  let newOpenThreads = [...(tabs.openThreads || [])];
  if (otResult?.resolved) {
    for (const r of otResult.resolved) {
      const idx = newOpenThreads.findIndex((t) => t.id === r.existing_id);
      if (idx >= 0) newOpenThreads[idx] = { ...newOpenThreads[idx], status: "resolved", resolution: r.resolution_note };
    }
  }
  if (otResult?.new_threads) {
    for (const nt of otResult.new_threads) newOpenThreads.push({ id: newId(), desc: nt.description, status: "open" });
  }

  return { brief: briefText, recap: recapText, patterns: patternsText, lifeContext: newLifeContext, openThreads: newOpenThreads };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ---------------- Storage helpers ----------------
async function loadPatients() {
  try {
    const res = await window.storage.get("patients-list", false);
    return res ? JSON.parse(res.value) : [];
  } catch { return []; }
}
async function savePatients(patients) {
  try { await window.storage.set("patients-list", JSON.stringify(patients), false); }
  catch (e) { console.error("Save failed", e); }
}
async function loadApiKey() {
  try {
    const res = await window.storage.get("gemini-api-key", false);
    return res ? res.value : "";
  } catch { return ""; }
}
async function saveApiKey(key) {
  try { await window.storage.set("gemini-api-key", key, false); }
  catch (e) { console.error("Save key failed", e); }
}

// ---------------- UI components ----------------

function Sidebar({ patients, selectedId, onSelect, onAddClick, onSettingsClick }) {
  return (
    <div className="w-72 shrink-0 border-r border-[#26314F]/12 h-full flex flex-col bg-[#FAF6EF]">
      <div className="px-6 pt-8 pb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl text-[#26314F]" style={{ fontFamily: "Fraunces, serif" }}>Aarogya Minds</h1>
          <p className="text-sm text-[#26314F]/55 mt-1">Session workspace</p>
        </div>
        <button onClick={onSettingsClick} className="text-[#26314F]/40 hover:text-[#26314F] mt-1"><Settings size={17} /></button>
      </div>
      <button onClick={onAddClick} className="mx-6 mb-4 flex items-center gap-2 text-sm text-[#26314F] border border-[#26314F]/25 rounded-sm px-3 py-2 hover:bg-[#26314F]/5 transition-colors">
        <Plus size={15} /> Register patient
      </button>
      <div className="px-6 pb-2 text-xs tracking-wide text-[#26314F]/40 flex items-center gap-1.5"><Users size={12} /> Patients ({patients.length})</div>
      <div className="flex-1 overflow-y-auto">
        {patients.length === 0 && <p className="px-6 text-sm text-[#26314F]/40 italic mt-2">No patients yet — register one to begin.</p>}
        {patients.map((p) => (
          <button key={p.id} onClick={() => onSelect(p.id)} className={`w-full text-left px-6 py-3 border-l-2 transition-colors ${selectedId === p.id ? "border-[#26314F] bg-[#26314F]/[0.04]" : "border-transparent hover:bg-[#26314F]/[0.02]"}`}>
            <div className="text-[15px] text-[#26314F]" style={{ fontFamily: "Fraunces, serif" }}>{p.name}</div>
            <div className="text-xs text-[#26314F]/45 mt-0.5">{p.sessions.length} session{p.sessions.length !== 1 ? "s" : ""}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsPanel({ apiKey, onSave, onClose }) {
  const [value, setValue] = useState(apiKey);
  return (
    <div className="max-w-md mx-auto mt-16 px-6">
      <h2 className="text-2xl text-[#26314F] mb-1" style={{ fontFamily: "Fraunces, serif" }}>Settings</h2>
      <p className="text-sm text-[#26314F]/55 mb-6 leading-relaxed">Paste your free Gemini API key from Google AI Studio. It's stored only in this workspace's private storage — never sent anywhere except directly to Google's API when you record or upload a session.</p>
      <label className="text-xs text-[#26314F]/50 flex items-center gap-1.5 mb-1.5"><Key size={12} /> Gemini API key</label>
      <input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="AIza..." className="w-full border border-[#26314F]/20 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#26314F]/50" />
      <div className="flex gap-3 mt-6">
        <button onClick={() => onSave(value)} className="bg-[#26314F] text-[#FAF6EF] text-sm px-4 py-2 rounded-sm hover:bg-[#26314F]/90">Save key</button>
        <button onClick={onClose} className="text-sm text-[#26314F]/60 px-4 py-2 hover:text-[#26314F]">Close</button>
      </div>
    </div>
  );
}

function AddPatientForm({ onCancel, onSave }) {
  const [form, setForm] = useState({ name: "", age: "", email: "", address: "" });
  return (
    <div className="max-w-md mx-auto mt-16 px-6">
      <h2 className="text-2xl text-[#26314F] mb-1" style={{ fontFamily: "Fraunces, serif" }}>Register patient</h2>
      <p className="text-sm text-[#26314F]/55 mb-8">Basic details create their profile.</p>
      <div className="space-y-4">
        {["name", "age", "email", "address"].map((field) => (
          <div key={field}>
            <label className="text-xs text-[#26314F]/50 capitalize block mb-1.5">{field}</label>
            <input value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} className="w-full border border-[#26314F]/20 rounded-sm px-3 py-2 text-sm text-[#26314F] bg-white focus:outline-none focus:border-[#26314F]/50" />
          </div>
        ))}
      </div>
      <div className="flex gap-3 mt-8">
        <button onClick={() => onSave(form)} disabled={!form.name} className="bg-[#26314F] text-[#FAF6EF] text-sm px-4 py-2 rounded-sm hover:bg-[#26314F]/90 disabled:opacity-40">Create profile</button>
        <button onClick={onCancel} className="text-sm text-[#26314F]/60 px-4 py-2 hover:text-[#26314F]">Cancel</button>
      </div>
    </div>
  );
}

function EngageFlow({ apiKey, onSave }) {
  const [stage, setStage] = useState("ready");
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [summary, setSummary] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    let interval;
    if (stage === "recording") interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [stage]);

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const startRecording = async () => {
    if (!apiKey) { setErrorMsg("Add your Gemini API key in Settings first."); setStage("error"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.start();
      mediaRecorderRef.current = recorder;
      setStage("recording");
    } catch (e) {
      setErrorMsg("Couldn't access microphone: " + e.message);
      setStage("error");
    }
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    setStage("processing");
    recorder.onstop = async () => {
      try {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const base64 = await blobToBase64(blob);
        const result = await transcribeAndSummarize(apiKey, base64, "audio/webm");
        setTranscript(result.transcript);
        setSummary(result.summary);
        setStage("review");
      } catch (e) {
        setErrorMsg(e.message);
        setStage("error");
      }
    };
    recorder.stop();
    recorder.stream.getTracks().forEach((t) => t.stop());
  };

  if (stage === "error") {
    return (
      <div className="border border-[#B96B72]/30 rounded-sm p-6 bg-[#B96B72]/5">
        <div className="text-sm text-[#B96B72] mb-3">{errorMsg}</div>
        <button onClick={() => setStage("ready")} className="text-sm text-[#26314F] border border-[#26314F]/30 rounded-sm px-3 py-1.5 hover:bg-[#26314F]/5">Try again</button>
      </div>
    );
  }
  if (stage === "ready") {
    return (
      <div className="border border-[#26314F]/15 rounded-sm p-6 bg-white">
        <div className="text-sm text-[#26314F]/55 mb-4">Ready to begin this session.</div>
        <button onClick={startRecording} className="flex items-center gap-2 bg-[#26314F] text-[#FAF6EF] text-sm px-4 py-2 rounded-sm hover:bg-[#26314F]/90"><Mic size={14} /> Start recording</button>
      </div>
    );
  }
  if (stage === "recording") {
    return (
      <div className="border border-[#26314F]/15 rounded-sm p-6 bg-white">
        <div className="flex items-center gap-2 text-[#B96B72] text-sm mb-1"><span className="w-2 h-2 rounded-full bg-[#B96B72] animate-pulse" /> Recording</div>
        <div className="text-4xl text-[#26314F] mb-5" style={{ fontFamily: "Fraunces, serif" }}>{fmt(seconds)}</div>
        <button onClick={stopRecording} className="flex items-center gap-2 border border-[#26314F]/30 text-[#26314F] text-sm px-4 py-2 rounded-sm hover:bg-[#26314F]/5"><Square size={13} /> End session</button>
      </div>
    );
  }
  if (stage === "processing") {
    return <div className="border border-[#26314F]/15 rounded-sm p-6 bg-white flex items-center gap-3 text-sm text-[#26314F]/60"><Loader2 size={16} className="animate-spin" /> Sending to Gemini for transcript + summary...</div>;
  }
  return (
    <div className="border border-[#26314F]/15 rounded-sm p-6 bg-white">
      <div className="text-sm text-[#26314F]/55 mb-3">Review summary before saving — this goes to the client.</div>
      <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={5} className="w-full border border-[#26314F]/20 rounded-sm px-3 py-2 text-sm text-[#26314F] leading-relaxed focus:outline-none focus:border-[#26314F]/50 mb-3" />
      <details className="mb-4">
        <summary className="text-xs text-[#26314F]/45 cursor-pointer">View full transcript (locked)</summary>
        <div className="text-xs text-[#26314F]/60 mt-2 whitespace-pre-line max-h-40 overflow-y-auto border-t border-[#26314F]/10 pt-2">{transcript}</div>
      </details>
      <button onClick={() => onSave({ transcript, summary })} className="bg-[#26314F] text-[#FAF6EF] text-sm px-4 py-2 rounded-sm hover:bg-[#26314F]/90">Save to profile</button>
    </div>
  );
}

function UploadFlow({ apiKey, onSave, onCancel }) {
  const [stage, setStage] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!apiKey) { setErrorMsg("Add your Gemini API key in Settings first."); setStage("error"); return; }
    setStage("processing");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const docText = result.value;
      const summary = await summarizeUploadedText(apiKey, docText);
      onSave({ transcript: docText, summary, source: "upload" });
    } catch (err) {
      setErrorMsg("Couldn't read that file: " + err.message);
      setStage("error");
    }
  };

  if (stage === "error") {
    return (
      <div className="border border-[#B96B72]/30 rounded-sm p-6 bg-[#B96B72]/5">
        <div className="text-sm text-[#B96B72] mb-3">{errorMsg}</div>
        <button onClick={onCancel} className="text-sm text-[#26314F] border border-[#26314F]/30 rounded-sm px-3 py-1.5 hover:bg-[#26314F]/5">Close</button>
      </div>
    );
  }
  if (stage === "processing") {
    return <div className="border border-[#26314F]/15 rounded-sm p-6 bg-white flex items-center gap-3 text-sm text-[#26314F]/60"><Loader2 size={16} className="animate-spin" /> Reading document and generating summary...</div>;
  }
  return (
    <div className="border border-dashed border-[#26314F]/25 rounded-sm p-6 bg-white text-center">
      <input ref={fileInputRef} type="file" accept=".docx" onChange={handleFile} className="hidden" />
      <p className="text-sm text-[#26314F]/55 mb-3">Upload a past session Word file (.docx). It'll be added as a session and the clinical tabs will update from it.</p>
      <div className="flex gap-3 justify-center">
        <button onClick={() => fileInputRef.current.click()} className="flex items-center gap-2 bg-[#26314F] text-[#FAF6EF] text-sm px-4 py-2 rounded-sm hover:bg-[#26314F]/90"><Upload size={14} /> Choose .docx file</button>
        <button onClick={onCancel} className="text-sm text-[#26314F]/60 px-4 py-2 hover:text-[#26314F]">Cancel</button>
      </div>
      <p className="text-xs text-[#26314F]/40 mt-3">Only .docx is supported for now (not .doc or .pdf).</p>
    </div>
  );
}

function MeetLinkBox({ patient, onSaveLink }) {
  const hasLink = Boolean(patient.meetLink && patient.meetLink.trim());
  const [editing, setEditing] = useState(!hasLink);
  const [value, setValue] = useState(patient.meetLink || "");
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(patient.meetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (editing) {
    return (
      <div className="border border-[#26314F]/15 rounded-sm p-4 bg-white mb-5">
        <label className="text-xs text-[#26314F]/50 flex items-center gap-1.5 mb-1.5"><Link2 size={12} /> Google Meet link for this client</label>
        <div className="flex gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Paste the Meet link once — reuse it every session"
            className="flex-1 border border-[#26314F]/20 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#26314F]/50"
          />
          <button
            onClick={() => { onSaveLink(value); setEditing(false); }}
            disabled={!value}
            className="bg-[#26314F] text-[#FAF6EF] text-sm px-3 py-2 rounded-sm hover:bg-[#26314F]/90 disabled:opacity-40"
          >
            Save
          </button>
        </div>
        <p className="text-xs text-[#26314F]/40 mt-2">Create this once in Google Calendar/Meet and paste it here — same link is reused every session.</p>
      </div>
    );
  }

  return (
    <div className="border border-[#26314F]/15 rounded-sm p-4 bg-white mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Link2 size={14} className="text-[#26314F]/40 shrink-0" />
        <span className="text-sm text-[#26314F]/80 truncate">{patient.meetLink}</span>
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs border border-[#26314F]/25 text-[#26314F] px-2.5 py-1.5 rounded-sm hover:bg-[#26314F]/5">
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
        </button>
        <a
          href={mailtoLink(patient.email, "Your session link", `Hi ${patient.name},\n\nHere is the link for our session: ${patient.meetLink}\n\nSee you then.`)}
          className="flex items-center gap-1.5 text-xs border border-[#26314F]/25 text-[#26314F] px-2.5 py-1.5 rounded-sm hover:bg-[#26314F]/5"
        >
          <Send size={12} /> Email link
        </a>
        <button onClick={() => setEditing(true)} className="text-xs text-[#26314F]/45 px-2.5 py-1.5 hover:text-[#26314F]">Edit</button>
      </div>
    </div>
  );
}

function TherapistNotes({ patient, onAddNote, onEditNote, onDeleteNote }) {
  const [draft, setDraft] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState("");
  const notes = patient.notes || [];

  const handleAdd = () => {
    if (!draft.trim()) return;
    onAddNote(draft.trim());
    setDraft("");
  };

  const startEdit = (originalIndex, currentText) => {
    setEditingIndex(originalIndex);
    setEditValue(currentText);
  };

  const saveEdit = (originalIndex) => {
    if (editValue.trim()) onEditNote(originalIndex, editValue.trim());
    setEditingIndex(null);
  };

  return (
    <div className="mb-9">
      <button onClick={() => setExpanded(!expanded)} className="text-xs tracking-wide text-[#26314F]/45 mb-3 flex items-center gap-1.5">
        <StickyNote size={12} /> Therapist notes {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {expanded && (
        <div className="border border-[#26314F]/12 rounded-sm bg-white p-4">
          <div className="flex gap-2 mb-4">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder="Add a note for yourself — date-stamped automatically"
              className="flex-1 border border-[#26314F]/20 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#26314F]/50"
            />
            <button onClick={handleAdd} className="bg-[#26314F] text-[#FAF6EF] text-sm px-3 py-2 rounded-sm hover:bg-[#26314F]/90">Add</button>
          </div>
          {notes.length === 0 ? (
            <p className="text-sm text-[#26314F]/40 italic">No notes yet.</p>
          ) : (
            <div className="space-y-3">
              {notes.map((n, originalIndex) => originalIndex).reverse().map((originalIndex) => {
                const n = notes[originalIndex];
                const isEditing = editingIndex === originalIndex;
                return (
                  <div key={originalIndex} className="text-sm border-l-2 border-[#26314F]/15 pl-3 group">
                    <div className="text-xs text-[#26314F]/40 mb-0.5">{n.date}</div>
                    {isEditing ? (
                      <div>
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit(originalIndex)}
                          autoFocus
                          className="w-full border border-[#26314F]/25 rounded-sm px-2 py-1 text-sm mb-1.5 focus:outline-none focus:border-[#26314F]/50"
                        />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(originalIndex)} className="text-xs text-[#26314F] border border-[#26314F]/25 px-2 py-1 rounded-sm hover:bg-[#26314F]/5">Save</button>
                          <button onClick={() => setEditingIndex(null)} className="text-xs text-[#26314F]/50 flex items-center gap-1 px-2 py-1 hover:text-[#26314F]"><X size={11} /> Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[#26314F]/80">{n.text}</div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => startEdit(originalIndex, n.text)} className="text-[#26314F]/40 hover:text-[#26314F] p-0.5"><Edit2 size={12} /></button>
                          <button onClick={() => onDeleteNote(originalIndex)} className="text-[#26314F]/40 hover:text-[#B96B72] p-0.5"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabContent({ tabKey, data }) {
  if (tabKey === "lifeContext") {
    if (!data || !data.length) return <p className="text-sm text-[#26314F]/45 italic">Nothing recorded yet.</p>;
    return (
      <div className="space-y-4">
        {data.map((entry, i) => (
          <div key={i}>
            <div className="text-sm text-[#26314F] font-medium">{entry.name} <span className="text-xs text-[#26314F]/40 font-normal">— {entry.type}</span></div>
            <div className="mt-1 space-y-1">
              {entry.mentions.map((m, j) => (
                <div key={j} className="text-sm text-[#26314F]/70 flex gap-2">
                  <span className="text-xs text-[#26314F]/40 shrink-0 pt-0.5 w-20">{m.date}</span>
                  <span>{m.note}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (tabKey === "openThreads") {
    if (!data || !data.length) return <p className="text-sm text-[#26314F]/45 italic">No threads yet.</p>;
    return (
      <div className="space-y-2.5">
        {data.map((t, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${t.status === "resolved" ? "bg-[#8A9A7E]" : "bg-[#B96B72]"}`} />
            <div>
              <div className={`text-sm ${t.status === "resolved" ? "text-[#26314F]/45 line-through" : "text-[#26314F]"}`}>{t.desc}</div>
              {t.resolution && <div className="text-xs text-[#8A9A7E] mt-0.5">{t.resolution}</div>}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-sm text-[#26314F]/75 leading-relaxed whitespace-pre-line">{data}</p>;
}

function SessionRow({ session, index, patientEmail, patientName }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#26314F]/8">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between py-2.5 text-sm text-left">
        <span className="text-[#26314F] flex items-center gap-1.5">
          Session {index + 1}{session.source === "upload" ? " (uploaded)" : ""}
          {open ? <ChevronUp size={12} className="text-[#26314F]/40" /> : <ChevronDown size={12} className="text-[#26314F]/40" />}
        </span>
        <span className="text-[#26314F]/45">{session.date}</span>
      </button>
      {open && (
        <div className="pb-3 pl-1">
          <div className="text-sm text-[#26314F]/75 leading-relaxed bg-white border border-[#26314F]/10 rounded-sm p-3 mb-2">
            {session.summary}
          </div>
          <a
            href={mailtoLink(patientEmail, `Session Summary — ${session.date}`, `Hi ${patientName},\n\n${session.summary}\n\nWarm regards.`)}
            className="inline-flex items-center gap-1.5 text-xs text-[#26314F] border border-[#26314F]/25 px-2.5 py-1.5 rounded-sm hover:bg-[#26314F]/5"
          >
            <Mail size={12} /> Email this summary
          </a>
        </div>
      )}
    </div>
  );
}

function Profile({ patient, apiKey, onSaveSession, onAddNote, onEditNote, onDeleteNote, onSaveMeetLink }) {
  const [activeTab, setActiveTab] = useState("brief");
  const [mode, setMode] = useState("none");
  const [tabsUpdating, setTabsUpdating] = useState(false);

  const handleSessionData = async (sessionData) => {
    setMode("none");
    setTabsUpdating(true);
    await onSaveSession(patient.id, sessionData);
    setTabsUpdating(false);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-10 pt-9 pb-6 border-b border-[#26314F]/10">
        <h2 className="text-3xl text-[#26314F]" style={{ fontFamily: "Fraunces, serif" }}>{patient.name}</h2>
        <div className="flex gap-4 text-sm text-[#26314F]/50 mt-2">
          <span>{patient.age} yrs</span><span>{patient.email}</span><span>{patient.address}</span>
        </div>
      </div>
      <div className="px-10 py-7 max-w-4xl">
        <MeetLinkBox patient={patient} onSaveLink={(link) => onSaveMeetLink(patient.id, link)} />

        {mode === "none" ? (
          <div className="flex gap-3 mb-8">
            <button onClick={() => setMode("engage")} className="flex items-center gap-2 bg-[#26314F] text-[#FAF6EF] text-sm px-4 py-2.5 rounded-sm hover:bg-[#26314F]/90"><Play size={14} /> Engage</button>
            <button onClick={() => setMode("upload")} className="flex items-center gap-2 border border-[#26314F]/25 text-[#26314F] text-sm px-4 py-2.5 rounded-sm hover:bg-[#26314F]/5"><Upload size={14} /> Upload past session</button>
          </div>
        ) : mode === "engage" ? (
          <div className="mb-8"><EngageFlow apiKey={apiKey} onSave={handleSessionData} /></div>
        ) : (
          <div className="mb-8"><UploadFlow apiKey={apiKey} onSave={handleSessionData} onCancel={() => setMode("none")} /></div>
        )}

        {tabsUpdating && (
          <div className="mb-8 text-sm text-[#26314F]/50 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Updating clinical tabs from this session...</div>
        )}

        <div className="mb-9">
          <h3 className="text-xs tracking-wide text-[#26314F]/45 mb-3 flex items-center gap-1.5"><Clock size={12} /> Sessions</h3>
          {patient.sessions.length === 0 ? (
            <p className="text-sm text-[#26314F]/40 italic">No sessions recorded yet.</p>
          ) : (
            <div>
              {patient.sessions.map((s, i) => (
                <SessionRow key={i} session={s} index={i} patientEmail={patient.email} patientName={patient.name} />
              ))}
            </div>
          )}
        </div>

        <TherapistNotes
          patient={patient}
          onAddNote={(text) => onAddNote(patient.id, text)}
          onEditNote={(index, text) => onEditNote(patient.id, index, text)}
          onDeleteNote={(index) => onDeleteNote(patient.id, index)}
        />

        <div>
          <h3 className="text-xs tracking-wide text-[#26314F]/45 mb-3 flex items-center gap-1.5"><AlertCircle size={12} /> Clinical assistant</h3>
          <div className="border border-[#26314F]/12 rounded-sm bg-white">
            <div className="flex border-b border-[#26314F]/10 overflow-x-auto">
              {tabList.map((t) => (
                <button key={t.key} onClick={() => setActiveTab(t.key)} className={`px-4 py-3 text-xs whitespace-nowrap border-b-2 transition-colors ${activeTab === t.key ? "border-[#26314F] text-[#26314F]" : "border-transparent text-[#26314F]/45 hover:text-[#26314F]/70"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="p-5"><TabContent tabKey={activeTab} data={patient.tabs[activeTab]} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClinicApp() {
  const [patients, setPatients] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [loadedPatients, loadedKey] = await Promise.all([loadPatients(), loadApiKey()]);
      setPatients(loadedPatients);
      setApiKey(loadedKey);
      if (loadedPatients.length) setSelectedId(loadedPatients[0].id);
      setLoading(false);
    })();
  }, []);

  const selected = patients.find((p) => p.id === selectedId);

  const handleAddPatient = async (form) => {
    const newPatient = {
      id: `p_${Date.now()}`,
      name: form.name,
      age: form.age || "—",
      email: form.email || "—",
      address: form.address || "—",
      sessions: [],
      notes: [],
      meetLink: "",
      tabs: { ...emptyTabs },
    };
    const updated = [...patients, newPatient];
    setPatients(updated);
    await savePatients(updated);
    setSelectedId(newPatient.id);
    setAdding(false);
  };

  const handleSaveSession = async (patientId, sessionData) => {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;
    const sessionDate = todayStr();

    let updatedTabs = patient.tabs;
    try {
      updatedTabs = await processAllTabs(apiKey, patient, sessionData.transcript, sessionDate);
    } catch (e) {
      console.error("Tab processing failed:", e);
    }

    const newSession = { date: sessionDate, source: sessionData.source || "recording", ...sessionData };
    const updated = patients.map((p) => (p.id !== patientId ? p : { ...p, sessions: [...p.sessions, newSession], tabs: updatedTabs }));
    setPatients(updated);
    await savePatients(updated);
  };

  const handleAddNote = async (patientId, text) => {
    const updated = patients.map((p) =>
      p.id !== patientId ? p : { ...p, notes: [...(p.notes || []), { date: todayStr(), text }] }
    );
    setPatients(updated);
    await savePatients(updated);
  };

  const handleEditNote = async (patientId, index, newText) => {
    const updated = patients.map((p) => {
      if (p.id !== patientId) return p;
      const notes = [...(p.notes || [])];
      notes[index] = { ...notes[index], text: newText };
      return { ...p, notes };
    });
    setPatients(updated);
    await savePatients(updated);
  };

  const handleDeleteNote = async (patientId, index) => {
    const updated = patients.map((p) => {
      if (p.id !== patientId) return p;
      const notes = (p.notes || []).filter((_, i) => i !== index);
      return { ...p, notes };
    });
    setPatients(updated);
    await savePatients(updated);
  };

  const handleSaveMeetLink = async (patientId, link) => {
    const updated = patients.map((p) => (p.id !== patientId ? p : { ...p, meetLink: link }));
    setPatients(updated);
    await savePatients(updated);
  };

  const handleSaveKey = async (key) => {
    setApiKey(key);
    await saveApiKey(key);
    setShowSettings(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-[700px] bg-[#FAF6EF] text-[#26314F]/50 text-sm"><Loader2 size={16} className="animate-spin mr-2" /> Loading workspace...</div>;
  }

  return (
    <div className="flex h-[700px] bg-[#FAF6EF]" style={{ fontFamily: "Inter, sans-serif" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Inter:wght@400;500&display=swap" />
      <Sidebar patients={patients} selectedId={selectedId} onSelect={(id) => { setSelectedId(id); setAdding(false); setShowSettings(false); }} onAddClick={() => { setAdding(true); setShowSettings(false); }} onSettingsClick={() => { setShowSettings(true); setAdding(false); }} />
      {showSettings ? (
        <div className="flex-1 overflow-y-auto"><SettingsPanel apiKey={apiKey} onSave={handleSaveKey} onClose={() => setShowSettings(false)} /></div>
      ) : adding ? (
        <div className="flex-1 overflow-y-auto"><AddPatientForm onCancel={() => setAdding(false)} onSave={handleAddPatient} /></div>
      ) : selected ? (
        <Profile
          key={selected.id}
          patient={selected}
          apiKey={apiKey}
          onSaveSession={handleSaveSession}
          onAddNote={handleAddNote}
          onEditNote={handleEditNote}
          onDeleteNote={handleDeleteNote}
          onSaveMeetLink={handleSaveMeetLink}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-[#26314F]/40 text-sm">Register a patient to begin.</div>
      )}
    </div>
  );
}
