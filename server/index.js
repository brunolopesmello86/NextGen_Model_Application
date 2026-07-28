if (!process.env.VERCEL) require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

// ── Default pillar model — NTT DATA 360° organizational diagnosis ──
// Six lenses spanning direction → operating model → enablement → people → outcomes,
// each with the sub-areas assessed under it. Industry-neutral: seeded into every new
// journey as a starting point, then trimmed and tailored per client via the Pillars step.
const DEFAULT_PILLARS = [
  {
    id: 'p_strategy',
    name: 'Strategy & Governance',
    summary: 'Whether there is a clear, shared strategy, and how well decisions, risk, and leadership sponsorship are governed.',
    respondents: 'Executives, portfolio/program leaders, governance & risk owners, strategic planners.',
    maturity: 0,
    subareas: [
      { id: 'sa_strategy', name: 'Strategy & Alignment', questions: [
        'Is there a clear, documented strategy, and how well is it understood across levels?',
        'How are strategic priorities translated into the work teams actually do?',
        'Where do you see misalignment between the stated strategy and day-to-day decisions?' ] },
      { id: 'sa_leadership', name: 'Leadership & Sponsorship', questions: [
        'How visible and active is leadership sponsorship for the key initiatives?',
        'How are decisions made, and how quickly do they get unblocked when escalated?',
        'Where does leadership behaviour most help or hinder the way work gets done?' ] },
      { id: 'sa_governance', name: 'Governance Model', questions: [
        'How are decisions made for strategic priorities, funding, and scope changes?',
        'What committees, forums, or decision-making bodies are in place?',
        'How effective is the current governance in balancing speed and control?' ] },
      { id: 'sa_risk', name: 'Risk, Compliance & Resilience', questions: [
        'How are risks, compliance obligations, and controls managed today?',
        'How prepared is the organization to respond to disruption or regulatory change?',
        'Where do controls create unnecessary friction, and where are there gaps?' ] }
    ]
  },
  {
    id: 'p_demand',
    name: 'Demand & Investment',
    summary: 'How work and funding enter the system, and how the organization is structured and financed to deliver value.',
    respondents: 'Portfolio/PMO leaders, finance & investment partners, business-unit heads, planners.',
    maturity: 0,
    subareas: [
      { id: 'sa_demand', name: 'Demand Management', questions: [
        'How are new initiatives or requests currently captured and prioritized?',
        'What criteria are used to decide which demands move forward?',
        'What challenges do you face in the current demand process?' ] },
      { id: 'sa_funding', name: 'Investment & Funding Model', questions: [
        'How is work funded today — by project, by product/team, or another model?',
        'How transparent is spend, and how easily can funding shift as priorities change?',
        'Where does the funding model most help or constrain how value is delivered?' ] },
      { id: 'sa_structure', name: 'Structure & Operating Design', questions: [
        'How is the organization currently structured to deliver work?',
        'How do different departments/teams collaborate across boundaries?',
        'Where do you see silos, misalignments, or particularly strong collaboration?' ] }
    ]
  },
  {
    id: 'p_delivery',
    name: 'Delivery & Value',
    summary: 'How value flows end-to-end, how work is discovered and planned, and whether delivery is predictable and high-quality.',
    respondents: 'Delivery leads, product owners, operations & quality managers, team leads.',
    maturity: 0,
    subareas: [
      { id: 'sa_vsm', name: 'Value Stream Mapping', questions: [
        'How well do you understand the end-to-end flow of work in your area?',
        'Are bottlenecks or delays visible? If so, where?',
        'Are there handoffs or dependencies that slow delivery?' ] },
      { id: 'sa_discovery', name: 'Product Discovery & Delivery', questions: [
        'How are ideas validated before delivery starts?',
        'What is the current approach to product/project planning?',
        'Which tools and practices are most and least effective in managing delivery?' ] },
      { id: 'sa_quality', name: 'Delivery Quality & Operational Excellence', questions: [
        'How is quality measured, and are service levels clear and consistently met?',
        'Which ways of working are standardized across teams, and which work well?',
        'Where do you see the biggest risks to delivery quality or consistency?' ] }
    ]
  },
  {
    id: 'p_enablement',
    name: 'Technology, Data & Measurement',
    summary: 'The technical and data foundations that enable the operating model, and how performance is measured and used.',
    respondents: 'IT & architecture leads, data & analytics leads, engineering managers, business analysts.',
    maturity: 0,
    subareas: [
      { id: 'sa_tech', name: 'Technology & Architecture', questions: [
        'How well do current platforms and architecture support the way you need to work?',
        'Where do technical debt, tooling, or integration gaps slow delivery?',
        'How are engineering and technology practices evolving toward the target state?' ] },
      { id: 'sa_data', name: 'Data, Analytics & AI-Readiness', questions: [
        'How available, trusted, and usable is the data you need to make decisions?',
        'How data-driven are decisions today versus based on intuition or hierarchy?',
        'How ready is the organization to adopt advanced analytics and AI?' ] },
      { id: 'sa_metrics', name: 'Metrics, KPIs & OKRs', questions: [
        'What metrics or KPIs do you track regularly?',
        'How are these metrics used in decision-making?',
        'Where do you see gaps in measurement or data quality?' ] }
    ]
  },
  {
    id: 'p_people',
    name: 'People & Capability',
    summary: 'Whether the organization has the right roles, skills, incentives, and knowledge-sharing to succeed at the target state.',
    respondents: 'HR / People & Culture, capability & L&D leads, team leads, managers.',
    maturity: 0,
    subareas: [
      { id: 'sa_roles', name: 'Roles & Responsibilities', questions: [
        'How clear are your responsibilities and decision rights?',
        'Do you experience overlaps or gaps between roles?',
        'Are responsibilities documented and accessible to everyone?' ] },
      { id: 'sa_talent', name: 'Talent & Capability', questions: [
        'Does the organization have the skills and capabilities it needs for the target state?',
        'How effective are hiring, upskilling, and career paths at closing capability gaps?',
        'Where are the most critical skill shortages or single points of dependency?' ] },
      { id: 'sa_knowledge', name: 'Knowledge & Culture', questions: [
        'How is knowledge shared and retained in your team/organization?',
        'How open is the culture to experimentation and learning?',
        'Where do you see strengths and weaknesses in knowledge management?' ] },
      { id: 'sa_performance', name: 'Performance & Rewards', questions: [
        'How is individual and team performance measured and recognized?',
        'How well do incentives and rewards reinforce the behaviours you want?',
        'Where do current incentives drive unintended or counter-productive behaviour?' ] }
    ]
  },
  {
    id: 'p_change',
    name: 'Customer, Change & Improvement',
    summary: 'Whether the organization stays oriented to customer outcomes, adopts change effectively, and keeps improving.',
    respondents: 'Change leads, customer/CX owners, transformation office, continuous-improvement leads.',
    maturity: 0,
    subareas: [
      { id: 'sa_customer', name: 'Customer & Stakeholder Centricity', questions: [
        'How is the voice of the customer or end-stakeholder captured and acted on?',
        'How well does the organization focus on outcomes rather than outputs?',
        'Where do internal priorities diverge from customer or stakeholder needs?' ] },
      { id: 'sa_change', name: 'Change Management & Adoption', questions: [
        'How is change communicated and implemented across the organization?',
        'How do you know when a new way of working is genuinely adopted?',
        'What makes adoption harder or easier in your context?' ] },
      { id: 'sa_improve', name: 'Continuous Improvement & Innovation', questions: [
        'How does the organization identify and act on opportunities to improve?',
        'How safe is it to experiment, and how are lessons captured and reused?',
        'Where does the organization innovate well, and where does it stall?' ] }
    ]
  }
];

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..')));

