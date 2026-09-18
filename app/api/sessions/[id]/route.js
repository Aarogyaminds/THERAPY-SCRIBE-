import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildSessionDocx } from "@/lib/docx";

// Only the summary is editable — the transcript is a locked legal/documentation
// record per the brief (Section 2.1). Editing the summary regenerates the .docx
// so the saved file and the on-screen text never drift apart.
export async function PATCH(req, { params }) {
  const { id } = await params;
  const { summary } = await req.json();
  if (!summary?.trim()) return NextResponse.json({ error: "Summary text required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data: session, error } = await db.from("sessions").select("*, patients(name)").eq("id", id).single();
  if (error) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  await db.from("sessions").update({ summary: summary.trim() }).eq("id", id);

  try {
    const docxBuffer = await buildSessionDocx({
      patientName: session.patients.name,
      sessionDate: session.session_date,
      transcript: session.transcript,
      summary: summary.trim(),
    });
    const docxPath = session.docx_path || `${session.patient_id}/${session.id}.docx`;
    await db.storage.from("session-docs").upload(docxPath, docxBuffer, {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
    if (!session.docx_path) await db.from("sessions").update({ docx_path: docxPath }).eq("id", id);
  } catch (e) {
    console.error("docx regeneration failed:", e);
  }

  return NextResponse.json({ ok: true });
}
