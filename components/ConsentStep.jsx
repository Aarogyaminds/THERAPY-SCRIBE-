"use client";
import { useState } from "react";

// Brief Section 5: "Recording requires explicit, timestamped, in-app informed
// consent capture — do not assume consent." This is a hard gate before any
// recording (offline or online) can start.
export default function ConsentStep({ onConfirm, onCancel }) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="border border-[#26314F]/15 rounded-sm p-6 bg-white">
      <div className="text-sm text-[#26314F] mb-3 font-medium">Informed consent</div>
      <label className="flex items-start gap-2.5 text-sm text-[#26314F]/75 leading-relaxed cursor-pointer">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
        I confirm the client has given verbal, informed consent to record this session and to process
        the recording using a third-party AI service (Google Gemini) for transcription and clinical
        documentation.
      </label>
      <div className="flex gap-3 mt-5">
        <button
          onClick={() => onConfirm(new Date().toISOString())}
          disabled={!checked}
          className="bg-[#26314F] text-[#FAF6EF] text-sm px-4 py-2 rounded-sm hover:bg-[#26314F]/90 disabled:opacity-40"
        >
          Confirm & continue
        </button>
        <button onClick={onCancel} className="text-sm text-[#26314F]/60 px-4 py-2 hover:text-[#26314F]">Cancel</button>
      </div>
    </div>
  );
}
