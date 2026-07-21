// ══ CUSTOMER & AGENT ANALYTICS ══

function analyticsTab(which, btn) {
  document.querySelectorAll('#panel-analytics .f-btn').forEach(b => { b.classList.remove('on'); b.classList.add('off'); });
  btn.classList.add('on'); btn.classList.remove('off');
  const custView = document.getElementById('analyticsCustomersView');
  const agView = document.getElementById('analyticsAgentsView');
  if (custView) custView.style.display = which === 'customers' ? 'block' : 'none';
  if (agView) agView.style.display = which === 'agents' ? 'block' : 'none';
}

function onAnalyticsScopeChange() {
  const scope = document.getElementById('analyticsScope')?.value;
  const picker = document.getElementById('analyticsMonthPicker');
  if (picker) {
    picker.style.display = scope === 'month' ? 'inline-block' : 'none';
    if (scope === 'month' && !picker.value) picker.value = today.slice(0, 7);
  }
  loadAnalytics();
}

let historyCache = null;
async function loadHistoryCache(force) {
  if (historyCache && !force) return historyCache;
  const snap = await db.collectionGroup('deliveries').get();
  historyCache = snap.docs.map(d => d.data());
  return historyCache;
}

async function loadAnalytics(forceRefresh) {
  const loadingEl = document.getElementById('analyticsLoading');
  if (loadingEl) loadingEl.style.display = 'block';
  const scope = document.getElementById('analyticsScope')?.value || 'all';
  const monthVal = document.getElementById('analyticsMonthPicker')?.value || today.slice(0, 7);
  const isMonth = scope === 'month';

  const scopeLabelEl = document.getElementById('analyticsScopeLabel');
  const periodLabel = isMonth
    ? new Date(monthVal + '-02').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : 'All-time';
  if (scopeLabelEl) scopeLabelEl.textContent = `${periodLabel} performance, built from your daily History archives`;
  ['an_totalDelayedFlagLbl', 'an_totalEndedDelayedLbl', 'an_totalNoboxReqLbl'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const base = id === 'an_totalDelayedFlagLbl' ? 'Delay Flags' : id === 'an_totalEndedDelayedLbl' ? 'Ended Delayed' : 'No Box Requests';
    el.textContent = `${base} (${isMonth ? periodLabel : 'All Time'})`;
  });
  const agTitleEl = document.getElementById('analyticsAgentTitle');
  if (agTitleEl) agTitleEl.innerHTML = `Agent Performance (${isMonth ? periodLabel : 'All-Time'}) <span style="font-weight:400;color:var(--muted);font-size:11px">— click a row for full detail</span>`;

  try {
    const [custSnap, noboxSnap, fullHistory] = await Promise.all([
      db.collection('customers').get(),
      db.collection('nobox_requests').get(),
      loadHistoryCache(forceRefresh)
    ]);
    const histDocs = isMonth ? fullHistory.filter(d => (d.archiveDate || '').slice(0, 7) === monthVal) : fullHistory;

    const custMap = {};
    custSnap.forEach(doc => {
      const d = doc.data();
      custMap[doc.id] = {
        id: doc.id, name: d.name || '—', boxId: d.boxId || '—', zone: d.zone || '—',
        phone: d.phone || '', active: d.active !== false,
        total: 0, delivered: 0, noboxAgent: 0, delayedFlag: 0, endedDelayed: 0,
        noboxReqTotal: 0, noboxReqYesterday: 0
      };
    });

    noboxSnap.forEach(doc => {
      const d = doc.data();
      const c = custMap[d.customerId];
      if (!c) return;
      c.noboxReqTotal++;
      if (d.date === yesterday) c.noboxReqYesterday++;
    });

    const agentMap = {};
    histDocs.forEach(d => {
      const c = custMap[d.customerId];
      if (c) {
        c.total++;
        if (d.status === 'NoBox') c.noboxAgent++;
        if (d.wasDelayed) c.delayedFlag++;
        if (d.status === 'Delayed') c.endedDelayed++;
        if (d.status === 'Delivered' || d.status === 'Picked') c.delivered++;
      }
      const auid = d.assignedTo;
      if (auid) {
        if (!agentMap[auid]) agentMap[auid] = { total: 0, delivered: 0, delayedEnded: 0, delayedFlag: 0, noBoxAgent: 0 };
        const a = agentMap[auid];
        a.total++;
        if (d.status === 'Delivered' || d.status === 'Picked') a.delivered++;
        if (d.status === 'Delayed') a.delayedEnded++;
        if (d.wasDelayed) a.delayedFlag++;
        if (d.status === 'NoBox') a.noBoxAgent++;
      }
    });

    analyticsCustomers = Object.values(custMap).sort((a, b) => (b.delayedFlag + b.noboxAgent) - (a.delayedFlag + a.noboxAgent));
    analyticsAgents = Object.entries(agentMap).map(([uid, a]) => ({
      uid, name: agents[uid]?.name || 'Unknown', zone: agents[uid]?.zone || '—', email: agents[uid]?.email || '', ...a
    })).sort((a, b) => b.total - a.total);

    const totDelayFlag = analyticsCustomers.reduce((s, c) => s + c.delayedFlag, 0);
    const totEndedDelayed = analyticsCustomers.reduce((s, c) => s + c.endedDelayed, 0);
    const totNoboxReq = analyticsCustomers.reduce((s, c) => s + c.noboxReqTotal, 0);
    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setTxt('an_totalCust', analyticsCustomers.length);
    setTxt('an_totalDelayedFlag', totDelayFlag);
    setTxt('an_totalEndedDelayed', totEndedDelayed);
    setTxt('an_totalNoboxReq', totNoboxReq);

    drawAnalyticsCustomerTable();
    drawAnalyticsAgentTable();

    if (!isMonth) applyAgentPerfToCards(fullHistory);

    analyticsLoaded = true;
  } catch (e) {
    toast('Analytics load failed: ' + e.message, 'err');
  }
  if (loadingEl) loadingEl.style.display = 'none';
}

