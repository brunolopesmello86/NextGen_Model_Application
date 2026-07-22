if (!process.env.VERCEL) require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

// ── Default pillar structure (from the NextGen AS-IS Pillars questionnaire) ──
// Seeded into every new journey; fully editable per journey afterward.
const DEFAULT_PILLARS = [
  {
    id: 'p_strategy',
    name: 'Strategic Planning & Governance',
    summary: 'How work is prioritized, governed, and structured; decision-making bottlenecks; strategy-execution alignment.',
    respondents: 'Senior leaders, portfolio/program managers, governance committee members, strategic planners.',
    maturity: 0,
    subareas: [
      { id: 'sa_demand', name: 'Demand Management', questions: [
        'How are new initiatives or requests currently captured and prioritized?',
        'What criteria are used to decide which demands move forward?',
        'What challenges do you face in the current demand process?' ] },
      { id: 'sa_governance', name: 'Governance Model', questions: [
        'How are decisions made for strategic priorities, funding, and scope changes?',
        'What committees, forums, or decision-making bodies are in place?',
        'How effective is the current governance in balancing speed and control?' ] },
      { id: 'sa_structure', name: 'Structure & Relationships', questions: [
        'How is the organization currently structured to deliver work?',
        'How do different departments/teams collaborate?',
        'Where do you see silos, misalignments, or strong collaboration?' ] }
    ]
  },
  {
    id: 'p_process',
    name: 'Processes, Tools & IT',
    summary: 'Current operational flow, bottlenecks, tool & process effectiveness, and where metrics drive decisions.',
    respondents: 'Product owners, project managers, delivery managers, IT leads, business analysts.',
    maturity: 0,
    subareas: [
      { id: 'sa_vsm', name: 'Value Stream Mapping', questions: [
        'How well do you understand the end-to-end flow of work in your area?',
        'Are bottlenecks or delays visible? If so, where?',
        'Are there handoffs or dependencies that slow delivery?' ] },
      { id: 'sa_metrics', name: 'Metrics, KPIs & OKRs', questions: [
        'What metrics or KPIs do you track regularly?',
        'How are these metrics used in decision-making?',
        'Where do you see gaps in measurement or data quality?' ] },
      { id: 'sa_discovery', name: 'Product Discovery & Project Management', questions: [
        'How are ideas validated before delivery starts?',
        'What is the current approach to project/product planning?',
        'Which tools and practices are most/least effective in managing delivery?' ] }
    ]
  },
  {
    id: 'p_people',
    name: 'People & Culture',
    summary: 'Role clarity, cultural openness, collaboration patterns, knowledge-sharing maturity, and change resistance.',
    respondents: 'Team leads, managers, change agents, HR/People & Culture, knowledge management leads.',
    maturity: 0,
    subareas: [
      { id: 'sa_roles', name: 'Roles & Responsibilities', questions: [
        'How clear are your responsibilities and decision rights?',
        'Do you experience overlaps or gaps between roles?',
        'Are responsibilities documented and accessible to everyone?' ] },
      { id: 'sa_knowledge', name: 'Knowledge & Culture', questions: [
        'How is knowledge shared and retained in your team/organization?',
        'How open is the culture to experimentation and learning?',
        'Where do you see strengths and weaknesses in knowledge management?' ] },
      { id: 'sa_change', name: 'Change Management', questions: [
        'How is change communicated and implemented in the organization?',
        'What helps you adapt to new processes, tools, or structures?',
        'What challenges do you face during organizational changes?' ] }
    ]
  },
  {
    id: 'p_nextgen',
    name: 'NextGen Organization',
    summary: 'Adoption maturity, delivery quality & SLAs, and standardized ways of working across teams.',
    respondents: 'Delivery leads, quality managers, operations leads, transformation office.',
    maturity: 0,
    subareas: [
      { id: 'sa_adoption', name: 'Adoption Metrics', questions: [
        'How do you know if a new process, tool, or way of working is truly adopted?',
        'Which recent changes have been adopted successfully, and why?',
        'What makes adoption harder in your context?' ] },
      { id: 'sa_quality', name: 'Delivery Quality & SLAs', questions: [
        'How do you measure quality in delivery?',
        'Are SLAs (Service Level Agreements) clear and met consistently?',
        'Where do you see risks to delivery quality?' ] },
      { id: 'sa_standard', name: 'Standardized Ways of Working', questions: [
        'Are there standardized practices across teams? Which ones work well?',
        'Where is standardization lacking or unhelpful?',
        'How do you balance flexibility with consistency?' ] }
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
