import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadPatientTabs } from "@/lib/tabs";

export async function GET(_req, { params }) {
  const { id } = await params;
  const db = supabaseAdmin();
  const { data: patient, error } = await db.from("patients").select("*").eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  const [{ data: sessions }, { data: notes }, tabs] = await Promise.all([
    db.from("sessions").select("id, session_date, source, summary, docx_path, consent_given_at").eq("patient_id", id).order("created_at"),
    db.from("notes").select("*").eq("patient_id", id).order("created_at"),
    loadPatientTabs(id),
  ]);

  return NextResponse.json({
    patient: {
      id: patient.id,
      name: patient.name,
      email: patient.email,
      age: patient.age,
      address: patient.address,
      meetLink: patient.meet_link,
      sessions: (sessions || []).map((s) => ({
        id: s.id,
        date: s.session_date,
        source: s.source,
        summary: s.summary,
        hasDocx: Boolean(s.docx_path),
        consentGivenAt: s.consent_given_at,
      })),
      notes: (notes || []).map((n) => ({ id: n.id, date: n.note_date, text: n.text })),
      tabs,
    },
  });
}

export async function PATCH(req, { params }) {
  const { id } = await params;
  const body = await req.json();
  const db = supabaseAdmin();
  const update = {};
  if (typeof body.meetLink === "string") update.meet_link = body.meetLink;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { error } = await db.from("patients").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
