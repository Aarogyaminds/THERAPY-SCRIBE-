import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { transcribeAndSummarize, summarizeUploadedText } from "@/lib/gemini";
import { buildSessionDocx } from "@/lib/docx";
import { processAllTabs, loadPatientTabs } from "@/lib/tabs";

// Transcribing a full session + regenerating all 5 tabs is several sequential
// Gemini calls — comfortably longer than Vercel's default serverless timeout.
export const maxDuration = 60;

export async function POST(req) {
  const body = await req.json();
  const { patientId, mode } = body;
  if (!patientId || !mode) return NextResponse.json({ error: "patientId and mode are required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: patient, error: patientErr } = await db.from("patients").select("*").eq("id", patientId).single();
  if (patientErr) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

  let transcript, summary, consentGivenAt = null, consentMethod = null;

  try {
    if (mode === "recording") {
      const { audioPath, mimeType, consentGivenAt: consentAt } = body;
      if (!consentAt) {
        return NextResponse.json({ error: "Recording requires timestamped in-app consent before it can be processed." }, { status: 400 });
      }
      if (!audioPath) return NextResponse.json({ error: "audioPath is required" }, { status: 400 });

      const { data: audioBlob, error: dlErr } = await db.storage.from("session-audio").download(audioPath);
      if (dlErr) throw new Error(`Could not read uploaded audio: ${dlErr.message}`);
      const arrayBuffer = await audioBlob.arrayBuffer();
      const base64Audio = Buffer.from(arrayBuffer).toString("base64");

      const result = await transcribeAndSummarize(base64Audio, mimeType || "audio/webm");
      transcript = result.transcript;
      summary = result.summary;
      consentGivenAt = consentAt;
      consentMethod = "in-app-checkbox";

      db.storage.from("session-audio").remove([audioPath]).catch(() => {});
    } else if (mode === "upload") {
      const { docText } = body;
      if (!docText?.trim()) return NextResponse.json({ error: "docText is required" }, { status: 400 });
      transcript = docText;
      summary = await summarizeUploadedText(docText);
    } else {
      return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: `Gemini processing failed: ${e.message}` }, { status: 502 });
  }

  const sessionDate = body.sessionDate || new Date().toISOString().slice(0, 10);

  const { data: session, error: insertErr } = await db
    .from("sessions")
    .insert({
      patient_id: patientId,
      session_date: sessionDate,
      source: mode === "upload" ? "upload" : "recording",
      transcript,
      summary,
      consent_given_at: consentGivenAt,
      consent_method: consentMethod,
    })
    .select()
    .single();
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  try {
    const docxBuffer = await buildSessionDocx({ patientName: patient.name, sessionDate, transcript, summary });
    const docxPath = `${patientId}/${session.id}.docx`;
    const { error: uploadErr } = await db.storage.from("session-docs").upload(docxPath, docxBuffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    if (!uploadErr) {
      await db.from("sessions").update({ docx_path: docxPath }).eq("id", session.id);
    }
  } catch (e) {
    console.error("docx generation failed:", e);
  }

  const { errors: tabErrors } = await processAllTabs(patientId, transcript, sessionDate);
  const tabs = await loadPatientTabs(patientId);

  return NextResponse.json({
    session: { id: session.id, date: sessionDate, source: session.source, summary },
    tabs,
    tabErrors,
  });
}
