"use client";
import { useState } from "react";
import { Link2, Copy, Check, Send } from "lucide-react";
import { mailtoLink } from "@/lib/clientUtils";

export default function MeetLinkBox({ patient, onSaveLink }) {
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
        <p className="text-xs text-[#26314F]/40 mt-2">
          Create this once in Google Calendar/Meet and paste it here — same link is reused every session.
          (Auto-generation via the Calendar API is a planned upgrade, not built yet.)
        </p>
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
