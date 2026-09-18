import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req, { params }) {
  const { id } = await params;
  const { text } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: "Note text required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("notes")
    .insert({ patient_id: id, note_date: new Date().toISOString().slice(0, 10), text: text.trim() })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: { id: data.id, date: data.note_date, text: data.text } });
}