// ── Bootstrap migrations — run once at module init so all endpoints are safe on a cold DB ──
let _bootstrapPromise = null;
async function ensureSchema() {
  if (_bootstrapPromise) return _bootstrapPromise;
  _bootstrapPromise = (async () => {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS journeys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE INDEX IF NOT EXISTS idx_journeys_client_id ON journeys(client_id)`,
      `CREATE INDEX IF NOT EXISTS idx_journeys_updated_at ON journeys(updated_at DESC)`,
      "ALTER TABLE journeys ADD COLUMN IF NOT EXISTS password_hash TEXT",
      "ALTER TABLE journeys ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'as_is'",
      "ALTER TABLE journeys ADD COLUMN IF NOT EXISTS pillars JSONB NOT NULL DEFAULT '[]'",
      "ALTER TABLE journeys ADD COLUMN IF NOT EXISTS data_collection JSONB NOT NULL DEFAULT '{}'",
      "ALTER TABLE journeys ADD COLUMN IF NOT EXISTS asis_findings JSONB NOT NULL DEFAULT '[]'",
      "ALTER TABLE journeys ADD COLUMN IF NOT EXISTS asis_report JSONB NOT NULL DEFAULT '{}'",
      "ALTER TABLE journeys ADD COLUMN IF NOT EXISTS tobe_sessions JSONB NOT NULL DEFAULT '[]'",
      "ALTER TABLE journeys ADD COLUMN IF NOT EXISTS champions JSONB NOT NULL DEFAULT '[]'",
      "ALTER TABLE journeys ADD COLUMN IF NOT EXISTS tobe_deliverables JSONB NOT NULL DEFAULT '[]'",
      "ALTER TABLE journeys ADD COLUMN IF NOT EXISTS tobe_proposal JSONB NOT NULL DEFAULT '{}'",
      "ALTER TABLE journeys ADD COLUMN IF NOT EXISTS roadmap JSONB NOT NULL DEFAULT '[]'",
      "ALTER TABLE journeys ADD COLUMN IF NOT EXISTS progress JSONB NOT NULL DEFAULT '{}'",
      `CREATE TABLE IF NOT EXISTS datasets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        journey_id UUID NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
        channel TEXT NOT NULL DEFAULT 'surveys',
        name TEXT NOT NULL,
        filename TEXT,
        columns JSONB NOT NULL DEFAULT '[]',
        rows JSONB NOT NULL DEFAULT '[]',
        row_count INTEGER NOT NULL DEFAULT 0,
        analysis JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE INDEX IF NOT EXISTS idx_datasets_journey_id ON datasets(journey_id)`
    ];
    for (const s of stmts) {
      try { await db.query(s); } catch (e) { console.warn('bootstrap failed (non-fatal):', e.message); }
    }
  })();
  return _bootstrapPromise;
}
app.use('/api', async (req, res, next) => {
  try { await ensureSchema(); next(); } catch (e) { next(); }
});

// Strip the password hash before returning a journey to the client.
function publicJourney(row) {
  if (!row) return row;
  const out = { ...row };
  out.has_password = !!out.password_hash;
  delete out.password_hash;
  return out;
}

// ── Health ──
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ══ Clients ══
app.get('/api/clients', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT c.*, COALESCE(j.cnt, 0)::int AS journey_count
      FROM clients c
      LEFT JOIN (SELECT client_id, COUNT(*) AS cnt FROM journeys GROUP BY client_id) j
        ON j.client_id = c.id
      ORDER BY c.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients', async (req, res) => {
  const { name, slug } = req.body || {};
  if (!name || !slug) return res.status(400).json({ error: 'name and slug required' });
  try {
    const { rows } = await db.query(
      'INSERT INTO clients (name, slug) VALUES ($1, $2) RETURNING *',
      [name, slug]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Slug already exists' });
    res.status(500).json({ error: err.message });
  }
});

// ══ Journeys ══
app.get('/api/clients/:clientId/journeys', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, client_id, name, description, status,
             created_at, updated_at,
             (password_hash IS NOT NULL) AS has_password
      FROM journeys
      WHERE client_id = $1
      ORDER BY updated_at DESC
    `, [req.params.clientId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clients/:clientId/journeys', async (req, res) => {
  const { name, description, password } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const pwHash = password ? hashPassword(password) : null;
    const { rows } = await db.query(
      `INSERT INTO journeys (client_id, name, description, password_hash, pillars)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.clientId, name, description || null, pwHash, JSON.stringify(DEFAULT_PILLARS)]
    );
    res.status(201).json(publicJourney(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/journeys/:journeyId', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM journeys WHERE id = $1', [req.params.journeyId]);
    if (!rows.length) return res.status(404).json({ error: 'Journey not found' });
    res.json(publicJourney(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save the whole assessment state in one call (Nexus load/save pattern).
app.put('/api/journeys/:journeyId', async (req, res) => {
  const b = req.body || {};
  const cols = [
    'status', 'pillars', 'data_collection', 'asis_findings', 'asis_report',
    'tobe_sessions', 'champions', 'tobe_deliverables', 'tobe_proposal',
    'roadmap', 'progress'
  ];
  const jsonCols = new Set([
    'pillars', 'data_collection', 'asis_findings', 'asis_report',
    'tobe_sessions', 'champions', 'tobe_deliverables', 'tobe_proposal',
    'roadmap', 'progress'
  ]);
  const sets = [];
  const vals = [];
  let i = 1;
  for (const c of cols) {
    if (b[c] === undefined) continue;
    sets.push(`${c} = $${i++}`);
    vals.push(jsonCols.has(c) ? JSON.stringify(b[c]) : b[c]);
  }
  if (!sets.length) return res.status(400).json({ error: 'no fields to update' });
  sets.push('updated_at = NOW()');
  vals.push(req.params.journeyId);
  try {
    const { rows } = await db.query(
      `UPDATE journeys SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Journey not found' });
    res.json(publicJourney(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify a journey password before entering.
app.post('/api/journeys/:journeyId/verify', async (req, res) => {
  const { password } = req.body || {};
  try {
    const { rows } = await db.query('SELECT password_hash FROM journeys WHERE id = $1', [req.params.journeyId]);
    if (!rows.length) return res.status(404).json({ error: 'Journey not found' });
    const j = rows[0];
    if (!j.password_hash) return res.json({ ok: true });
    if (!password) return res.status(401).json({ error: 'Password required' });
    if (hashPassword(password) !== j.password_hash) return res.status(401).json({ error: 'Wrong password' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set / change / remove a journey password.
app.patch('/api/journeys/:journeyId/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  try {
    const { rows } = await db.query('SELECT password_hash FROM journeys WHERE id = $1', [req.params.journeyId]);
    if (!rows.length) return res.status(404).json({ error: 'Journey not found' });
    const existing = rows[0].password_hash;
    if (existing) {
      if (!currentPassword) return res.status(401).json({ error: 'Current password required' });
      if (hashPassword(currentPassword) !== existing) return res.status(401).json({ error: 'Wrong current password' });
    }
    const newHash = newPassword ? hashPassword(newPassword) : null;
    await db.query('UPDATE journeys SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, req.params.journeyId]);
    res.json({ ok: true, has_password: !!newHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Rename a journey (password-guarded if protected).
app.patch('/api/journeys/:journeyId/rename', async (req, res) => {
  const { name, description, password } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const { rows } = await db.query('SELECT password_hash FROM journeys WHERE id = $1', [req.params.journeyId]);
    if (!rows.length) return res.status(404).json({ error: 'Journey not found' });
    if (rows[0].password_hash) {
      if (!password) return res.status(401).json({ error: 'Password required' });
      if (hashPassword(password) !== rows[0].password_hash) return res.status(401).json({ error: 'Wrong password' });
    }
    const { rows: upd } = await db.query(
      'UPDATE journeys SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [name, description || null, req.params.journeyId]
    );
    res.json(publicJourney(upd[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a journey (password-guarded if protected).
app.delete('/api/journeys/:journeyId', async (req, res) => {
  const { password } = req.body || {};
  try {
    const { rows } = await db.query('SELECT password_hash FROM journeys WHERE id = $1', [req.params.journeyId]);
    if (!rows.length) return res.status(404).json({ error: 'Journey not found' });
    if (rows[0].password_hash) {
      if (!password) return res.status(401).json({ error: 'Password required' });
      if (hashPassword(password) !== rows[0].password_hash) return res.status(401).json({ error: 'Wrong password' });
    }
    await db.query('DELETE FROM journeys WHERE id = $1', [req.params.journeyId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Expose the default pillar template (used by the UI "reset pillars" action).
app.get('/api/default-pillars', (req, res) => res.json(DEFAULT_PILLARS));

// ══ Datasets (uploaded survey / interview CSV exports) ══

// List datasets for a journey — metadata only, never the rows (they can be large).
app.get('/api/journeys/:journeyId/datasets', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT id, journey_id, channel, name, filename, columns, row_count,
             (analysis->>'generated_at') AS analysed_at,
             created_at, updated_at
      FROM datasets WHERE journey_id = $1 ORDER BY created_at DESC
    `, [req.params.journeyId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/journeys/:journeyId/datasets', async (req, res) => {
  const { channel, name, filename, columns, rows } = req.body || {};
  if (!name || !Array.isArray(rows) || !Array.isArray(columns)) {
    return res.status(400).json({ error: 'name, columns and rows required' });
  }
  try {
    const { rows: out } = await db.query(
      `INSERT INTO datasets (journey_id, channel, name, filename, columns, rows, row_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, journey_id, channel, name, filename, columns, row_count, created_at`,
      [req.params.journeyId, channel || 'surveys', name, filename || null,
       JSON.stringify(columns), JSON.stringify(rows), rows.length]
    );
    res.status(201).json(out[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Full dataset including rows.
app.get('/api/datasets/:datasetId', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM datasets WHERE id = $1', [req.params.datasetId]);
    if (!rows.length) return res.status(404).json({ error: 'Dataset not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update the column mapping (question type + pillar tagging).
app.patch('/api/datasets/:datasetId', async (req, res) => {
  const { columns, name } = req.body || {};
  const sets = [], vals = [];
  let i = 1;
  if (columns !== undefined) { sets.push(`columns = $${i++}`); vals.push(JSON.stringify(columns)); }
  if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
  if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
  sets.push('updated_at = NOW()');
  vals.push(req.params.datasetId);
  try {
    const { rows } = await db.query(
      `UPDATE datasets SET ${sets.join(', ')} WHERE id = $${i} RETURNING id, columns, name`, vals);
    if (!rows.length) return res.status(404).json({ error: 'Dataset not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/datasets/:datasetId', async (req, res) => {
  try {
    await db.query('DELETE FROM datasets WHERE id = $1', [req.params.datasetId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══ AI theme clustering (Claude) ══

// Tells the UI whether AI analysis is available before it offers the button.
app.get('/api/ai-status', (req, res) => {
  res.json({ enabled: !!process.env.ANTHROPIC_API_KEY });
});

// Answers that carry no signal — excluded before clustering so they don't
// become a "theme" of their own.
const NULL_ANSWERS = new Set(['', 'n/a', 'na', 'n.a.', 'none', 'nil', 'no', '-', '--', '.', 'nothing', 'no comment']);
const MAX_ANSWERS_PER_QUESTION = 400;

const THEME_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The question these themes come from' },
          summary: { type: 'string', description: 'Two-sentence synthesis of what respondents said' },
          themes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'Short theme name, 2-5 words' },
                description: { type: 'string', description: 'One sentence explaining the theme' },
                count: { type: 'integer', description: 'How many responses express this theme' },
                sentiment: { type: 'string', enum: ['positive', 'mixed', 'negative'] },
                quotes: {
                  type: 'array', items: { type: 'string' },
                  description: 'Up to 3 short verbatim quotes illustrating the theme'
                },
                implication: { type: 'string', description: 'What this means for the transformation' }
              },
              required: ['label', 'description', 'count', 'sentiment', 'quotes', 'implication'],
              additionalProperties: false
            }
          }
        },
        required: ['question', 'summary', 'themes'],
        additionalProperties: false
      }
    },
    overall_insights: {
      type: 'array',
      items: { type: 'string' },
      description: 'Cross-cutting insights across all questions, most important first'
    }
  },
  required: ['questions', 'overall_insights'],
  additionalProperties: false
};

app.post('/api/datasets/:datasetId/analyze', async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      error: 'AI analysis is not configured. Set ANTHROPIC_API_KEY to enable theme clustering.'
    });
  }
  try {
    const { rows } = await db.query('SELECT * FROM datasets WHERE id = $1', [req.params.datasetId]);
    if (!rows.length) return res.status(404).json({ error: 'Dataset not found' });
    const ds = rows[0];

    // Gather the free-text answers, question by question.
    const textCols = (ds.columns || []).filter(c => c.type === 'text');
    if (!textCols.length) {
      return res.status(400).json({ error: 'No free-text questions in this dataset to cluster.' });
    }
    const truncated = [];
    const blocks = textCols.map(col => {
      let answers = (ds.rows || [])
        .map(r => (r[col.key] == null ? '' : String(r[col.key]).trim()))
        .filter(a => a && !NULL_ANSWERS.has(a.toLowerCase()));
      if (answers.length > MAX_ANSWERS_PER_QUESTION) {
        truncated.push({ question: col.label, total: answers.length, used: MAX_ANSWERS_PER_QUESTION });
        answers = answers.slice(0, MAX_ANSWERS_PER_QUESTION);
      }
      return { question: col.label, answers };
    }).filter(b => b.answers.length);

    if (!blocks.length) return res.status(400).json({ error: 'No usable free-text answers found.' });

    const prompt = `You are analysing free-text responses from an organizational assessment survey run by NTT DATA as part of a NextGen transformation diagnostic.

For each question below, cluster the responses into distinct themes that reflect what respondents actually said. Rules:
- Group by meaning, not by shared wording. Two answers phrased differently but making the same point belong in one theme.
- \`count\` must be the real number of responses expressing that theme.
- Order themes within a question from most to least frequent.
- Use short verbatim quotes (trim them; do not paraphrase inside quotes).
- \`implication\` should say what the finding means for the transformation, in the voice of a consultant.
- Do not invent themes that are not present. If responses are thin, return fewer themes.
- Then give cross-cutting \`overall_insights\` spanning all questions, most decision-relevant first.

${blocks.map(b => `## Question: ${b.question}\n${b.answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}`).join('\n\n')}`;

    let Anthropic;
    try {
      Anthropic = require('@anthropic-ai/sdk');
    } catch (e) {
      return res.status(500).json({ error: 'The @anthropic-ai/sdk package is not installed on the server.' });
    }
    const client = new Anthropic();
    const model = 'claude-opus-4-8';

    const message = await client.messages.create({
      model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema: THEME_SCHEMA } },
      messages: [{ role: 'user', content: prompt }]
    });

    if (message.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'The model declined to analyse this content.' });
    }
    const textBlock = (message.content || []).find(b => b.type === 'text');
    if (!textBlock) return res.status(502).json({ error: 'No analysis returned by the model.' });

    let parsed;
    try {
      parsed = JSON.parse(textBlock.text);
    } catch (e) {
      return res.status(502).json({ error: 'Could not parse the analysis returned by the model.' });
    }

    const analysis = {
      ...parsed,
      truncated,
      model,
      generated_at: new Date().toISOString()
    };
    await db.query('UPDATE datasets SET analysis = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(analysis), ds.id]);
    res.json(analysis);
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ error: err.message || 'Analysis failed' });
  }
});

const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => console.log(`NextGen Model running on http://localhost:${PORT}`));
}

module.exports = app;
