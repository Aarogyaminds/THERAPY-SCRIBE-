"use client";
import { useState, useEffect, useRef } from "react";
import { Mic, ScreenShare, Square, Loader2 } from "lucide-react";
import ConsentStep from "./ConsentStep";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function fmt(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// onDone(tabErrors) is called once the session + tabs are fully saved server-side;
// the caller is expected to refetch the patient rather than merge state by hand.
export default function EngageFlow({ patientId, onDone, onCancel }) {
  const [stage, setStage] = useState("consent"); // consent | chooseMode | recording | processing | review | error
  const [seconds, setSeconds] = useState(0);
  const [summary, setSummary] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [consentGivenAt, setConsentGivenAt] = useState(null);
  const sessionIdRef = useRef(null);
  const tabErrorsRef = useRef([]);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamsRef = useRef([]);

  useEffect(() => {
    let interval;
    if (stage === "recording") interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [stage]);

  const startWithStream = (stream) => {
    streamsRef.current.push(stream);
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.start();
    mediaRecorderRef.current = recorder;
    setStage("recording");
  };

  const startOffline = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startWithStream(stream);
    } catch (e) {
      setErrorMsg("Couldn't access microphone: " + e.message);
      setStage("error");
    }
  };

  const startOnline = async () => {
    try {
      // Clinician joins the Meet call, then shares that tab/screen WITH audio here —
      // the client's voice comes through speakers, not the mic, so this is the only
      // way to capture both sides on desktop Chrome.
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error('No audio track was shared — enable "Share tab audio" / "Share system audio" in the picker.');
      }
      startWithStream(stream);
    } catch (e) {
      setErrorMsg("Couldn't capture call audio: " + e.message);
      setStage("error");
    }
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    setStage("processing");
    recorder.onstop = async () => {
      streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
      try {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });

        const urlRes = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId, ext: "webm" }),
        });
        const urlData = await urlRes.json();
        if (!urlRes.ok) throw new Error(urlData.error || "Could not prepare upload");

        const supabase = supabaseBrowser();
        const { error: uploadErr } = await supabase.storage.from("session-audio").uploadToSignedUrl(urlData.path, urlData.token, blob);
        if (uploadErr) throw new Error(uploadErr.message);

        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId,
            mode: "recording",
            audioPath: urlData.path,
            mimeType: "audio/webm",
            consentGivenAt,
            sessionDate: new Date().toISOString().slice(0, 10),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Processing failed");

        sessionIdRef.current = data.session.id;
        tabErrorsRef.current = data.tabErrors || [];
        setSummary(data.session.summary);
        setStage("review");
      } catch (e) {
        setErrorMsg(e.message);
        setStage("error");
      }
    };
    recorder.stop();
  };

  const finish = async () => {
    if (sessionIdRef.current) {
      await fetch(`/api/sessions/${sessionIdRef.current}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary }),
      });
    }
    onDone(tabErrorsRef.current);
  };

  if (stage === "consent") {
    return <ConsentStep onConfirm={(iso) => { setConsentGivenAt(iso); setStage("chooseMode"); }} onCancel={onCancel} />;
  }

  if (stage === "chooseMode") {
    return (
      <div className="border border-[#26314F]/15 rounded-sm p-6 bg-white">
        <div className="text-sm text-[#26314F]/55 mb-4">Consent recorded. Choose how this session is happening.</div>
        <div className="flex gap-3">
          <button onClick={startOffline} className="flex items-center gap-2 bg-[#26314F] text-[#FAF6EF] text-sm px-4 py-2 rounded-sm hover:bg-[#26314F]/90">
            <Mic size={14} /> Offline (in person)
          </button>
          <button onClick={startOnline} className="flex items-center gap-2 border border-[#26314F]/25 text-[#26314F] text-sm px-4 py-2 rounded-sm hover:bg-[#26314F]/5">
            <ScreenShare size={14} /> Online (Google Meet)
          </button>
        </div>
        <p className="text-xs text-[#26314F]/40 mt-3">
          Online mode asks you to share the Meet tab/screen — enable &quot;Share tab audio&quot; in the picker.
        </p>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="border border-[#B96B72]/30 rounded-sm p-6 bg-[#B96B72]/5">
        <div className="text-sm text-[#B96B72] mb-3">{errorMsg}</div>
        <button onClick={() => setStage("chooseMode")} className="text-sm text-[#26314F] border border-[#26314F]/30 rounded-sm px-3 py-1.5 hover:bg-[#26314F]/5">
          Try again
        </button>
      </div>
    );
  }

  if (stage === "recording") {
    return (
      <div className="border border-[#26314F]/15 rounded-sm p-6 bg-white">
        <div className="flex items-center gap-2 text-[#B96B72] text-sm mb-1">
          <span className="w-2 h-2 rounded-full bg-[#B96B72] animate-pulse" /> Recording
        </div>
        <div className="text-4xl text-[#26314F] mb-5" style={{ fontFamily: "Fraunces, serif" }}>{fmt(seconds)}</div>
        <button onClick={stopRecording} className="flex items-center gap-2 border border-[#26314F]/30 text-[#26314F] text-sm px-4 py-2 rounded-sm hover:bg-[#26314F]/5">
          <Square size={13} /> End session
        </button>
      </div>
    );
  }

  if (stage === "processing") {
    return (
      <div className="border border-[#26314F]/15 rounded-sm p-6 bg-white flex items-center gap-3 text-sm text-[#26314F]/60">
        <Loader2 size={16} className="animate-spin" /> Uploading audio and generating transcript + summary...
      </div>
    );
  }

  return (
    <div className="border border-[#26314F]/15 rounded-sm p-6 bg-white">
      <div className="text-sm text-[#26314F]/55 mb-3">Review summary before finishing — this is what goes to the client.</div>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={5}
        className="w-full border border-[#26314F]/20 rounded-sm px-3 py-2 text-sm text-[#26314F] leading-relaxed focus:outline-none focus:border-[#26314F]/50 mb-3"
      />
      <p className="text-xs text-[#26314F]/45 mb-4">
        The full transcript has already been saved as the locked clinical record and used to update the clinical tabs below.
      </p>
      <button onClick={finish} className="bg-[#26314F] text-[#FAF6EF] text-sm px-4 py-2 rounded-sm hover:bg-[#26314F]/90">Done</button>
    </div>
  );
}
