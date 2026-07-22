/* ══════════════════════════════════════════════════════════════════
   NextGen Model — dashboard engine
   Renders the 9-section assessment journey over the loaded journey (window.J).
   Mutations update J in place, debounce-save via saveJourney(), and re-render.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  const J = () => window.getJourney();
  const esc = window.esc;
  const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9);

  // ── Section catalogue (numbers map to the request's 2.1–2.9) ──
  const SECTIONS = [
    { key: 'pillars',       num: '1', name: 'Organizational Pillars', phase: 'Setup',
      crumb: 'Setup', title: 'Organizational Pillars / Domains',
      sub: 'The domains the assessment is structured around. Set a current-state maturity read for each and use the seeded interview questions to guide data collection.' },
    { key: 'data',          num: '2', name: 'Data Collection', phase: 'Phase 1 · AS-IS',
      crumb: 'Phase 1 · AS-IS', title: 'Data Collection',
      sub: 'Gather signal from four channels — surveys, Gemba observations, 1:1 interviews and leadership interviews.' },
    { key: 'analytics',     num: '3', name: 'Response Analytics', phase: 'Phase 1 · AS-IS',
      crumb: 'Phase 1 · AS-IS', title: 'Response Analytics',
      sub: 'Analyse uploaded survey and interview responses — scores, agreement patterns, and the themes running through the free-text answers.' },
    { key: 'asis_map',      num: '4', name: 'AS-IS Mapping', phase: 'Phase 1 · AS-IS',
      crumb: 'Phase 1 · AS-IS', title: 'AS-IS Mapping',
      sub: 'Turn collected data into findings mapped to pillars and sub-areas — the current-state picture.' },
    { key: 'asis_report',   num: '5', name: 'AS-IS Reporting', phase: 'Phase 1 · AS-IS',
      crumb: 'Phase 1 · AS-IS', title: 'AS-IS Reporting',
      sub: 'Synthesize the AS-IS mapping into an executive report, pillar by pillar.' },
    { key: 'tobe_sessions', num: '6', name: 'TO-BE Design Sessions', phase: 'Phase 2 · TO-BE',
      crumb: 'Phase 2 · TO-BE', title: 'TO-BE Design Sessions (Context-Driven Design)',
      sub: 'Co-design the target state with the client through Context-Driven Design working sessions.' },
    { key: 'champions',     num: '7', name: 'Champions', phase: 'Phase 2 · TO-BE',
      crumb: 'Phase 2 · TO-BE', title: 'Champions — Early Adopters',
      sub: 'Identify early adopters within the client and grow them into champions who drive adoption.' },
    { key: 'deliverables',  num: '8', name: 'TO-BE Deliverables', phase: 'Phase 2 · TO-BE',
      crumb: 'Phase 2 · TO-BE', title: 'TO-BE Design Deliverables',
      sub: 'The artifacts produced by the design work — process maps, playbooks, guides and more.' },
    { key: 'proposal',      num: '9', name: 'TO-BE Final Proposal', phase: 'Phase 2 · TO-BE',
      crumb: 'Phase 2 · TO-BE', title: 'TO-BE Design Final Proposal',
      sub: 'The consolidated target-state proposal presented to the client.' },
    { key: 'roadmap',       num: '10', name: 'Transformation Roadmap', phase: 'Phase 3 · Roadmap',
      crumb: 'Phase 3 · Roadmap', title: 'Transformation Roadmap',
      sub: 'The strategic initiatives — sequenced across horizons — that drive the organization to the TO-BE state.' }
  ];
  const PHASES = ['Setup', 'Phase 1 · AS-IS', 'Phase 2 · TO-BE', 'Phase 3 · Roadmap'];

  const expanded = new Set();
  let current = 'overview';

  // ── Small helpers ──
  function commit() { window.scheduleSave(); recomputeStatus(); renderRail(); }
  function commitNow() { window.saveJourney(); recomputeStatus(); renderRail(); }
  function toggleExpand(id) { if (expanded.has(id)) expanded.delete(id); else expanded.add(id); render(); }
  function pillarName(id) { const p = (J().pillars || []).find(p => p.id === id); return p ? p.name : '—'; }
  function subareaName(pid, sid) {
    const p = (J().pillars || []).find(p => p.id === pid); if (!p) return '';
    const s = (p.subareas || []).find(s => s.id === sid); return s ? s.name : '';
  }
  function pillarOptions(selPid, includeBlank) {
    let out = includeBlank ? `<option value="">— pillar —</option>` : '';
    (J().pillars || []).forEach(p => { out += `<option value="${p.id}" ${p.id===selPid?'selected':''}>${esc(p.name)}</option>`; });
    return out;
  }

  // ── Status derivation for rail dots + roll-up ──
  function hasContent(key) {
    const j = J();
    switch (key) {
      case 'pillars': return (j.pillars || []).some(p => (p.maturity || 0) > 0);
      case 'data': { const d = j.data_collection || {}; return ['surveys','gemba','interviews','leadership'].some(k => (d[k] || []).length); }
      case 'analytics': return dsList.length > 0;
      case 'asis_map': return (j.asis_findings || []).length > 0;
      case 'asis_report': return !!(j.asis_report && (j.asis_report.executive_summary || Object.keys(j.asis_report.byPillar || {}).length));
      case 'tobe_sessions': return (j.tobe_sessions || []).length > 0;
      case 'champions': return (j.champions || []).length > 0;
      case 'deliverables': return (j.tobe_deliverables || []).length > 0;
      case 'proposal': return !!(j.tobe_proposal && (j.tobe_proposal.overview || j.tobe_proposal.link));
      case 'roadmap': return (j.roadmap || []).length > 0;
    }
    return false;
  }
  function sectionState(key) {
    const done = !!(J().progress || {})[key + '_done'];
    if (done) return 'done';
    return hasContent(key) ? 'in-progress' : 'empty';
  }
  function recomputeStatus() {
    const j = J(); const pr = j.progress || {};
    let st = 'as_is';
    if (['tobe_sessions','champions','deliverables','proposal'].some(hasContent)) st = 'to_be';
    if (hasContent('roadmap')) st = 'roadmap';
    if (pr.roadmap_done) st = 'complete';
    j.status = st;
  }

  // ══════════════════════════════════════════
  // NAV + SHELL
  // ══════════════════════════════════════════
  function goSection(key) { current = key; expanded.clear(); render(); renderRail(); document.querySelector('.dash-main').scrollTop = 0; }

  function renderRail() {
    const rail = document.getElementById('dashRail'); if (!rail) return;
    let html = `<div class="rail-phase">
      <div class="rail-item ${current==='overview'?'active':''}" onclick="NG.goSection('overview')">
        <div class="rail-num">⌂</div><div class="rail-name">Journey Overview</div>
      </div></div>`;
    PHASES.forEach(ph => {
      const secs = SECTIONS.filter(s => s.phase === ph);
      html += `<div class="rail-phase"><div class="rail-phase-label">${esc(ph)}</div>`;
      secs.forEach(s => {
        const stt = sectionState(s.key);
        html += `<div class="rail-item ${current===s.key?'active':''}" onclick="NG.goSection('${s.key}')">
          <div class="rail-num">${s.num}</div>
          <div class="rail-name">${esc(s.name)}</div>
          <div class="rail-dot ${stt}"></div>
        </div>`;
      });
      html += `</div>`;
    });
    rail.innerHTML = html;
  }

  function render() {
    const el = document.getElementById('dashMain'); if (!el || !J()) return;
    if (current === 'overview') { el.innerHTML = renderOverview(); return; }
    const s = SECTIONS.find(x => x.key === current); if (!s) { el.innerHTML = ''; return; }
    const done = !!(J().progress || {})[s.key + '_done'];
    const head = `<div class="sec-head">
      <div class="sec-crumb">${esc(s.crumb)} · Step ${s.num} of 10</div>
      <div class="sec-title">${esc(s.title)}</div>
      <div class="sec-sub">${esc(s.sub)}</div>
      <div class="sec-actions">
        <button class="btn btn-sm ${done?'btn-primary':''}" onclick="NG.toggleDone('${s.key}')">${done?'✓ Marked complete':'Mark step complete'}</button>
      </div>
    </div>`;
    el.innerHTML = head + (RENDERERS[s.key] ? RENDERERS[s.key]() : '');
  }
  function toggleDone(key) {
    const j = J(); j.progress = j.progress || {};
    j.progress[key + '_done'] = !j.progress[key + '_done'];
    commit(); render();
  }

  // ══════════════════════════════════════════
  // OVERVIEW
  // ══════════════════════════════════════════
  function renderOverview() {
    const j = J();
    const counts = {
      pillars: (j.pillars || []).length,
      data: ['surveys','gemba','interviews','leadership'].reduce((n,k)=> n + ((j.data_collection||{})[k]||[]).length, 0),
      findings: (j.asis_findings || []).length,
      champions: (j.champions || []).length,
      deliverables: (j.tobe_deliverables || []).length,
      initiatives: (j.roadmap || []).length
    };
    const total = SECTIONS.length;
    const doneCount = SECTIONS.filter(s => sectionState(s.key) === 'done').length;
    const pct = Math.round(doneCount / total * 100);
    let flow = '';
    PHASES.forEach(ph => {
      flow += `<div class="phase-band">${esc(ph)}</div><div class="flow-grid">`;
      SECTIONS.filter(s => s.phase === ph).forEach(s => {
        const stt = sectionState(s.key);
        const label = stt==='done' ? '✓ Complete' : stt==='in-progress' ? '● In progress' : '○ Not started';
        const color = stt==='done' ? 'var(--green)' : stt==='in-progress' ? 'var(--gold)' : 'var(--text-muted)';
        flow += `<div class="flow-card" onclick="NG.goSection('${s.key}')">
          <div class="fc-num">${s.num}</div>
          <div class="fc-name">${esc(s.name)}</div>
          <div class="fc-desc">${esc(s.sub)}</div>
          <div style="font-size:11px;font-weight:700;color:${color}">${label}</div>
        </div>`;
      });
      flow += `</div>`;
    });
    return `
      <div class="sec-head">
        <div class="sec-crumb">Assessment Journey</div>
        <div class="sec-title">${esc(j.name)}</div>
        <div class="sec-sub">${esc(j.description || 'A sensemaking, customized diagnostic across your organizational pillars — AS-IS mapping, TO-BE design, and a transformation roadmap.')}</div>
      </div>
      <div class="tile-row">
        <div class="tile"><div class="tile-label">Journey Progress</div><div class="tile-value accent">${pct}%</div><div class="pbar" style="margin-top:8px"><div class="pbar-fill" style="width:${pct}%"></div></div></div>
        <div class="tile"><div class="tile-label">Pillars</div><div class="tile-value">${counts.pillars}</div></div>
        <div class="tile"><div class="tile-label">Data Points</div><div class="tile-value teal">${counts.data}</div></div>
        <div class="tile"><div class="tile-label">AS-IS Findings</div><div class="tile-value gold">${counts.findings}</div></div>
        <div class="tile"><div class="tile-label">Champions</div><div class="tile-value green">${counts.champions}</div></div>
        <div class="tile"><div class="tile-label">Initiatives</div><div class="tile-value accent">${counts.initiatives}</div></div>
      </div>
      ${flow}`;
  }

  // ══════════════════════════════════════════
  // 1 · PILLARS
  // ══════════════════════════════════════════
  function renderPillars() {
    const j = J();
    let cards = (j.pillars || []).map((p, i) => {
      const open = expanded.has(p.id);
      const m = p.maturity || 0;
      const cls = m <= 1 ? 'low' : m <= 3 ? 'med' : 'high';
      const subs = (p.subareas || []).map(s => {
        const qs = s.questions || [];
        return `<div class="sub-block">
          <div class="sub-hdr">
            <div class="sub-name">${esc(s.name)}</div>
            <span class="sub-count">${qs.length} question${qs.length!==1?'s':''}</span>
            <button class="icon-btn" title="Remove sub-area" onclick="NG.delSubarea('${p.id}','${s.id}')">🗑</button>
          </div>
          ${qs.length ? `<ul class="sub-qs">${qs.map((q,qi)=>`
            <li><span>${esc(q)}</span><button class="q-del" title="Remove question" onclick="NG.delQuestion('${p.id}','${s.id}',${qi})">✕</button></li>`).join('')}</ul>`
            : '<div class="sub-empty">No interview questions yet.</div>'}
          <div class="sub-add">
            <input class="inp" id="q_${s.id}" placeholder="Add an interview question…" onkeydown="if(event.key==='Enter'){event.preventDefault();NG.addQuestion('${p.id}','${s.id}')}">
            <button class="btn btn-sm" onclick="NG.addQuestion('${p.id}','${s.id}')">＋ Question</button>
          </div>
        </div>`;
      }).join('') || '<div class="sub-empty">No sub-areas yet — add the ones relevant to this client below.</div>';
      return `<div class="item ${open?'expanded':''}">
        <div class="item-hdr" onclick="NG.tExp('${p.id}')">
          <div class="item-chevron">▶</div>
          <div class="item-main">
            <div class="item-name">${esc(p.name)}</div>
            <div class="item-meta">${(p.subareas||[]).length} sub-areas · ${esc(p.respondents||'')}</div>
          </div>
          <div class="mat-num ${cls}">${m}/5</div>
        </div>
        <div class="item-body">
          <div class="item-meta" style="margin-bottom:10px">${esc(p.summary||'')}</div>
          <div class="rail-phase-label" style="padding:0 0 4px">Current-state maturity</div>
          <div class="mat-row">
            <input class="mat-slider" type="range" min="0" max="5" step="1" value="${m}" oninput="NG.setMaturity('${p.id}', this.value)">
            <div class="mat-num ${cls}" id="matn_${p.id}">${m}/5</div>
          </div>
          <textarea class="ta" placeholder="Notes on this pillar…" oninput="NG.setPillarNotes('${p.id}', this.value)">${esc(p.notes||'')}</textarea>
          <div class="rail-phase-label" style="padding:12px 0 0">Sub-areas &amp; interview questions</div>
          ${subs}
          <div class="sub-add" style="margin-top:12px">
            <input class="inp" id="sa_${p.id}" placeholder="New sub-area name (e.g., Vendor Management)" onkeydown="if(event.key==='Enter'){event.preventDefault();NG.addSubarea('${p.id}')}">
            <button class="btn btn-primary btn-sm" onclick="NG.addSubarea('${p.id}')">＋ Add sub-area</button>
          </div>
        </div>
      </div>`;
    }).join('');
    return `<div class="panel">
        <div class="panel-title">🏛 Add a pillar / domain<span class="spacer"></span>
          <button class="btn btn-sm" onclick="NG.resetPillars()">↺ Reset to default</button>
        </div>
        <div class="field-row"><input class="inp" id="npName" placeholder="Pillar name (e.g., Customer Experience)"><input class="inp" id="npResp" placeholder="Who should respond (optional)"><button class="btn btn-primary btn-sm" onclick="NG.addPillar()">Add</button></div>
      </div>
      ${cards || '<div class="empty">No pillars yet. The 4 NextGen pillars are seeded on new journeys — add one above or reset to default.</div>'}`;
  }

  // ══════════════════════════════════════════
  // 2 · DATA COLLECTION
  // ══════════════════════════════════════════
  let dataTab = 'surveys';
  const DATA_TABS = [
    { k:'surveys',    label:'Surveys',              badge:'b-survey' },
    { k:'gemba',      label:'Gemba Observations',   badge:'b-gemba' },
    { k:'interviews', label:'1:1 Interviews',       badge:'b-interview' },
    { k:'leadership', label:'Leadership Interviews', badge:'b-leadership' }
  ];
  function renderData() {
    const d = J().data_collection;
    const tabs = DATA_TABS.map(t => `<button class="pill ${dataTab===t.k?'s-active':''}" onclick="NG.setDataTab('${t.k}')">${t.label} · ${(d[t.k]||[]).length}</button>`).join(' ');
    let form = '', list = '';
    const items = d[dataTab] || [];
    if (dataTab === 'surveys') {
      form = `<div class="field-row trio">
        <input class="inp" id="f1" placeholder="Survey name"><input class="inp" id="f2" placeholder="Audience"><input class="inp" id="f3" type="number" placeholder="# responses"><button class="btn btn-primary btn-sm" onclick="NG.addData()">Add</button></div>`;
      list = items.map(it => dataItem(it, `${it.audience?esc(it.audience)+' · ':''}${it.responses||0} responses`)).join('');
    } else if (dataTab === 'gemba') {
      form = `<div class="field-row trio">
        <input class="inp" id="f1" placeholder="Observation title"><input class="inp" id="f2" placeholder="Area / process"><input class="inp" id="f3" placeholder="Observer"><button class="btn btn-primary btn-sm" onclick="NG.addData()">Add</button></div>`;
      list = items.map(it => dataItem(it, `${it.area?esc(it.area)+' · ':''}${esc(it.observer||'')}`)).join('');
    } else if (dataTab === 'interviews') {
      form = `<div class="field-row trio">
        <input class="inp" id="f1" placeholder="Interviewee"><input class="inp" id="f2" placeholder="Role"><select class="sel" id="f3">${pillarOptions('', true)}</select><button class="btn btn-primary btn-sm" onclick="NG.addData()">Add</button></div>`;
      list = items.map(it => dataItem(it, `${esc(it.role||'')}${it.pillarId?' · '+esc(pillarName(it.pillarId)):''}`)).join('');
    } else {
      form = `<div class="field-row"><input class="inp" id="f1" placeholder="Leader name"><input class="inp" id="f2" placeholder="Role / title"><button class="btn btn-primary btn-sm" onclick="NG.addData()">Add</button></div>`;
      list = items.map(it => dataItem(it, esc(it.role||''))).join('');
    }
    const badge = DATA_TABS.find(t=>t.k===dataTab).badge;
    const canUpload = dataTab === 'surveys' || dataTab === 'interviews';
    const upload = canUpload ? `<div class="panel">
      <div class="panel-title">📄 Upload responses (CSV)<span class="spacer"></span>
        <span class="item-meta">Export your Forms/Excel results as CSV</span></div>
      ${dsPending ? pendingUploadHTML() : `
        <div class="drop-zone" id="dropZone"
             onclick="document.getElementById('csvInput').click()"
             ondragover="event.preventDefault();this.classList.add('over')"
             ondragleave="this.classList.remove('over')"
             ondrop="NG.onDrop(event, this)">
          <div class="dz-icon">⬆</div>
          <div class="dz-main">Drop a CSV here, or click to choose a file</div>
          <div class="dz-sub">Question columns are detected automatically — scales, agreement scales and free text</div>
        </div>
        <input type="file" id="csvInput" accept=".csv,text/csv" style="display:none" onchange="NG.onCsvPicked(event)">`}
    </div>` : '';
    return `<div class="panel"><div class="panel-title">Data channels</div><div style="display:flex;gap:8px;flex-wrap:wrap">${tabs}</div></div>
      ${upload}
      <div class="panel"><div class="panel-title"><span class="badge ${badge}">${DATA_TABS.find(t=>t.k===dataTab).label}</span>Add entry</div>${form}</div>
      ${list || '<div class="empty">No entries in this channel yet.</div>'}`;
  }

  // Preview + confirm screen shown after a CSV is parsed but before it is saved.
  function pendingUploadHTML() {
    const p = dsPending;
    const counts = {};
    p.columns.forEach(c => { counts[c.type] = (counts[c.type] || 0) + 1; });
    return `<div class="rail-phase-label" style="padding:0 0 8px">Detected in “${esc(p.filename)}”</div>
      <div class="tile-row" style="margin-bottom:14px">
        <div class="tile"><div class="tile-label">Responses</div><div class="tile-value">${p.rows.length}</div></div>
        <div class="tile"><div class="tile-label">Numeric / NPS</div><div class="tile-value accent">${counts.scale || 0}</div></div>
        <div class="tile"><div class="tile-label">Agreement</div><div class="tile-value teal">${counts.likert || 0}</div></div>
        <div class="tile"><div class="tile-label">Free text</div><div class="tile-value gold">${counts.text || 0}</div></div>
      </div>
      <div class="field-row" style="grid-template-columns:1fr auto auto">
        <input class="inp" id="dsName" value="${esc(p.name)}" placeholder="Dataset name">
        <button class="btn btn-primary btn-sm" onclick="NG.confirmUpload()">Save dataset</button>
        <button class="btn btn-sm" onclick="NG.cancelUpload()">Cancel</button>
      </div>
      <div style="overflow-x:auto;max-height:260px;overflow-y:auto;margin-top:10px"><table class="map-table">
        <thead><tr><th>Column</th><th style="width:150px">Detected as</th></tr></thead>
        <tbody>${p.columns.map(c => `<tr><td class="map-q">${esc(c.label)}</td>
          <td><select class="sel" onchange="NG.setPendingType('${c.key}', this.value)">
            ${COL_TYPES.map(t => `<option value="${t.k}" ${c.type === t.k ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select></td></tr>`).join('')}</tbody>
      </table></div>`;
  }
  function dataItem(it, meta) {
    const open = expanded.has(it.id);
    return `<div class="item ${open?'expanded':''}">
      <div class="item-hdr">
        <div class="item-chevron" onclick="NG.tExp('${it.id}')">▶</div>
        <div class="item-main" onclick="NG.tExp('${it.id}')"><div class="item-name">${esc(it.name)}</div><div class="item-meta">${meta}</div></div>
        <span class="pill s-${it.status||'planned'}" onclick="NG.cycleStatus('data','${it.id}')">${(it.status||'planned').replace('_',' ')}</span>
        <button class="icon-btn" onclick="NG.delData('${it.id}')">🗑</button>
      </div>
      <div class="item-body"><textarea class="ta" placeholder="Notes, findings, links…" oninput="NG.editData('${it.id}','notes',this.value)">${esc(it.notes||'')}</textarea></div>
    </div>`;
  }

  // ══════════════════════════════════════════
  // 3 · AS-IS MAPPING
  // ══════════════════════════════════════════
  const SEVERITY = ['low','medium','high'];
  function renderAsisMap() {
    const items = J().asis_findings || [];
    const bySev = s => items.filter(f => f.severity === s).length;
    const form = `<div class="panel"><div class="panel-title">📌 Add finding</div>
      <div class="field-row"><select class="sel" id="f1" onchange="NG.fPillarChanged(this.value)">${pillarOptions('', true)}</select><select class="sel" id="f2" placeholder="Sub-area"><option value="">— sub-area —</option></select>
      <select class="sel" id="f3">${SEVERITY.map(s=>`<option value="${s}">${s} severity</option>`).join('')}</select></div>
      <div class="field-row wide"><input class="inp" id="f0" placeholder="Finding (e.g., Demand intake is informal and unprioritized)"></div>
      <div class="field-row wide"><textarea class="ta" id="f4" placeholder="Evidence / supporting data (optional)"></textarea></div>
      <button class="btn btn-primary btn-sm" onclick="NG.addFinding()">Add finding</button></div>`;
    const tiles = `<div class="tile-row">
      <div class="tile"><div class="tile-label">Findings</div><div class="tile-value">${items.length}</div></div>
      <div class="tile"><div class="tile-label">High</div><div class="tile-value" style="color:var(--red)">${bySev('high')}</div></div>
      <div class="tile"><div class="tile-label">Medium</div><div class="tile-value gold">${bySev('medium')}</div></div>
      <div class="tile"><div class="tile-label">Low</div><div class="tile-value teal">${bySev('low')}</div></div></div>`;
    const list = items.map(f => {
      const open = expanded.has(f.id);
      const sc = f.severity==='high'?'var(--red)':f.severity==='medium'?'var(--gold)':'var(--teal)';
      return `<div class="item ${open?'expanded':''}">
        <div class="item-hdr">
          <div class="item-chevron" onclick="NG.tExp('${f.id}')">▶</div>
          <div class="item-main" onclick="NG.tExp('${f.id}')"><div class="item-name">${esc(f.title)}</div>
            <div class="item-meta">${esc(pillarName(f.pillarId))}${f.subareaId?' › '+esc(subareaName(f.pillarId,f.subareaId)):''}</div></div>
          <span class="pill" style="color:${sc};border-color:${sc}">${esc(f.severity||'low')}</span>
          <button class="icon-btn" onclick="NG.delFinding('${f.id}')">🗑</button>
        </div>
        <div class="item-body"><textarea class="ta" placeholder="Evidence…" oninput="NG.editFinding('${f.id}','evidence',this.value)">${esc(f.evidence||'')}</textarea></div>
      </div>`;
    }).join('');
    return tiles + form + (list || '<div class="empty">No findings yet. Add findings from your data collection above.</div>');
  }

  // ══════════════════════════════════════════
  // 4 · AS-IS REPORTING
  // ══════════════════════════════════════════
  function renderAsisReport() {
    const r = J().asis_report; const byP = r.byPillar || {};
    const pillarBlocks = (J().pillars || []).map(p => {
      const findings = (J().asis_findings || []).filter(f => f.pillarId === p.id);
      return `<div class="panel"><div class="panel-title">${esc(p.name)} <span class="spacer"></span><span class="item-meta">${findings.length} finding${findings.length!==1?'s':''} · maturity ${p.maturity||0}/5</span></div>
        <textarea class="ta" style="min-height:80px" placeholder="Narrative for ${esc(p.name)}…" oninput="NG.editReportPillar('${p.id}',this.value)">${esc(byP[p.id]||'')}</textarea>
        ${findings.length?`<div class="item-meta" style="margin-top:8px">Findings: ${findings.map(f=>esc(f.title)).join(' · ')}</div>`:''}
      </div>`;
    }).join('');
    return `<div class="panel">
        <div class="panel-title">Executive summary <span class="spacer"></span>
          <span class="pill s-${r.status||'in_progress'}" onclick="NG.cycleReportStatus()">${(r.status||'in_progress').replace('_',' ')}</span></div>
        <textarea class="ta" style="min-height:110px" placeholder="Overall AS-IS narrative and key themes…" oninput="NG.editReport('executive_summary',this.value)">${esc(r.executive_summary||'')}</textarea>
        <div class="field-row wide" style="margin-top:10px"><input class="inp" placeholder="Link to full report (Google Slides / PDF)…" value="${esc(r.link||'')}" oninput="NG.editReport('link',this.value)"></div>
      </div>
      <div class="phase-band">By pillar</div>
      ${pillarBlocks}`;
  }

  // ══════════════════════════════════════════
  // 5 · TO-BE DESIGN SESSIONS
  // ══════════════════════════════════════════
  function renderTobeSessions() {
    const items = J().tobe_sessions || [];
    const form = `<div class="panel"><div class="panel-title">🧩 Schedule a Context-Driven Design session</div>
      <div class="field-row trio"><input class="inp" id="f1" placeholder="Session name"><input class="inp" id="f2" type="date"><select class="sel" id="f3">${pillarOptions('', true)}</select><button class="btn btn-primary btn-sm" onclick="NG.addSession()">Add</button></div>
      <div class="field-row wide"><input class="inp" id="f4" placeholder="Participants (optional)"></div></div>`;
    const list = items.map(s => {
      const open = expanded.has(s.id);
      return `<div class="item ${open?'expanded':''}">
        <div class="item-hdr">
          <div class="item-chevron" onclick="NG.tExp('${s.id}')">▶</div>
          <div class="item-main" onclick="NG.tExp('${s.id}')"><div class="item-name">${esc(s.name)}</div>
            <div class="item-meta">${s.date?esc(s.date)+' · ':''}${s.focusPillarId?esc(pillarName(s.focusPillarId))+' · ':''}${esc(s.participants||'')}</div></div>
          <span class="pill s-${s.status||'planned'}" onclick="NG.cycleStatus('tobe_sessions','${s.id}')">${(s.status||'planned').replace('_',' ')}</span>
          <button class="icon-btn" onclick="NG.delSession('${s.id}')">🗑</button>
        </div>
        <div class="item-body"><textarea class="ta" placeholder="Outcomes, decisions, target-state ideas…" oninput="NG.editSession('${s.id}','outcomes',this.value)">${esc(s.outcomes||'')}</textarea></div>
      </div>`;
    }).join('');
    return form + (list || '<div class="empty">No design sessions yet.</div>');
  }

  // ══════════════════════════════════════════
  // 6 · CHAMPIONS
  // ══════════════════════════════════════════
  const STAGES = [ {k:'identified',label:'Identified'}, {k:'early_adopter',label:'Early Adopter'}, {k:'champion',label:'Champion'} ];
  function renderChampions() {
    const items = J().champions || [];
    const cnt = k => items.filter(c => (c.stage||'identified') === k).length;
    const tiles = `<div class="tile-row">
      <div class="tile"><div class="tile-label">Identified</div><div class="tile-value">${cnt('identified')}</div></div>
      <div class="tile"><div class="tile-label">Early Adopters</div><div class="tile-value gold">${cnt('early_adopter')}</div></div>
      <div class="tile"><div class="tile-label">Champions</div><div class="tile-value green">${cnt('champion')}</div></div></div>`;
    const form = `<div class="panel"><div class="panel-title">🤝 Add a person</div>
      <div class="field-row trio"><input class="inp" id="f1" placeholder="Name"><input class="inp" id="f2" placeholder="Role"><input class="inp" id="f3" placeholder="Area / team"><button class="btn btn-primary btn-sm" onclick="NG.addChampion()">Add</button></div></div>`;
    const list = items.map(c => {
      const stage = c.stage || 'identified';
      const color = stage==='champion'?'var(--green)':stage==='early_adopter'?'var(--gold)':'var(--text-muted)';
      return `<div class="item"><div class="item-hdr">
        <div class="item-main"><div class="item-name">${esc(c.name)}</div><div class="item-meta">${esc(c.role||'')}${c.area?' · '+esc(c.area):''}</div></div>
        <select class="sel" style="max-width:170px" onchange="NG.setStage('${c.id}',this.value)">${STAGES.map(s=>`<option value="${s.k}" ${stage===s.k?'selected':''}>${s.label}</option>`).join('')}</select>
        <span class="rail-dot" style="background:${color};width:11px;height:11px"></span>
        <button class="icon-btn" onclick="NG.delChampion('${c.id}')">🗑</button>
      </div></div>`;
    }).join('');
    return tiles + form + (list || '<div class="empty">No people identified yet. Start by adding early adopters spotted during interviews and sessions.</div>');
  }

  // ══════════════════════════════════════════
  // 7 · DELIVERABLES
  // ══════════════════════════════════════════
  const DTYPES = [ {k:'process_map',label:'Process Map'}, {k:'playbook',label:'Playbook'}, {k:'guide',label:'Guide'}, {k:'other',label:'Other'} ];
  function renderDeliverables() {
    const items = J().tobe_deliverables || [];
    const form = `<div class="panel"><div class="panel-title">📦 Add deliverable</div>
      <div class="field-row trio"><input class="inp" id="f1" placeholder="Deliverable name"><select class="sel" id="f2">${DTYPES.map(t=>`<option value="${t.k}">${t.label}</option>`).join('')}</select><input class="inp" id="f3" placeholder="Link (optional)"><button class="btn btn-primary btn-sm" onclick="NG.addDeliverable()">Add</button></div></div>`;
    const list = items.map(dv => {
      const t = DTYPES.find(x=>x.k===dv.type);
      return `<div class="item"><div class="item-hdr">
        <div class="item-main"><div class="item-name">${dv.link?`<a href="${esc(dv.link)}" target="_blank" style="color:inherit">${esc(dv.name)} ↗</a>`:esc(dv.name)}</div>
          <div class="item-meta">${t?t.label:'—'}</div></div>
        <span class="pill s-${dv.status||'planned'}" onclick="NG.cycleStatus('tobe_deliverables','${dv.id}')">${(dv.status||'planned').replace('_',' ')}</span>
        <button class="icon-btn" onclick="NG.delDeliverable('${dv.id}')">🗑</button>
      </div></div>`;
    }).join('');
    return form + (list || '<div class="empty">No deliverables yet — process maps, playbooks and guides will appear here.</div>');
  }

  // ══════════════════════════════════════════
  // 8 · FINAL PROPOSAL
  // ══════════════════════════════════════════
  function renderProposal() {
    const p = J().tobe_proposal;
    return `<div class="panel">
        <div class="panel-title">Final TO-BE proposal <span class="spacer"></span>
          <span class="pill s-${p.status||'in_progress'}" onclick="NG.cycleProposalStatus()">${(p.status||'in_progress').replace('_',' ')}</span></div>
        <div class="rail-phase-label" style="padding:4px 0">Overview</div>
        <textarea class="ta" style="min-height:110px" placeholder="The consolidated target-state proposal — vision, scope, expected value…" oninput="NG.editProposal('overview',this.value)">${esc(p.overview||'')}</textarea>
        <div class="rail-phase-label" style="padding:12px 0 4px">Scope &amp; recommendations</div>
        <textarea class="ta" style="min-height:90px" placeholder="Key recommendations and scope…" oninput="NG.editProposal('scope',this.value)">${esc(p.scope||'')}</textarea>
        <div class="field-row wide" style="margin-top:10px"><input class="inp" placeholder="Link to the proposal deck / document…" value="${esc(p.link||'')}" oninput="NG.editProposal('link',this.value)"></div>
      </div>`;
  }

  // ══════════════════════════════════════════
  // 9 · ROADMAP
  // ══════════════════════════════════════════
  const HORIZONS = [ {k:'H1',label:'Horizon 1 · Now'}, {k:'H2',label:'Horizon 2 · Next'}, {k:'H3',label:'Horizon 3 · Later'} ];
  function renderRoadmap() {
    const items = J().roadmap || [];
    const form = `<div class="panel"><div class="panel-title">🚀 Add strategic initiative</div>
      <div class="field-row trio"><input class="inp" id="f1" placeholder="Initiative name"><select class="sel" id="f2">${HORIZONS.map(h=>`<option value="${h.k}">${h.label}</option>`).join('')}</select><select class="sel" id="f3">${pillarOptions('', true)}</select><button class="btn btn-primary btn-sm" onclick="NG.addInitiative()">Add</button></div>
      <div class="field-row wide"><input class="inp" id="f4" placeholder="Owner (optional)"></div></div>`;
    let board = '';
    HORIZONS.forEach(h => {
      const its = items.filter(i => (i.horizon||'H1') === h.k);
      board += `<div class="phase-band">${h.label} · ${its.length}</div>`;
      board += its.map(i => {
        const open = expanded.has(i.id);
        return `<div class="item ${open?'expanded':''}">
          <div class="item-hdr">
            <div class="item-chevron" onclick="NG.tExp('${i.id}')">▶</div>
            <div class="item-main" onclick="NG.tExp('${i.id}')"><div class="item-name">${esc(i.name)}</div>
              <div class="item-meta">${i.pillarId?esc(pillarName(i.pillarId))+' · ':''}${esc(i.owner||'')}</div></div>
            <span class="pill s-${i.status||'planned'}" onclick="NG.cycleStatus('roadmap','${i.id}')">${(i.status||'planned').replace('_',' ')}</span>
            <button class="icon-btn" onclick="NG.delInitiative('${i.id}')">🗑</button>
          </div>
          <div class="item-body"><textarea class="ta" placeholder="Description, expected outcome, dependencies…" oninput="NG.editInitiative('${i.id}','description',this.value)">${esc(i.description||'')}</textarea></div>
        </div>`;
      }).join('') || '<div class="empty" style="padding:18px">No initiatives in this horizon.</div>';
    });
    return form + board;
  }

  // ══════════════════════════════════════════
  // CSV PARSING + COLUMN TYPE DETECTION
  // ══════════════════════════════════════════

  // Full RFC-4180-ish parser: quoted fields, "" escapes, embedded newlines, CRLF, BOM.
  function parseCSV(text, delim) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const out = []; let row = [], field = '', i = 0, inQ = false;
    while (i < text.length) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQ = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQ = true; i++; continue; }
      if (c === delim) { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { row.push(field); out.push(row); row = []; field = ''; i++; continue; }
      field += c; i++;
    }
    if (field !== '' || row.length) { row.push(field); out.push(row); }
    return out.filter(r => r.some(v => String(v).trim() !== ''));
  }

  // Exports vary: Forms/Excel use ',', many European locales use ';'.
  function sniffDelimiter(text) {
    const line = text.split(/\r?\n/)[0] || '';
    let best = ',', bestN = -1;
    [',', ';', '\t'].forEach(d => {
      let n = 0, inQ = false;
      for (const ch of line) { if (ch === '"') inQ = !inQ; else if (ch === d && !inQ) n++; }
      if (n > bestN) { bestN = n; best = d; }
    });
    return best;
  }

  const META_RE = /^(id|start ?time|completion ?time|submit(ted)?( ?time)?|last ?modified( ?time)?|email|name|respondent|timestamp|date)$/i;
  // Tolerates the "Desagree" spelling that appears in the real NextGen exports.
  const LIKERT_SCALE = [
    { key: 'disagree_strong', order: 1, label: 'Disagree',          re: /^(strongly\s+)?d[ei]sagree$/i },
    { key: 'disagree_weak',   order: 2, label: 'Somewhat Disagree',  re: /^(somewhat|slightly|partially)\s+d[ei]sagree$/i },
    { key: 'agree_weak',      order: 3, label: 'Somewhat Agree',     re: /^(somewhat|slightly|partially)\s+agree$/i },
    { key: 'agree_strong',    order: 4, label: 'Agree',              re: /^(strongly\s+|totally\s+)?agree$/i },
    { key: 'neutral',         order: 0, label: 'Neutral / N-A',      re: /^(neutral|neither.*|no opinion|n\/?a)$/i }
  ];
  function likertBucket(v) {
    const s = String(v == null ? '' : v).trim();
    if (!s) return null;
    // weak variants first — "somewhat disagree" must not fall into the strong bucket
    for (const b of [LIKERT_SCALE[1], LIKERT_SCALE[2], LIKERT_SCALE[0], LIKERT_SCALE[3], LIKERT_SCALE[4]]) {
      if (b.re.test(s)) return b;
    }
    return null;
  }
  const LIKERT_ORDER = ['disagree_strong', 'disagree_weak', 'agree_weak', 'agree_strong', 'neutral'];
  const LIKERT_COLOR = {
    disagree_strong: 'var(--lk-1)', disagree_weak: 'var(--lk-2)',
    agree_weak: 'var(--lk-3)', agree_strong: 'var(--lk-4)', neutral: 'var(--lk-na)'
  };
  // Light fills need dark ink to stay legible.
  const LIKERT_DARK_INK = { disagree_weak: true, agree_weak: true };
  const LIKERT_LABEL = {};
  LIKERT_SCALE.forEach(b => { LIKERT_LABEL[b.key] = b.label; });

  // Form exports carry authoring artifacts in the header cell — the answer-type
  // hint ("✎ [Open text]"), hard newlines, doubled spaces. Strip them so the chart
  // label reads as the question the respondent actually saw.
  function cleanLabel(raw) {
    return String(raw == null ? '' : raw)
      .replace(/[✎✏✒]?\s*\[(open[- ]?(text|ended)|free[- ]?text|text)\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  // Headers a spreadsheet invented rather than a question anyone was asked.
  const JUNK_HEADER_RE = /^(column\s*\d*|unnamed[\s:_]*\d*|field\s*\d*|_+)$/i;

  function detectColumns(header, rows) {
    return header.map((h, idx) => {
      const key = 'c' + idx;
      const label = cleanLabel(h) || `Column ${idx + 1}`;
      const vals = rows.map(r => String(r[idx] == null ? '' : r[idx]).trim()).filter(v => v);
      const col = { key, label, type: 'category', pillarId: '' };
      if (!vals.length) { col.type = 'meta'; return col; }
      if (META_RE.test(label)) { col.type = 'meta'; return col; }
      // A junk header means there's no question behind the column — keep it out of
      // the charts rather than plotting a nameless statement. Retypable in the UI.
      if (JUNK_HEADER_RE.test(label)) { col.type = 'meta'; col.junkHeader = true; return col; }

      const likertHits = vals.filter(v => likertBucket(v)).length;
      if (likertHits / vals.length >= 0.6) { col.type = 'likert'; return col; }

      const nums = vals.filter(v => /^-?\d+([.,]\d+)?$/.test(v)).map(v => parseFloat(v.replace(',', '.')));
      if (nums.length / vals.length >= 0.8) {
        const max = Math.max(...nums), min = Math.min(...nums);
        col.type = 'scale';
        col.min = min; col.max = max;
        // 0–10 recommendation question → treat as NPS
        if (min >= 0 && max <= 10 && (/recommend|nps|0\s*[-–]\s*10/i.test(label) || max > 5)) col.nps = true;
        return col;
      }

      const avgLen = vals.reduce((n, v) => n + v.length, 0) / vals.length;
      const uniqueRatio = new Set(vals.map(v => v.toLowerCase())).size / vals.length;
      if (avgLen > 25 || uniqueRatio > 0.6) { col.type = 'text'; return col; }
      return col;
    });
  }

  // Read a picked/dropped CSV, parse it, detect column types, stage for confirmation.
  function readCsvFile(file) {
    if (!/\.csv$/i.test(file.name) && file.type && !/csv|text/.test(file.type)) {
      window.showToast('Please upload a .csv file (export from Excel or Forms first)', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => window.showToast('Could not read that file', 'error');
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const grid = parseCSV(text, sniffDelimiter(text));
        if (grid.length < 2) { window.showToast('That CSV has no data rows', 'warning'); return; }
        const header = grid[0];
        const dataRows = grid.slice(1);
        const columns = detectColumns(header, dataRows);
        const rows = dataRows.map(r => {
          const o = {};
          columns.forEach((c, i) => { o[c.key] = r[i] == null ? '' : String(r[i]); });
          return o;
        });
        dsPending = {
          filename: file.name,
          name: file.name.replace(/\.csv$/i, '').slice(0, 80),
          columns, rows
        };
        render();
      } catch (e) {
        window.showToast('Could not parse that CSV: ' + e.message, 'error');
      }
    };
    reader.readAsText(file);
  }

  const COL_TYPES = [
    { k: 'meta', label: 'Metadata (ignore)' }, { k: 'scale', label: 'Numeric / NPS' },
    { k: 'likert', label: 'Agreement scale' }, { k: 'text', label: 'Free text' },
    { k: 'category', label: 'Category' }
  ];

  // ══════════════════════════════════════════
  // 3 · RESPONSE ANALYTICS
  // ══════════════════════════════════════════
  let dsList = [];            // dataset metadata for the current journey
  let dsActiveId = null;      // selected dataset
  let dsFull = null;          // full dataset (with rows) for the selected id
  let dsLoading = false;
  let dsPending = null;       // parsed-but-unsaved CSV awaiting confirmation
  let aiEnabled = null;
  let showTables = {};

  function renderAnalytics() {
    // Shell — the body is filled asynchronously by loadAnalytics().
    setTimeout(loadAnalytics, 0);
    return `<div id="analyticsBody"><div class="empty">Loading response data…</div></div>`;
  }

  async function loadAnalytics() {
    const el = document.getElementById('analyticsBody'); if (!el) return;
    try {
      if (aiEnabled === null) {
        try { aiEnabled = (await window.api('GET', '/ai-status')).enabled; } catch (e) { aiEnabled = false; }
      }
      dsList = await window.api('GET', `/journeys/${J().id}/datasets`);
      if (dsActiveId && !dsList.some(d => d.id === dsActiveId)) { dsActiveId = null; dsFull = null; }
      if (!dsActiveId && dsList.length) dsActiveId = dsList[0].id;
      if (dsActiveId && (!dsFull || dsFull.id !== dsActiveId)) {
        dsFull = await window.api('GET', `/datasets/${dsActiveId}`);
      }
      el.innerHTML = analyticsHTML();
    } catch (e) {
      el.innerHTML = `<div class="empty">Could not load response data: ${esc(e.message)}</div>`;
    }
  }

  function analyticsHTML() {
    if (!dsList.length) {
      return `<div class="empty" style="padding:44px">
        No response data yet.<br><br>
        Upload a survey or interview CSV from <b>Data Collection</b> (step 2) and it will be analysed here.
        <div style="margin-top:16px"><button class="btn btn-primary btn-sm" onclick="NG.goSection('data')">Go to Data Collection →</button></div>
      </div>`;
    }
    const picker = `<div class="panel"><div class="panel-title">Dataset<span class="spacer"></span>
      <span class="item-meta">${dsList.length} uploaded</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${dsList.map(d => `<button class="pill ${d.id===dsActiveId?'s-active':''}" onclick="NG.selectDataset('${d.id}')">${esc(d.name)} · ${d.row_count}</button>`).join('')}
      </div></div>`;
    if (!dsFull) return picker + '<div class="empty">Loading…</div>';

    const cols = dsFull.columns || [], rows = dsFull.rows || [];
    const scaleCols = cols.filter(c => c.type === 'scale');
    const likertCols = cols.filter(c => c.type === 'likert');
    const textCols = cols.filter(c => c.type === 'text');
    const npsCol = scaleCols.find(c => c.nps);

    // ── tiles ──
    let tiles = `<div class="tile-row">
      <div class="tile"><div class="tile-label">Responses</div><div class="tile-value">${rows.length}</div></div>
      <div class="tile"><div class="tile-label">Questions</div><div class="tile-value">${scaleCols.length + likertCols.length + textCols.length}</div></div>`;
    if (npsCol) {
      const n = npsStats(rows, npsCol);
      tiles += `<div class="tile"><div class="tile-label">NPS</div><div class="tile-value ${n.nps>=0?'green':''}" style="${n.nps<0?'color:var(--lk-1)':''}">${n.nps>0?'+':''}${n.nps}</div></div>`;
    }
    if (likertCols.length) {
      const ag = overallAgreement(rows, likertCols);
      tiles += `<div class="tile"><div class="tile-label">Overall Agreement</div><div class="tile-value teal">${ag}%</div></div>`;
    }
    tiles += `<div class="tile"><div class="tile-label">Free-text answers</div><div class="tile-value gold">${countTextAnswers(rows, textCols)}</div></div></div>`;

    let body = picker + tiles;
    if (npsCol) body += npsBlock(rows, npsCol);
    if (likertCols.length) body += likertBlock(rows, likertCols);
    body += themesBlock();
    body += mappingBlock(cols);
    return body;
  }

  // ── NPS ──
  function npsStats(rows, col) {
    let p = 0, pa = 0, d = 0, n = 0;
    rows.forEach(r => {
      const v = parseFloat(String(r[col.key] == null ? '' : r[col.key]).replace(',', '.'));
      if (isNaN(v)) return;
      n++;
      if (v >= 9) p++; else if (v >= 7) pa++; else d++;
    });
    const pct = x => n ? Math.round(x / n * 100) : 0;
    return { n, p, pa, d, pP: pct(p), pPa: pct(pa), pD: pct(d), nps: n ? Math.round((p - d) / n * 100) : 0 };
  }
  function npsBlock(rows, col) {
    const s = npsStats(rows, col);
    const segs = [
      { l: 'Detractors (0–6)', v: s.pD, c: 'var(--lk-1)', n: s.d },
      { l: 'Passives (7–8)', v: s.pPa, c: 'var(--lk-na)', n: s.pa },
      { l: 'Promoters (9–10)', v: s.pP, c: 'var(--lk-4)', n: s.p }
    ];
    const key = 'nps';
    return `<div class="panel">
      <div class="panel-title">Net Promoter Score<span class="spacer"></span>
        <button class="tbl-toggle" onclick="NG.toggleTable('${key}')">${showTables[key] ? 'Hide' : 'Show'} data table</button></div>
      <div class="chart-q">${esc(col.label)}</div>
      <div class="nps-wrap">
        <div><div class="nps-score" style="color:${s.nps >= 0 ? 'var(--lk-4)' : 'var(--lk-1)'}">${s.nps > 0 ? '+' : ''}${s.nps}</div>
          <div class="nps-label">NPS · ${s.n} responses</div></div>
        <div class="nps-bar">
          <div class="stack">${segs.map(g => g.v ? `<div class="seg" style="width:${g.v}%;background:${g.c}" title="${esc(g.l)}: ${g.n} (${g.v}%)">${g.v >= 8 ? g.v + '%' : ''}</div>` : '').join('')}</div>
          <div class="chart-legend">${segs.map(g => `<span class="lg"><span class="sw" style="background:${g.c}"></span>${esc(g.l)} · ${g.n}</span>`).join('')}</div>
        </div>
      </div>
      ${showTables[key] ? `<table class="dv-table"><thead><tr><th>Group</th><th class="num">Responses</th><th class="num">Share</th></tr></thead><tbody>
        ${segs.map(g => `<tr><td>${esc(g.l)}</td><td class="num">${g.n}</td><td class="num">${g.v}%</td></tr>`).join('')}
      </tbody></table>` : ''}
    </div>`;
  }

  // ── Likert ──
  function likertCounts(rows, col) {
    const c = { disagree_strong: 0, disagree_weak: 0, agree_weak: 0, agree_strong: 0, neutral: 0 };
    let n = 0;
    rows.forEach(r => { const b = likertBucket(r[col.key]); if (b) { c[b.key]++; n++; } });
    return { c, n };
  }
  function overallAgreement(rows, cols) {
    let agree = 0, tot = 0;
    cols.forEach(col => {
      const { c, n } = likertCounts(rows, col);
      agree += c.agree_weak + c.agree_strong; tot += n;
    });
    return tot ? Math.round(agree / tot * 100) : 0;
  }
  function countTextAnswers(rows, cols) {
    let n = 0;
    cols.forEach(col => rows.forEach(r => {
      const v = String(r[col.key] == null ? '' : r[col.key]).trim().toLowerCase();
      if (v && !['n/a', 'na', 'none', '-', '.', 'no', 'nil'].includes(v)) n++;
    }));
    return n;
  }
  function likertBlock(rows, cols) {
    const key = 'likert';
    // Rank by agreement so the weakest statements surface at the bottom.
    const scored = cols.map(col => {
      const { c, n } = likertCounts(rows, col);
      const agree = n ? Math.round((c.agree_weak + c.agree_strong) / n * 100) : 0;
      return { col, c, n, agree };
    }).sort((a, b) => b.agree - a.agree);

    const legend = `<div class="chart-legend">${LIKERT_ORDER.map(k =>
      `<span class="lg"><span class="sw" style="background:${LIKERT_COLOR[k]}"></span>${esc(LIKERT_LABEL[k])}</span>`).join('')}</div>`;

    const charts = scored.map(s => {
      if (!s.n) return '';
      const segs = LIKERT_ORDER.map(k => {
        const pct = Math.round(s.c[k] / s.n * 100);
        if (!pct) return '';
        return `<div class="seg ${LIKERT_DARK_INK[k] ? 'dark-ink' : ''}" style="width:${pct}%;background:${LIKERT_COLOR[k]}"
                 title="${esc(LIKERT_LABEL[k])}: ${s.c[k]} (${pct}%)">${pct >= 9 ? pct + '%' : ''}</div>`;
      }).join('');
      return `<div class="chart-block">
        <div class="chart-q">${esc(s.col.label)} <span style="color:var(--text-muted);font-weight:400">· ${s.agree}% agree · ${s.n} responses</span></div>
        <div class="stack">${segs}</div>
      </div>`;
    }).join('');

    const table = showTables[key] ? `<table class="dv-table"><thead><tr><th>Statement</th>
      ${LIKERT_ORDER.map(k => `<th class="num">${esc(LIKERT_LABEL[k])}</th>`).join('')}<th class="num">% Agree</th></tr></thead><tbody>
      ${scored.map(s => `<tr><td>${esc(s.col.label)}</td>${LIKERT_ORDER.map(k => `<td class="num">${s.c[k]}</td>`).join('')}<td class="num">${s.agree}%</td></tr>`).join('')}
      </tbody></table>` : '';

    return `<div class="panel">
      <div class="panel-title">Agreement by statement<span class="spacer"></span>
        <button class="tbl-toggle" onclick="NG.toggleTable('${key}')">${showTables[key] ? 'Hide' : 'Show'} data table</button></div>
      ${legend}${charts}${table}
      <div class="chart-note">Sorted by agreement, strongest first. Statements at the bottom are where the organization is least aligned.</div>
    </div>`;
  }

  // ── AI themes ──
  function themesBlock() {
    const a = (dsFull && dsFull.analysis) || {};
    const hasTextCols = (dsFull.columns || []).some(c => c.type === 'text');
    let head = `<div class="panel-title">Themes in the free-text answers<span class="spacer"></span>`;
    if (hasTextCols && aiEnabled) {
      head += `<button class="btn btn-sm ${a.generated_at ? '' : 'btn-primary'}" id="aiRunBtn" onclick="NG.runAnalysis()">${a.generated_at ? '↻ Re-run analysis' : '✨ Analyse responses'}</button>`;
    }
    head += `</div>`;

    if (!hasTextCols) {
      return `<div class="panel">${head}<div class="empty">No free-text questions are mapped in this dataset. Tag a column as <b>Free text</b> below to enable theme analysis.</div></div>`;
    }
    if (!aiEnabled) {
      return `<div class="panel">${head}
        <div class="ai-off"><b style="color:var(--text)">AI theme analysis isn't configured.</b><br>
        Clustering free-text answers into themes uses the Claude API. To turn it on, set an
        <code>ANTHROPIC_API_KEY</code> environment variable on the server (and in the Vercel project settings), then redeploy.<br><br>
        All the charts above are computed locally and work without it.</div></div>`;
    }
    if (!a.generated_at) {
      return `<div class="panel">${head}<div class="empty">Not analysed yet — run the analysis to cluster responses into themes.</div></div>`;
    }

    const qs = (a.questions || []).map(q => {
      const maxN = Math.max(1, ...(q.themes || []).map(t => t.count || 0));
      const bars = (q.themes || []).map(t => `<div class="mag-row">
          <div class="mag-track"><div class="mag-fill" style="width:${Math.round((t.count || 0) / maxN * 100)}%"></div></div>
          <div class="mag-val">${t.count || 0}</div></div>`).join('');
      const cards = (q.themes || []).map(t => `<div class="theme-card s-${esc(t.sentiment || 'mixed')}">
          <div class="theme-hd"><div class="theme-name">${esc(t.label)}</div><div class="theme-count">${t.count || 0} responses</div></div>
          <div class="theme-desc">${esc(t.description)}</div>
          ${(t.quotes || []).slice(0, 3).map(qt => `<div class="theme-quote">“${esc(qt)}”</div>`).join('')}
          <div class="theme-impl"><b>Implication:</b> ${esc(t.implication)}</div>
        </div>`).join('');
      return `<div style="margin-bottom:22px">
        <div class="chart-q" style="font-size:13.5px">${esc(q.question)}</div>
        <div class="item-meta" style="margin-bottom:10px;line-height:1.6">${esc(q.summary)}</div>
        ${bars}<div style="height:10px"></div>${cards}</div>`;
    }).join('');

    const insights = (a.overall_insights || []).map((s, i) =>
      `<div class="insight-item"><div class="n">${i + 1}</div><div>${esc(s)}</div></div>`).join('');

    const trunc = (a.truncated || []).length
      ? `<div class="chart-note">Note: ${a.truncated.map(t => `“${esc(t.question)}” analysed on the first ${t.used} of ${t.total} answers`).join('; ')}.</div>` : '';

    return `<div class="panel">${head}
      ${insights ? `<div class="rail-phase-label" style="padding:0 0 8px">Key insights</div>${insights}<div style="height:16px"></div>` : ''}
      ${qs}${trunc}
      <div class="chart-note">Generated ${esc(String(a.generated_at).slice(0, 16).replace('T', ' '))} · ${esc(a.model || '')}</div>
    </div>`;
  }

  // ── column mapping ──
  function mappingBlock(cols) {
    return `<div class="panel">
      <div class="panel-title">Question mapping<span class="spacer"></span>
        <span class="item-meta">Tag each column so it charts correctly and rolls up to a pillar</span></div>
      <div style="overflow-x:auto"><table class="map-table">
        <thead><tr><th>Question / column</th><th style="width:170px">Type</th><th style="width:200px">Pillar</th></tr></thead>
        <tbody>${cols.map(c => `<tr>
          <td class="map-q">${esc(c.label)}</td>
          <td><select class="sel" onchange="NG.setColType('${c.key}', this.value)">
            ${COL_TYPES.map(t => `<option value="${t.k}" ${c.type === t.k ? 'selected' : ''}>${t.label}</option>`).join('')}
          </select></td>
          <td><select class="sel" onchange="NG.setColPillar('${c.key}', this.value)">${pillarOptions(c.pillarId, true)}</select></td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="sec-actions"><button class="btn btn-sm" onclick="NG.deleteDataset()">🗑 Delete this dataset</button></div>
    </div>`;
  }

  const RENDERERS = {
    pillars: renderPillars, data: renderData, analytics: renderAnalytics,
    asis_map: renderAsisMap, asis_report: renderAsisReport,
    tobe_sessions: renderTobeSessions, champions: renderChampions, deliverables: renderDeliverables,
    proposal: renderProposal, roadmap: renderRoadmap
  };

  // ══════════════════════════════════════════
  // MUTATIONS (exposed on NG)
  // ══════════════════════════════════════════
  const STATUS_CYCLE = ['planned','in_progress','done'];
  function cycleStatus(field, id) {
    const arr = J()[field] || [];
    const it = arr.find(x => x.id === id); if (!it) return;
    const cur = STATUS_CYCLE.indexOf(it.status || 'planned');
    it.status = STATUS_CYCLE[(cur + 1) % STATUS_CYCLE.length];
    commit(); render();
  }
  const val = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
  const rawVal = id => { const e = document.getElementById(id); return e ? e.value : ''; };

  const NG = {
    SECTIONS, goSection, renderRail, render, toggleDone,
    tExp: toggleExpand, cycleStatus,

    // pillars
    setMaturity(id, v) { const p = J().pillars.find(p=>p.id===id); if(!p) return; p.maturity = parseInt(v)||0;
      const n = document.getElementById('matn_'+id); if (n){ const m=p.maturity; n.textContent=m+'/5'; n.className='mat-num '+(m<=1?'low':m<=3?'med':'high'); } window.scheduleSave(); renderRail(); },
    setPillarNotes(id, v) { const p = J().pillars.find(p=>p.id===id); if(p){ p.notes=v; window.scheduleSave(); } },
    addPillar() { const name = val('npName'); if(!name){ window.showToast('Enter a pillar name','warning'); return; }
      J().pillars.push({ id:uid('p'), name, respondents:val('npResp'), summary:'', maturity:0, subareas:[] }); commit(); render(); },

    // ── sub-areas (each client scopes their own) ──
    addSubarea(pid) {
      const p = J().pillars.find(x => x.id === pid); if (!p) return;
      const name = val('sa_' + pid);
      if (!name) { window.showToast('Enter a sub-area name','warning'); return; }
      p.subareas = p.subareas || [];
      if (p.subareas.some(s => s.name.toLowerCase() === name.toLowerCase())) {
        window.showToast('That sub-area already exists in this pillar','warning'); return;
      }
      p.subareas.push({ id: uid('sa'), name, questions: [] });
      expanded.add(pid); commit(); render();
      window.showToast('Sub-area added','success');
    },
    delSubarea(pid, sid) {
      const p = J().pillars.find(x => x.id === pid); if (!p) return;
      const s = (p.subareas || []).find(x => x.id === sid); if (!s) return;
      // Findings mapped to this sub-area stay with the pillar but lose the sub-area tag.
      const linked = (J().asis_findings || []).filter(f => f.pillarId === pid && f.subareaId === sid);
      let msg = `Remove the sub-area "${s.name}"?`;
      if ((s.questions || []).length) msg += `\n\nIts ${s.questions.length} interview question(s) will be removed too.`;
      if (linked.length) msg += `\n\n${linked.length} AS-IS finding(s) are mapped to it. They will be kept under "${p.name}" but lose the sub-area tag.`;
      if (!confirm(msg)) return;
      linked.forEach(f => { f.subareaId = ''; });
      p.subareas = p.subareas.filter(x => x.id !== sid);
      expanded.add(pid); commit(); render();
      window.showToast(linked.length ? `Sub-area removed · ${linked.length} finding(s) re-tagged to the pillar` : 'Sub-area removed','success');
    },
    addQuestion(pid, sid) {
      const p = J().pillars.find(x => x.id === pid); if (!p) return;
      const s = (p.subareas || []).find(x => x.id === sid); if (!s) return;
      const q = val('q_' + sid);
      if (!q) { window.showToast('Enter a question','warning'); return; }
      s.questions = s.questions || []; s.questions.push(q);
      expanded.add(pid); commit(); render();
    },
    delQuestion(pid, sid, idx) {
      const p = J().pillars.find(x => x.id === pid); if (!p) return;
      const s = (p.subareas || []).find(x => x.id === sid); if (!s) return;
      (s.questions || []).splice(idx, 1);
      expanded.add(pid); commit(); render();
    },
    resetPillars() { if(!confirm('Reset pillars to the default 4 NextGen pillars? Custom pillars and maturity notes will be replaced.')) return;
      window.api('GET','/default-pillars').then(def=>{ J().pillars = def; commit(); render(); window.showToast('Pillars reset','success'); }); },

    // data collection
    setDataTab(k) { dataTab = k; render(); },
    addData() {
      const name = val('f1'); if(!name){ window.showToast('Enter a name','warning'); return; }
      const arr = J().data_collection[dataTab];
      const base = { id:uid('d'), name, status:'planned', notes:'' };
      if (dataTab==='surveys') Object.assign(base, { audience:val('f2'), responses: parseInt(val('f3'))||0 });
      else if (dataTab==='gemba') Object.assign(base, { area:val('f2'), observer:val('f3') });
      else if (dataTab==='interviews') Object.assign(base, { role:val('f2'), pillarId:val('f3') });
      else Object.assign(base, { role:val('f2') });
      arr.unshift(base); commit(); render();
    },
    editData(id, field, v) { const it = J().data_collection[dataTab].find(x=>x.id===id); if(it){ it[field]=v; window.scheduleSave(); } },
    delData(id) { const a = J().data_collection[dataTab]; const i = a.findIndex(x=>x.id===id); if(i>-1){ a.splice(i,1); commit(); render(); } },

    // ── CSV upload ──
    onDrop(ev, zone) {
      ev.preventDefault(); zone.classList.remove('over');
      const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (f) readCsvFile(f);
    },
    onCsvPicked(ev) { const f = ev.target.files && ev.target.files[0]; if (f) readCsvFile(f); },
    setPendingType(key, type) { const c = dsPending.columns.find(c => c.key === key); if (c) { c.type = type; render(); } },
    cancelUpload() { dsPending = null; render(); },
    async confirmUpload() {
      const nameEl = document.getElementById('dsName');
      const name = nameEl && nameEl.value.trim() ? nameEl.value.trim() : dsPending.name;
      try {
        const saved = await window.api('POST', `/journeys/${J().id}/datasets`, {
          channel: dataTab, name, filename: dsPending.filename,
          columns: dsPending.columns, rows: dsPending.rows
        });
        dsPending = null; dsActiveId = saved.id; dsFull = null;
        window.showToast(`Saved ${saved.row_count} responses`, 'success');
        goSection('analytics');
      } catch (e) { window.showToast(e.message, 'error'); }
    },

    // ── analytics ──
    selectDataset(id) { dsActiveId = id; dsFull = null; loadAnalytics(); },
    toggleTable(k) { showTables[k] = !showTables[k]; loadAnalytics(); },
    async setColType(key, type) {
      const c = (dsFull.columns || []).find(c => c.key === key); if (!c) return;
      c.type = type;
      try { await window.api('PATCH', `/datasets/${dsFull.id}`, { columns: dsFull.columns }); loadAnalytics(); }
      catch (e) { window.showToast(e.message, 'error'); }
    },
    async setColPillar(key, pid) {
      const c = (dsFull.columns || []).find(c => c.key === key); if (!c) return;
      c.pillarId = pid;
      try { await window.api('PATCH', `/datasets/${dsFull.id}`, { columns: dsFull.columns }); }
      catch (e) { window.showToast(e.message, 'error'); }
    },
    async deleteDataset() {
      if (!dsFull || !confirm(`Delete “${dsFull.name}” and its ${dsFull.row_count} responses? This cannot be undone.`)) return;
      try {
        await window.api('DELETE', `/datasets/${dsFull.id}`);
        dsActiveId = null; dsFull = null;
        window.showToast('Dataset deleted', 'success');
        loadAnalytics();
      } catch (e) { window.showToast(e.message, 'error'); }
    },
    async runAnalysis() {
      const btn = document.getElementById('aiRunBtn');
      if (btn) { btn.disabled = true; btn.textContent = '⏳ Analysing responses…'; }
      try {
        const a = await window.api('POST', `/datasets/${dsFull.id}/analyze`);
        dsFull.analysis = a;
        window.showToast('Analysis complete', 'success');
        loadAnalytics();
      } catch (e) {
        window.showToast(e.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = '✨ Analyse responses'; }
      }
    },

    // asis findings
    fPillarChanged(pid) {
      const sel = document.getElementById('f2'); if(!sel) return;
      const p = J().pillars.find(p=>p.id===pid);
      sel.innerHTML = '<option value="">— sub-area —</option>' + (p?(p.subareas||[]).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join(''):'');
    },
    addFinding() {
      const title = val('f0'); if(!title){ window.showToast('Enter the finding','warning'); return; }
      J().asis_findings.unshift({ id:uid('f'), title, pillarId:val('f1'), subareaId:val('f2'), severity:val('f3')||'low', evidence:val('f4') });
      commit(); render();
    },
    editFinding(id, field, v) { const f = J().asis_findings.find(x=>x.id===id); if(f){ f[field]=v; window.scheduleSave(); } },
    delFinding(id) { const a=J().asis_findings; const i=a.findIndex(x=>x.id===id); if(i>-1){ a.splice(i,1); commit(); render(); } },

    // asis report
    editReport(field, v) { J().asis_report[field]=v; window.scheduleSave(); renderRail(); },
    editReportPillar(pid, v) { J().asis_report.byPillar = J().asis_report.byPillar||{}; J().asis_report.byPillar[pid]=v; window.scheduleSave(); renderRail(); },
    cycleReportStatus() { const r=J().asis_report; r.status = r.status==='complete'?'in_progress':'complete'; commit(); render(); },

    // tobe sessions
    addSession() { const name=val('f1'); if(!name){ window.showToast('Enter a session name','warning'); return; }
      J().tobe_sessions.unshift({ id:uid('s'), name, date:val('f2'), focusPillarId:val('f3'), participants:val('f4'), status:'planned', outcomes:'' }); commit(); render(); },
    editSession(id, field, v){ const s=J().tobe_sessions.find(x=>x.id===id); if(s){ s[field]=v; window.scheduleSave(); } },
    delSession(id){ const a=J().tobe_sessions; const i=a.findIndex(x=>x.id===id); if(i>-1){ a.splice(i,1); commit(); render(); } },

    // champions
    addChampion(){ const name=val('f1'); if(!name){ window.showToast('Enter a name','warning'); return; }
      J().champions.unshift({ id:uid('c'), name, role:val('f2'), area:val('f3'), stage:'identified' }); commit(); render(); },
    setStage(id, v){ const c=J().champions.find(x=>x.id===id); if(c){ c.stage=v; commit(); render(); } },
    delChampion(id){ const a=J().champions; const i=a.findIndex(x=>x.id===id); if(i>-1){ a.splice(i,1); commit(); render(); } },

    // deliverables
    addDeliverable(){ const name=val('f1'); if(!name){ window.showToast('Enter a name','warning'); return; }
      J().tobe_deliverables.unshift({ id:uid('dv'), name, type:val('f2')||'other', link:val('f3'), status:'planned' }); commit(); render(); },
    delDeliverable(id){ const a=J().tobe_deliverables; const i=a.findIndex(x=>x.id===id); if(i>-1){ a.splice(i,1); commit(); render(); } },

    // proposal
    editProposal(field, v){ J().tobe_proposal[field]=v; window.scheduleSave(); renderRail(); },
    cycleProposalStatus(){ const p=J().tobe_proposal; p.status = p.status==='complete'?'in_progress':'complete'; commit(); render(); },

    // roadmap
    addInitiative(){ const name=val('f1'); if(!name){ window.showToast('Enter an initiative name','warning'); return; }
      J().roadmap.unshift({ id:uid('i'), name, horizon:val('f2')||'H1', pillarId:val('f3'), owner:val('f4'), status:'planned', description:'' }); commit(); render(); },
    editInitiative(id, field, v){ const i=J().roadmap.find(x=>x.id===id); if(i){ i[field]=v; window.scheduleSave(); } },
    delInitiative(id){ const a=J().roadmap; const k=a.findIndex(x=>x.id===id); if(k>-1){ a.splice(k,1); commit(); render(); } }
  };

  window.NG = NG;
})();
