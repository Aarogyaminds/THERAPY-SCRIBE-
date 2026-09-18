import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("patients")
    .select("id, name, email, age, address, meet_link, sessions(id)")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const patients = data.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    age: p.age,
    address: p.address,
    meetLink: p.meet_link,
    sessionCount: p.sessions?.length || 0,
  }));
  return NextResponse.json({ patients });
}

export async function POST(req) {
  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("patients")
    .insert({ name: body.name.trim(), age: body.age || null, email: body.email || null, address: body.address || null })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await db.from("tabs").insert({ patient_id: data.id });

  return NextResponse.json({ patient: data });
}
