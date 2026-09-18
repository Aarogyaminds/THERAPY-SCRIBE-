"use client";
import { useState, useRef } from "react";
import mammoth from "mammoth";
import { Upload, Loader2 } from "lucide-react";

export default function UploadFlow({ patientId, onDone, onCancel }) {
  const [stage, setStage] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStage("processing");
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const docText = result.value;

      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, mode: "upload", docText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Processing failed");
      onDone(data.tabErrors || []);
    } catch (err) {
      setErrorMsg("Couldn't process that file: " + err.message);
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
    return (
      <div className="border border-[#26314F]/15 rounded-sm p-6 bg-white flex items-center gap-3 text-sm text-[#26314F]/60">
        <Loader2 size={16} className="animate-spin" /> Reading document and generating summary...
      </div>
    );
  }
  return (
    <div className="border border-dashed border-[#26314F]/25 rounded-sm p-6 bg-white text-center">
      <input ref={fileInputRef} type="file" accept=".docx" onChange={handleFile} className="hidden" />
      <p className="text-sm text-[#26314F]/55 mb-3">
        Upload a past session Word file (.docx). It&apos;ll be added as a session and the clinical tabs will update from it.
      </p>
      <div className="flex gap-3 justify-center">
        <button onClick={() => fileInputRef.current.click()} className="flex items-center gap-2 bg-[#26314F] text-[#FAF6EF] text-sm px-4 py-2 rounded-sm hover:bg-[#26314F]/90">
          <Upload size={14} /> Choose .docx file
        </button>
        <button onClick={onCancel} className="text-sm text-[#26314F]/60 px-4 py-2 hover:text-[#26314F]">Cancel</button>
      </div>
      <p className="text-xs text-[#26314F]/40 mt-3">Only .docx is supported for now (not .doc or .pdf).</p>
    </div>
  );
}
