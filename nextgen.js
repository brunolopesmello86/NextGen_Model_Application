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
    { key: 'asis_map',      num: '3', name: 'AS-IS Mapping', phase: 'Phase 1 · AS-IS',
      crumb: 'Phase 1 · AS-IS', title: 'AS-IS Mapping',
      sub: 'Turn collected data into findings mapped to pillars and sub-areas — the current-state picture.' },
    { key: 'asis_report',   num: '4', name: 'AS-IS Reporting', phase: 'Phase 1 · AS-IS',
      crumb: 'Phase 1 · AS-IS', title: 'AS-IS Reporting',
      sub: 'Synthesize the AS-IS mapping into an executive report, pillar by pillar.' },
    { key: 'tobe_sessions', num: '5', name: 'TO-BE Design Sessions', phase: 'Phase 2 · TO-BE',
      crumb: 'Phase 2 · TO-BE', title: 'TO-BE Design Sessions (Context-Driven Design)',
      sub: 'Co-design the target state with the client through Context-Driven Design working sessions.' },
    { key: 'champions',     num: '6', name: 'Champions', phase: 'Phase 2 · TO-BE',
      crumb: 'Phase 2 · TO-BE', title: 'Champions — Early Adopters',
      sub: 'Identify early adopters within the client and grow them into champions who drive adoption.' },
    { key: 'deliverables',  num: '7', name: 'TO-BE Deliverables', phase: 'Phase 2 · TO-BE',
      crumb: 'Phase 2 · TO-BE', title: 'TO-BE Design Deliverables',
      sub: 'The artifacts produced by the design work — process maps, playbooks, guides and more.' },
    { key: 'proposal',      num: '8', name: 'TO-BE Final Proposal', phase: 'Phase 2 · TO-BE',
      crumb: 'Phase 2 · TO-BE', title: 'TO-BE Design Final Proposal',
      sub: 'The consolidated target-state proposal presented to the client.' },
    { key: 'roadmap',       num: '9', name: 'Transformation Roadmap', phase: 'Phase 3 · Roadmap',
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
      <div class="sec-crumb">${esc(s.crumb)} · Step ${s.num} of 9</div>
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
      const subs = (p.subareas || []).map(s => `
        <div style="margin:10px 0 4px;font-weight:600;font-size:12.5px">${esc(s.name)}</div>
        <ul style="margin:0 0 6px 18px;color:var(--text-muted);font-size:12px;line-height:1.7">
          ${(s.questions || []).map(q => `<li>${esc(q)}</li>`).join('')}
        </ul>`).join('');
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
    return `<div class="panel"><div class="panel-title">Data channels</div><div style="display:flex;gap:8px;flex-wrap:wrap">${tabs}</div></div>
      <div class="panel"><div class="panel-title"><span class="badge ${badge}">${DATA_TABS.find(t=>t.k===dataTab).label}</span>Add entry</div>${form}</div>
      ${list || '<div class="empty">No entries in this channel yet.</div>'}`;
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

  const RENDERERS = {
    pillars: renderPillars, data: renderData, asis_map: renderAsisMap, asis_report: renderAsisReport,
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