function drawAnalyticsCustomerTable() {
  const q = (document.getElementById('analyticsCustSearch')?.value || '').toLowerCase();
  const rows = analyticsCustomers.filter(c => !q || c.name.toLowerCase().includes(q) || c.boxId.toLowerCase().includes(q) || c.zone.toLowerCase().includes(q));
  const body = document.getElementById('analyticsCustomerBody');
  if (!body) return;
  body.innerHTML = rows.length ? rows.map((c, i) => `
    <tr onclick="openCustomerAnalytics('${c.id}')" style="cursor:pointer">
      <td style="color:var(--muted)">${i + 1}</td>
      <td><span style="background:var(--accentbg);border:1px solid var(--accent);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;color:var(--accent);font-family:var(--mono)">${c.boxId}</span></td>
      <td><strong>${c.name}</strong>${c.active ? '' : ' <span style="color:var(--muted);font-size:10px">(paused)</span>'}</td>
      <td style="font-size:12px"><span style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:2px 7px">${c.zone}</span></td>
      <td style="text-align:center;font-family:var(--mono)">${c.total}</td>
      <td style="text-align:center;font-family:var(--mono);color:var(--purple)">${c.noboxAgent}</td>
      <td style="text-align:center;font-family:var(--mono);color:var(--amber)">${c.delayedFlag}</td>
      <td style="text-align:center;font-family:var(--mono);color:var(--red)">${c.endedDelayed}</td>
      <td style="text-align:center;font-family:var(--mono);color:var(--teal)">${c.noboxReqTotal}${c.noboxReqYesterday ? ` <span class="badge badge-nobox" title="Informed no-box for yesterday (${yesterday})">${c.noboxReqYesterday} yest.</span>` : ''}</td>
    </tr>`).join('')
    : '<tr><td colspan="9" class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">No customer history yet.</div></td></tr>';
}

