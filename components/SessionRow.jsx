"use client";
import { useState } from "react";
import { Mail, ChevronDown, ChevronUp, Download, Edit2 } from "lucide-react";
import { mailtoLink } from "@/lib/clientUtils";

export default function SessionRow({ session, index, patientEmail, patientName, onEditSummary }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(session.summary);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await onEditSummary(session.id, value);
    setSaving(false);
    setEditing(false);
  };

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
          {editing ? (
            <div className="mb-2">
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={4}
                className="w-full border border-[#26314F]/20 rounded-sm px-3 py-2 text-sm text-[#26314F] leading-relaxed focus:outline-none focus:border-[#26314F]/50 mb-2"
              />
              <div className="flex gap-2">
                <button onClick={save} disabled={saving} className="text-xs text-[#FAF6EF] bg-[#26314F] px-2.5 py-1.5 rounded-sm hover:bg-[#26314F]/90 disabled:opacity-40">
                  {saving ? "Saving..." : "Save"}
                </button>
                <button onClick={() => { setEditing(false); setValue(session.summary); }} className="text-xs text-[#26314F]/50 px-2.5 py-1.5 hover:text-[#26314F]">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[#26314F]/75 leading-relaxed bg-white border border-[#26314F]/10 rounded-sm p-3 mb-2">
              {session.summary}
            </div>
          )}
          <div className="flex gap-2">
            <a
              href={mailtoLink(patientEmail, `Session Summary — ${session.date}`, `Hi ${patientName},\n\n${session.summary}\n\nWarm regards.`)}
              className="inline-flex items-center gap-1.5 text-xs text-[#26314F] border border-[#26314F]/25 px-2.5 py-1.5 rounded-sm hover:bg-[#26314F]/5"
            >
              <Mail size={12} /> Email this summary
            </a>
            {!editing && (
              <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-xs text-[#26314F] border border-[#26314F]/25 px-2.5 py-1.5 rounded-sm hover:bg-[#26314F]/5">
                <Edit2 size={12} /> Edit summary
              </button>
            )}
            {session.hasDocx && (
              <a
                href={`/api/sessions/${session.id}/docx`}
                className="inline-flex items-center gap-1.5 text-xs text-[#26314F] border border-[#26314F]/25 px-2.5 py-1.5 rounded-sm hover:bg-[#26314F]/5"
              >
                <Download size={12} /> Download .docx
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
