import { createClient } from "@supabase/supabase-js";

// Server-only client. Uses the service-role key, which must never reach the
// browser — this module is only ever imported from app/api/** route handlers.
let client;

export function supabaseAdmin() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set");
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