function drawAnalyticsAgentTable() {
  const body = document.getElementById('analyticsAgentBody');
  if (!body) return;
  body.innerHTML = analyticsAgents.length ? analyticsAgents.map((a, i) => {
    const rate = a.total > 0 ? Math.round((a.delivered * 100) / a.total) : 0;
    return `<tr onclick="openAgentAnalytics('${a.uid}')" style="cursor:pointer">
      <td style="color:var(--muted)">${i + 1}</td>
      <td><strong>${a.name}</strong></td>
      <td style="font-size:12px"><span style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:2px 7px">${a.zone}</span></td>
      <td style="text-align:center;font-family:var(--mono)">${a.total}</td>
      <td style="text-align:center;font-family:var(--mono);color:var(--green)">${a.delivered}</td>
      <td style="text-align:center;font-family:var(--mono);color:var(--red)">${a.delayedEnded}</td>
      <td style="text-align:center;font-family:var(--mono);color:var(--accent)">${rate}%</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="empty-state"><div class="empty-icon">👤</div><div class="empty-text">No agent activity yet.</div></td></tr>';
}

function openCustomerAnalytics(id) {
  const c = analyticsCustomers.find(x => x.id === id);
  if (!c) { toast('No history found for this customer yet', 'err'); return; }
  const titleEl = document.getElementById('caTitle'); if (titleEl) titleEl.textContent = c.name + ' — ' + c.boxId;
  const bodyEl = document.getElementById('caBody');
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="ag-stats" style="grid-template-columns:repeat(2,1fr);margin-bottom:10px">
        <div class="ag-stat"><div class="num">${c.total}</div><div class="lbl">Total Deliveries</div></div>
        <div class="ag-stat"><div class="num" style="color:var(--green)">${c.delivered}</div><div class="lbl">Completed</div></div>
        <div class="ag-stat"><div class="num" style="color:var(--purple)">${c.noboxAgent}</div><div class="lbl">No Box (Agent Reported)</div></div>
        <div class="ag-stat"><div class="num" style="color:var(--teal)">${c.noboxReqTotal}</div><div class="lbl">No Box Requests (Self)</div></div>
        <div class="ag-stat"><div class="num" style="color:var(--amber)">${c.delayedFlag}</div><div class="lbl">Times Delayed</div></div>
        <div class="ag-stat"><div class="num" style="color:var(--red)">${c.endedDelayed}</div><div class="lbl">Ended Delayed (Never Picked)</div></div>
      </div>
      ${c.noboxReqYesterday > 0
        ? `<div class="info-box purple">📦 Informed No Box for yesterday (${yesterday}) — ${c.noboxReqYesterday} request(s), counted separately from their all-time total above.</div>`
        : `<div class="info-box teal">No no-box request logged for yesterday (${yesterday}).</div>`}
      <div style="font-size:12px;color:var(--muted);margin-top:10px">Zone: ${c.zone} · Phone: ${c.phone || '—'}</div>
    `;
  }
  openM('customerAnalyticsModal');
}

function openAgentAnalytics(uid) {
  const a = analyticsAgents.find(x => x.uid === uid);
  if (!a) { toast('No history found for this agent yet', 'err'); return; }
  const rate = a.total > 0 ? Math.round((a.delivered * 100) / a.total) : 0;
  const titleEl = document.getElementById('aaTitle'); if (titleEl) titleEl.textContent = a.name;
  const bodyEl = document.getElementById('aaBody');
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="ag-stats" style="grid-template-columns:repeat(2,1fr);margin-bottom:10px">
        <div class="ag-stat"><div class="num">${a.total}</div><div class="lbl">Total Handled</div></div>
        <div class="ag-stat"><div class="num" style="color:var(--green)">${a.delivered}</div><div class="lbl">Completed</div></div>
        <div class="ag-stat"><div class="num" style="color:var(--red)">${a.delayedEnded}</div><div class="lbl">Ended Delayed</div></div>
        <div class="ag-stat"><div class="num" style="color:var(--amber)">${a.delayedFlag}</div><div class="lbl">Times Delayed</div></div>
        <div class="ag-stat"><div class="num" style="color:var(--purple)">${a.noBoxAgent}</div><div class="lbl">No Box Marked</div></div>
        <div class="ag-stat"><div class="num" style="color:var(--accent)">${rate}%</div><div class="lbl">Completion Rate</div></div>
      </div>
      <div class="info-box">"Total Handled" counts every archived delivery ever assigned to this agent — used here as the app-usage proxy since login/session tracking isn't wired up yet. That's a good next step once you're on Blaze.</div>
    `;
  }
  openM('agentAnalyticsModal');
}
