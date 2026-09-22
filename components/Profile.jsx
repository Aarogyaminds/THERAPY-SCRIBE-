"use client";
import { useState } from "react";
import { Play, Upload, Clock, AlertCircle, Loader2 } from "lucide-react";
import MeetLinkBox from "./MeetLinkBox";
import EngageFlow from "./EngageFlow";
import UploadFlow from "./UploadFlow";
import TherapistNotes from "./TherapistNotes";
import TabContent from "./TabContent";
import SessionRow from "./SessionRow";

const tabList = [
  { key: "brief", label: "Pre-session Brief" },
  { key: "recap", label: "Longitudinal Recap" },
  { key: "lifeContext", label: "Life Context" },
  { key: "patterns", label: "Patterns" },
  { key: "openThreads", label: "Open Threads" },
];
const tabLabel = (key) => tabList.find((t) => t.key === key)?.label || key;

function friendlyTabErrorCause(message) {
  if (message.includes("429")) return "Google's AI service was briefly too busy to respond.";
  if (message.includes("503")) return "Google's AI service had a temporary hiccup.";
  return "Something went wrong talking to the AI service.";
}

export default function Profile({ patient, onRefresh, onSaveMeetLink }) {
  const [activeTab, setActiveTab] = useState("brief");
  const [mode, setMode] = useState("none");
  const [tabErrors, setTabErrors] = useState([]);

  const handleFlowDone = async (errors) => {
    setMode("none");
    setTabErrors(errors || []);
    await onRefresh();
  };

  const handleEditSummary = async (sessionId, summary) => {
    await fetch(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary }),
    });
    await onRefresh();
  };

  const handleAddNote = async (text) => {
    await fetch(`/api/patients/${patient.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    await onRefresh();
  };

  const handleEditNote = async (noteId, text) => {
    await fetch(`/api/patients/${patient.id}/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    await onRefresh();
  };

  const handleDeleteNote = async (noteId) => {
    await fetch(`/api/patients/${patient.id}/notes/${noteId}`, { method: "DELETE" });
    await onRefresh();
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-10 pt-9 pb-6 border-b border-[#26314F]/10">
        <h2 className="text-3xl text-[#26314F]" style={{ fontFamily: "Fraunces, serif" }}>{patient.name}</h2>
        <div className="flex gap-4 text-sm text-[#26314F]/50 mt-2">
          <span>{patient.age || "—"} yrs</span><span>{patient.email || "—"}</span><span>{patient.address || "—"}</span>
        </div>
      </div>
      <div className="px-10 py-7 max-w-4xl">
        <MeetLinkBox patient={patient} onSaveLink={(link) => onSaveMeetLink(patient.id, link)} />

        {tabErrors.length > 0 && (
          <div className="mb-6 border border-[#B96B72]/30 bg-[#B96B72]/5 rounded-sm p-4 text-sm text-[#B96B72]">
            This session saved fine, but {tabErrors.length === 1 ? "one clinical tab" : `${tabErrors.length} clinical tabs`} didn't
            update — they've been left as they were, nothing was lost:
            <ul className="list-disc ml-5 mt-1">
              {tabErrors.map((e, i) => (
                <li key={i}>
                  <span className="font-medium">{tabLabel(e.tab)}</span> — {friendlyTabErrorCause(e.message)}
                  <details className="inline ml-1">
                    <summary className="inline cursor-pointer text-xs text-[#B96B72]/70">details</summary>
                    <div className="text-xs mt-1 whitespace-pre-wrap">{e.message}</div>
                  </details>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">The session and its transcript are safely saved either way. This is rare — it already retries automatically a few times before showing here.</p>
          </div>
        )}

        {mode === "none" ? (
          <div className="flex gap-3 mb-8">
            <button onClick={() => setMode("engage")} className="flex items-center gap-2 bg-[#26314F] text-[#FAF6EF] text-sm px-4 py-2.5 rounded-sm hover:bg-[#26314F]/90">
              <Play size={14} /> Engage
            </button>
            <button onClick={() => setMode("upload")} className="flex items-center gap-2 border border-[#26314F]/25 text-[#26314F] text-sm px-4 py-2.5 rounded-sm hover:bg-[#26314F]/5">
              <Upload size={14} /> Upload past session
            </button>
          </div>
        ) : mode === "engage" ? (
          <div className="mb-8"><EngageFlow patientId={patient.id} onDone={handleFlowDone} onCancel={() => setMode("none")} /></div>
        ) : (
          <div className="mb-8"><UploadFlow patientId={patient.id} onDone={handleFlowDone} onCancel={() => setMode("none")} /></div>
        )}

        <div className="mb-9">
          <h3 className="text-xs tracking-wide text-[#26314F]/45 mb-3 flex items-center gap-1.5"><Clock size={12} /> Sessions</h3>
          {patient.sessions.length === 0 ? (
            <p className="text-sm text-[#26314F]/40 italic">No sessions recorded yet.</p>
          ) : (
            <div>
              {patient.sessions.map((s, i) => (
                <SessionRow key={s.id} session={s} index={i} patientEmail={patient.email} patientName={patient.name} onEditSummary={handleEditSummary} />
              ))}
            </div>
          )}
        </div>

        <TherapistNotes notes={patient.notes} onAddNote={handleAddNote} onEditNote={handleEditNote} onDeleteNote={handleDeleteNote} />

        <div>
          <h3 className="text-xs tracking-wide text-[#26314F]/45 mb-3 flex items-center gap-1.5"><AlertCircle size={12} /> Clinical assistant</h3>
          <div className="border border-[#26314F]/12 rounded-sm bg-white">
            <div className="flex border-b border-[#26314F]/10 overflow-x-auto">
              {tabList.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`px-4 py-3 text-xs whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === t.key ? "border-[#26314F] text-[#26314F]" : "border-transparent text-[#26314F]/45 hover:text-[#26314F]/70"
                  }`}
                >
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
