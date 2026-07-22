-- ── NextGen Model — schema ──
-- Mirrors the Nexus board's companies→games shape: a lightweight client container
-- and a per-journey row carrying the whole assessment state as JSONB (one PUT saves all).
-- Fully idempotent: safe to re-run (CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS clients (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journeys (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id          UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name               VARCHAR(255) NOT NULL,
    description        TEXT,
    password_hash      TEXT,
    status             TEXT NOT NULL DEFAULT 'as_is',   -- as_is | to_be | roadmap | complete
    -- ── Assessment state (one JSONB column per dashboard section) ──
    pillars            JSONB NOT NULL DEFAULT '[]',  -- 2.1  Organizational Pillars / Domains (seeded)
    data_collection    JSONB NOT NULL DEFAULT '{}',  -- 2.2  { surveys:[], gemba:[], interviews:[], leadership:[] }
    asis_findings      JSONB NOT NULL DEFAULT '[]',  -- 2.3  AS-IS mapping findings (tagged by pillar/sub-area)
    asis_report        JSONB NOT NULL DEFAULT '{}',  -- 2.4  AS-IS report (sections, status, link)
    tobe_sessions      JSONB NOT NULL DEFAULT '[]',  -- 2.5  TO-BE Context-Driven Design sessions
    champions          JSONB NOT NULL DEFAULT '[]',  -- 2.6  early adopters → champions
    tobe_deliverables  JSONB NOT NULL DEFAULT '[]',  -- 2.7  process maps, playbooks, guides
    tobe_proposal      JSONB NOT NULL DEFAULT '{}',  -- 2.8  TO-BE final proposal (content, status, link)
    roadmap            JSONB NOT NULL DEFAULT '[]',  -- 2.9  transformation roadmap / strategic initiatives
    progress           JSONB NOT NULL DEFAULT '{}',  -- per-section completion state
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journeys_client_id ON journeys(client_id);
CREATE INDEX IF NOT EXISTS idx_journeys_updated_at ON journeys(updated_at DESC);

-- ── Uploaded response datasets (survey / interview CSV exports) ──
-- Kept in their own table rather than a journeys JSONB column: response sets run to
-- thousands of cells and would blow the single-PUT journey save.
CREATE TABLE IF NOT EXISTS datasets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_id  UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
    channel     TEXT NOT NULL DEFAULT 'surveys',  -- surveys | interviews
    name        TEXT NOT NULL,
    filename    TEXT,
    columns     JSONB NOT NULL DEFAULT '[]',  -- [{key,label,type,pillarId}] type: meta|scale|likert|text|category
    rows        JSONB NOT NULL DEFAULT '[]',  -- [{colKey: value}]
    row_count   INTEGER NOT NULL DEFAULT 0,
    analysis    JSONB NOT NULL DEFAULT '{}',  -- {themes:[...], generated_at, model}
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_datasets_journey_id ON datasets(journey_id);

-- ── Migrations for existing databases (idempotent) ──
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS password_hash     TEXT;
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS status            TEXT NOT NULL DEFAULT 'as_is';
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS pillars           JSONB NOT NULL DEFAULT '[]';
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS data_collection   JSONB NOT NULL DEFAULT '{}';
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS asis_findings     JSONB NOT NULL DEFAULT '[]';
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS asis_report       JSONB NOT NULL DEFAULT '{}';
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS tobe_sessions     JSONB NOT NULL DEFAULT '[]';
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS champions         JSONB NOT NULL DEFAULT '[]';
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS tobe_deliverables JSONB NOT NULL DEFAULT '[]';
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS tobe_proposal     JSONB NOT NULL DEFAULT '{}';
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS roadmap           JSONB NOT NULL DEFAULT '[]';
ALTER TABLE journeys ADD COLUMN IF NOT EXISTS progress          JSONB NOT NULL DEFAULT '{}';
