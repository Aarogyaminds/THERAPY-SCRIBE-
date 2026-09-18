"use client";
import { createClient } from "@supabase/supabase-js";

// Browser-side client. Only ever used to PUT audio directly to Storage via a
// short-lived signed URL obtained from our server — never for direct table access.
// The anon key is meant to be public; it carries no access beyond what Storage
// policies + signed URLs explicitly allow.
let client;

export function supabaseBrowser() {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return client;
}
