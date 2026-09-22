import { supabaseAdmin } from "./supabaseAdmin";
import {
  callGeminiText,
  callGeminiJSON,
  buildBriefPrompt,
  buildRecapPrompt,
  buildPatternsPrompt,
  buildLifeContextPrompt,
  buildOpenThreadsPrompt,
} from "./gemini";

// Regenerates the 5 clinical tabs from ONE new transcript, using the token-efficient
// design from the brief (Section 3.1): every call stays roughly constant-size
// regardless of how many sessions have happened before.
//
// Any single tab failing (e.g. malformed JSON from Gemini) does not block the others —
// each failure is collected and returned so the caller can surface a visible error
// instead of failing silently (per brief 6.2 — "silent JSON failures" is a listed defect
// in the prototype that production must fix).
export async function processAllTabs(patientId, transcript, sessionDate) {
  const db = supabaseAdmin();
  const errors = [];

  // All the reads needed to build every prompt, fetched together...
  const [{ data: tabsRow }, { data: entities }, { data: openThreads }] = await Promise.all([
    db.from("tabs").select("*").eq("patient_id", patientId).single(),
    db.from("life_context_entities").select("id, name, type").eq("patient_id", patientId),
    db.from("open_threads").select("id, description").eq("patient_id", patientId).eq("status", "open"),
  ]);
  const existingRecap = tabsRow?.recap === "No sessions yet." ? "" : tabsRow?.recap || "";
  const existingPatterns = tabsRow?.patterns === "No sessions yet." ? "" : tabsRow?.patterns || "";

  // ...so all 5 Gemini calls can fire in parallel rather than in sequential
  // batches — this roughly halves worst-case latency when Google's API is slow.
  const [briefResult, recapResult, patternsResult, lcResult, otResult] = await Promise.allSettled([
    callGeminiText(buildBriefPrompt(transcript, sessionDate)),
    callGeminiText(buildRecapPrompt(existingRecap, transcript, sessionDate)),
    callGeminiText(buildPatternsPrompt(existingPatterns, transcript, sessionDate)),
    callGeminiJSON(buildLifeContextPrompt(entities || [], transcript, sessionDate)),
    callGeminiJSON(buildOpenThreadsPrompt((openThreads || []).map((t) => ({ id: t.id, description: t.description })), transcript, sessionDate)),
  ]);

  const brief = briefResult.status === "fulfilled" ? briefResult.value : tabsRow?.brief || "No sessions yet.";
  const recap = recapResult.status === "fulfilled" ? recapResult.value : tabsRow?.recap || "No sessions yet.";
  const patterns = patternsResult.status === "fulfilled" ? patternsResult.value : tabsRow?.patterns || "No sessions yet.";
  if (briefResult.status === "rejected") errors.push({ tab: "brief", message: briefResult.reason.message });
  if (recapResult.status === "rejected") errors.push({ tab: "recap", message: recapResult.reason.message });
  if (patternsResult.status === "rejected") errors.push({ tab: "patterns", message: patternsResult.reason.message });

  await db
    .from("tabs")
    .upsert({ patient_id: patientId, brief, recap, patterns, updated_at: new Date().toISOString() });

  // Life context: send only the lightweight index, never full history.
  if (lcResult.status === "fulfilled") {
    try {
      for (const u of lcResult.value?.updates || []) {
        let entityId = u.match_type === "existing" ? u.existing_id : null;
        if (!entityId) {
          const { data: created } = await db
            .from("life_context_entities")
            .insert({ patient_id: patientId, name: u.name, type: u.type })
            .select("id")
            .single();
          entityId = created.id;
        }
        await db.from("life_context_mentions").insert({ entity_id: entityId, session_date: u.session_date, note: u.note });
      }
    } catch (e) {
      errors.push({ tab: "lifeContext", message: e.message });
    }
  } else {
    errors.push({ tab: "lifeContext", message: lcResult.reason.message });
  }

  // Open threads: send only currently-open threads, never resolved ones.
  if (otResult.status === "fulfilled") {
    try {
      for (const r of otResult.value?.resolved || []) {
        await db
          .from("open_threads")
          .update({ status: "resolved", resolution_note: r.resolution_note, resolved_date: sessionDate })
          .eq("id", r.existing_id);
      }
      for (const nt of otResult.value?.new_threads || []) {
        await db.from("open_threads").insert({ patient_id: patientId, description: nt.description, opened_date: sessionDate });
      }
    } catch (e) {
      errors.push({ tab: "openThreads", message: e.message });
    }
  } else {
    errors.push({ tab: "openThreads", message: otResult.reason.message });
  }

  return { errors };
}

export async function loadPatientTabs(patientId) {
  const db = supabaseAdmin();
  const [{ data: tabsRow }, { data: entities }, { data: openThreads }] = await Promise.all([
    db.from("tabs").select("*").eq("patient_id", patientId).single(),
    db.from("life_context_entities").select("id, name, type, life_context_mentions(id, session_date, note)").eq("patient_id", patientId),
    db.from("open_threads").select("*").eq("patient_id", patientId).order("created_at"),
  ]);

  return {
    brief: tabsRow?.brief || "No sessions yet.",
    recap: tabsRow?.recap || "No sessions yet.",
    patterns: tabsRow?.patterns || "No sessions yet.",
    lifeContext: (entities || []).map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      mentions: (e.life_context_mentions || [])
        .sort((a, b) => a.session_date.localeCompare(b.session_date))
        .map((m) => ({ date: m.session_date, note: m.note })),
    })),
    openThreads: (openThreads || []).map((t) => ({
      id: t.id,
      desc: t.description,
      status: t.status,
      resolution: t.resolution_note,
    })),
  };
}
