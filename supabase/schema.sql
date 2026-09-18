-- Aarogya Minds clinic app — Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- Row Level Security is enabled on every table with zero policies, so only our
-- server's private service_role key can read/write — even if the public
-- "anon"/"publishable" key ever leaked, it could not touch this data.

create extension if not exists "pgcrypto";

create table patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  age text,
  address text,
  meet_link text,
  created_at timestamptz not null default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  session_date date not null,
  source text not null default 'recording', -- 'recording' | 'upload'
  transcript text not null,                  -- locked after creation, never edited
  summary text not null,                     -- editable any time (client-facing)
  docx_path text,                            -- path in the 'session-docs' storage bucket
  consent_given_at timestamptz,              -- null for uploads of past sessions; required for live recording
  consent_method text,                       -- e.g. 'in-app-checkbox'
  created_at timestamptz not null default now()
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  note_date date not null,
  text text not null,
  created_at timestamptz not null default now()
);

-- One row per patient holding the 3 scalar tabs (brief/recap/patterns).
create table tabs (
  patient_id uuid primary key references patients(id) on delete cascade,
  brief text not null default 'No sessions yet.',
  recap text not null default 'No sessions yet.',
  patterns text not null default 'No sessions yet.',
  updated_at timestamptz not null default now()
);

-- Life Context: entities are permanent, mentions are permanent and append-only.
create table life_context_entities (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  name text not null,
  type text not null check (type in ('person', 'incident', 'circumstance')),
  created_at timestamptz not null default now()
);

create table life_context_mentions (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null references life_context_entities(id) on delete cascade,
  session_date date not null,
  note text not null,
  created_at timestamptz not null default now()
);

-- Open threads: resolved ones stay visible but are excluded from the prompt payload.
create table open_threads (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  description text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolution_note text,
  opened_date date not null,
  resolved_date date,
  created_at timestamptz not null default now()
);

create index on sessions(patient_id);
create index on notes(patient_id);
create index on life_context_entities(patient_id);
create index on life_context_mentions(entity_id);
create index on open_threads(patient_id, status);

alter table patients enable row level security;
alter table sessions enable row level security;
alter table notes enable row level security;
alter table tabs enable row level security;
alter table life_context_entities enable row level security;
alter table life_context_mentions enable row level security;
alter table open_threads enable row level security;

-- No policies are created (deny-by-default). Our server's service_role key must
-- be explicitly granted table access separately from RLS — Supabase normally
-- does this automatically for new tables, but this project has "Automatically
-- expose new tables" turned off (a deliberate extra safeguard), so it's done
-- explicitly here instead, including for tables created after this script runs.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- After running this, create two Storage buckets (Dashboard > Storage > New bucket),
-- both private/not public:
--   session-audio — temporary holding spot for raw recordings, deleted right after
--                    transcription
--   session-docs  — the generated .docx file for every session
