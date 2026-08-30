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
  const rangeStart = document.getElementById('analyticsRangeStart');
  const rangeEnd = document.getElementById('analyticsRangeEnd');
  if (picker) {
    picker.style.display = scope === 'month' ? 'inline-block' : 'none';
    if (scope === 'month' && !picker.value) picker.value = today.slice(0, 7);
  }
  if (rangeStart) rangeStart.style.display = scope === 'range' ? 'inline-block' : 'none';
  if (rangeEnd) rangeEnd.style.display = scope === 'range' ? 'inline-block' : 'none';
  if (scope === 'range') {
    if (rangeStart && !rangeStart.value) rangeStart.value = today;
    if (rangeEnd && !rangeEnd.value) rangeEnd.value = today;
  }
  loadAnalyticsV2();
}

let historyCache = null;
async function loadHistoryCache(force) {
  if (historyCache && !force) return historyCache;
  const snap = await db.collectionGroup('deliveries').get();
  // Filters out today's still-live /deliveries docs (collectionGroup also
  // matches the root collection by name) — only archived docs (which always
  // carry archiveDate) belong in Analytics.
  historyCache = snap.docs.map(d => d.data()).filter(d => !!d.archiveDate);
  return historyCache;
}

// Month/Range scope now does a REAL server-side filtered query — only the
// matching days are read — instead of the old behavior of fetching every
// archived delivery ever and filtering in JavaScript afterward (which meant
// picking "This Month" cost exactly the same reads as "All Time"). This
// needs a composite index on the deliveries collection group (field:
// archiveDate). If it's missing, Firestore throws an error in the browser
// console with a one-click "create index" link the first time this runs —
// click it, wait ~1 minute, then retry.
async function loadHistoryForScope(scope, start, end) {
  if (scope === 'month' || scope === 'range') {
    if (!start || !end) return [];
    const snap = await db.collectionGroup('deliveries')
      .where('archiveDate', '>=', start)
      .where('archiveDate', '<=', end)
      .get();
    return snap.docs.map(d => d.data());
  }
  return loadHistoryCache(); // scope === 'all' — the one expensive path left; callers must confirm first
}

async function loadAnalytics(forceRefresh) {
  const scope = document.getElementById('analyticsScope')?.value || 'all';

  // Gate the expensive full-history scan behind an explicit confirmation
  // while you're on the Spark (free) plan. Month/Range below are cheap now —
  // this is the only path left that can cost tens of thousands of reads.
  if (scope === 'all') {
    const ok = await askConfirm('This reads your ENTIRE delivery history in one query and can be a large number of Firestore reads.\n\nContinue? (Tip: "Specific Month" or "Date Range" are much cheaper and usually enough.)', {title:'Confirm Large Scan', confirmLabel:'Continue', danger:false});
    if (!ok) return;
  }

  const errBox = document.getElementById('analyticsErrorBox');
  if (errBox) errBox.style.display = 'none';

  const loadingEl = document.getElementById('analyticsLoading');
  if (loadingEl) loadingEl.style.display = 'block';
  const monthVal = document.getElementById('analyticsMonthPicker')?.value || today.slice(0, 7);
  const rangeStart = document.getElementById('analyticsRangeStart')?.value;
  const rangeEnd = document.getElementById('analyticsRangeEnd')?.value;
  const isMonth = scope === 'month';
  const isRange = scope === 'range';

  const scopeLabelEl = document.getElementById('analyticsScopeLabel');
  const periodLabel = isMonth
    ? new Date(monthVal + '-02').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : isRange
      ? `${rangeStart || '?'} → ${rangeEnd || '?'}`
      : 'All-time';
  if (scopeLabelEl) scopeLabelEl.textContent = `${periodLabel} performance, built from your daily History archives`;
  ['an_totalDelayedFlagLbl', 'an_totalEndedDelayedLbl', 'an_totalNoboxReqLbl'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const base = id === 'an_totalDelayedFlagLbl' ? 'Delay Flags' : id === 'an_totalEndedDelayedLbl' ? 'Ended Delayed' : 'No Box Requests';
    el.textContent = `${base} (${(isMonth || isRange) ? periodLabel : 'All Time'})`;
  });
  const agTitleEl = document.getElementById('analyticsAgentTitle');
  if (agTitleEl) agTitleEl.innerHTML = `Agent Performance (${(isMonth || isRange) ? periodLabel : 'All-Time'}) <span style="font-weight:400;color:var(--muted);font-size:11px">— click a row for full detail</span>`;

  try {
    let histDocs, fullHistoryForCards = null;
    if (isMonth) {
      const start = monthVal + '-01';
      const d = new Date(monthVal + '-01T00:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0);
      const end = d.toISOString().split('T')[0];
      histDocs = await loadHistoryForScope('month', start, end);
    } else if (isRange) {
      histDocs = await loadHistoryForScope('range', rangeStart, rangeEnd);
    } else {
      histDocs = await loadHistoryForScope('all');
      if (forceRefresh) { historyCache = null; histDocs = await loadHistoryForScope('all'); }
      fullHistoryForCards = histDocs;
    }

    const [custSnap, noboxSnap] = await Promise.all([
      db.collection('customers').get(),
      db.collection('nobox_requests').limit(5000).get()
    ]);

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

    if (fullHistoryForCards) applyAgentPerfToCards(fullHistoryForCards);

    analyticsLoaded = true;
  } catch (e) {
    console.error("Analytics load error:", e);
    const errBox = document.getElementById('analyticsErrorBox');
    const urlMatch = e.message && e.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
    if (urlMatch && errBox) {
      const link = urlMatch[0];
      errBox.style.display = 'block';
      errBox.innerHTML = `⚠️ <strong>Firestore Index Required</strong><br>
      This query requires a Collection Group index on <code>deliveries</code> for <code>archiveDate</code>.<br>
      <a href="${link}" target="_blank" style="display:inline-block;margin-top:8px;padding:6px 14px;background:var(--accent);color:#fff;border-radius:6px;text-decoration:none;font-weight:600">👉 Click Here to Create Index in Firebase Console</a><br>
      <span style="font-size:11px;opacity:0.8;margin-top:6px;display:block">After creating the index, wait 1–2 minutes for Firebase to build it, then click "Refresh".</span>`;
      toast('Firestore index required! Click the link banner above.', 'err');
    } else {
      if (errBox) {
        errBox.style.display = 'block';
        errBox.innerHTML = `⚠️ <strong>Analytics Load Failed</strong><br>${e.message}`;
      }
      toast('Analytics load failed: ' + e.message, 'err');
    }
  }
  if (loadingEl) loadingEl.style.display = 'none';
  loadWeeklyTrend();
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

// ── AGENT MODAL: stats + Attendance (present/absent) + recent duty activity ──
async function openAgentAnalytics(uid) {
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
      <div class="info-box">"Total Handled" counts every archived delivery ever assigned to this agent — used here as the app-usage proxy since login/session tracking isn't wired up yet.</div>

      <div style="font-size:13px;font-weight:600;margin-top:14px;margin-bottom:6px">📅 Attendance <span style="font-weight:400;color:var(--muted);font-size:11px">— based on the "On Duty" toggle, for the period selected in Analytics above</span></div>
      <div id="aaAttendance" style="font-size:12px;color:var(--muted)">Loading…</div>

      <div style="font-size:13px;font-weight:600;margin-top:14px;margin-bottom:6px">🕒 Recent Duty Activity</div>
      <div id="aaDutyLog" style="font-size:12px;color:var(--muted)">Loading…</div>
    `;
  }
  openM('agentAnalyticsModal');
  loadAgentDutyDetail(uid);
}

// Pulls this agent's full duty_logs once, then derives both the "recent
// activity" list and the present/absent attendance summary for whatever
// period is currently selected on the Analytics panel (all / month / range).
// NOTE: requires a Firestore composite index on duty_logs (agentId ASC,
// timestamp DESC) — Firestore will show a one-click "create index" link in
// the browser console the first time this query runs if it's missing.
async function loadAgentDutyDetail(uid) {
  const dutyEl = document.getElementById('aaDutyLog');
  const attEl = document.getElementById('aaAttendance');
  try {
    const snap = await db.collection('duty_logs').where('agentId', '==', uid).orderBy('timestamp', 'desc').get();
    const rows = snap.docs.map(d => d.data());

    if (dutyEl) {
      if (!rows.length) {
        dutyEl.innerHTML = '<div class="empty-state"><div class="empty-text">No duty activity logged yet</div></div>';
      } else {
        dutyEl.innerHTML = `<div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">` +
          rows.slice(0, 30).map(r => {
            const t = r.timestamp ? new Date(r.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
            const isOn = r.type === 'online';
            return `<div style="display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px">
              <span>${isOn ? '🟢 Came online' : '⚪ Went offline'}</span><span style="font-family:var(--mono);color:var(--muted)">${t}</span>
            </div>`;
          }).join('') + `</div>`;
      }
    }

    if (attEl) attEl.innerHTML = buildAttendanceHtml(rows);
  } catch (e) {
    if (dutyEl) dutyEl.innerHTML = `<div style="color:var(--red)">Could not load duty log: ${e.message}</div>`;
    if (attEl) attEl.innerHTML = `<div style="color:var(--red)">Could not load attendance: ${e.message}</div>`;
  }
}

// A calendar day counts "Present" if there's at least one "online" toggle
// logged on it. For All-time (no fixed window) this just summarizes instead
// of listing every day since inception; for Month/Range it lists each day.
function buildAttendanceHtml(dutyRows) {
  const presentDates = new Set();
  dutyRows.forEach(r => {
    if (r.type === 'online' && r.timestamp) {
      presentDates.add(new Date(r.timestamp).toISOString().split('T')[0]);
    }
  });

  const scope = document.getElementById('analyticsScope')?.value || 'all';
  const monthVal = document.getElementById('analyticsMonthPicker')?.value;
  const rangeStart = document.getElementById('analyticsRangeStart')?.value;
  const rangeEnd = document.getElementById('analyticsRangeEnd')?.value;

  let start, end;
  if (scope === 'month' && monthVal) {
    start = monthVal + '-01';
    const d = new Date(monthVal + '-01T00:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0);
    end = d.toISOString().split('T')[0];
  } else if (scope === 'range' && rangeStart && rangeEnd) {
    start = rangeStart; end = rangeEnd;
  } else {
    if (!presentDates.size) return '<div class="empty-state"><div class="empty-text">No "On Duty" activity recorded yet</div></div>';
    const sorted = [...presentDates].sort().reverse();
    return `<div style="margin-bottom:6px"><strong style="color:var(--green)">${presentDates.size}</strong> day(s) present (all-time) — most recent: ${sorted.slice(0, 10).join(', ')}${sorted.length > 10 ? ', …' : ''}</div>`;
  }

  // Cap at ~370 days so a huge range never hangs the modal
  const days = [];
  let cur = new Date(start + 'T00:00:00');
  const endD = new Date(end + 'T00:00:00');
  let guard = 0;
  while (cur <= endD && guard < 370) { days.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1); guard++; }

  const presentCount = days.filter(d => presentDates.has(d)).length;
  const rowsHtml = days.slice().reverse().map(d => {
    const isPresent = presentDates.has(d);
    return `<div style="display:flex;justify-content:space-between;padding:6px 12px;border-bottom:1px solid var(--border);font-size:12px">
      <span>${new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      <span class="badge ${isPresent ? 'badge-picked' : 'badge-delayed'}">${isPresent ? 'Present' : 'Absent'}</span>
    </div>`;
  }).join('');

  return `<div style="margin-bottom:8px"><strong style="color:var(--green)">${presentCount}</strong> of <strong>${days.length}</strong> day(s) present in this period</div>
    <div style="max-height:220px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">${rowsHtml}</div>`;
}

let weeklyChartInstance = null;

// Reads only the tiny daily summary docs (history/{date}/summary/stats), not
// every delivery — cheap regardless of how much history has piled up, and
// needs no composite index since it's an unfiltered collectionGroup fetch.
async function loadWeeklyTrend(){
  const canvas = document.getElementById('weeklyTrendChart');
  if(!canvas || typeof Chart === 'undefined') return;

  const snap = await db.collectionGroup('summary').limit(400).get().catch(()=>null);
  if(!snap || snap.empty) return;

  const byWeek = {};
  snap.forEach(doc=>{
    const d = doc.data();
    if(!d.date) return;
    const wk = mondayOf(d.date);
    if(!byWeek[wk]) byWeek[wk] = {total:0, delivered:0};
    byWeek[wk].total     += d.totalDeliveries || 0;
    byWeek[wk].delivered += d.delivered || 0;
  });

  const weeks = Object.keys(byWeek).sort().slice(-8); // last 8 weeks
  if(!weeks.length) return;

  const labels = weeks.map(w=>{
    const start = new Date(w+'T00:00:00');
    const end   = new Date(start); end.setDate(start.getDate()+6);
    return start.toLocaleDateString('en-IN',{day:'numeric',month:'short'})+'–'+end.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  });
  const rates  = weeks.map(w=> byWeek[w].total>0 ? Math.round((byWeek[w].delivered*100)/byWeek[w].total) : 0);
  const totals = weeks.map(w=> byWeek[w].total);

  const rangeEl = document.getElementById('weeklyChartRange');
  if(rangeEl) rangeEl.textContent = weeks.length>1 ? `${labels[0]} → ${labels[labels.length-1]}` : labels[0];

  if(weeklyChartInstance) weeklyChartInstance.destroy();
  weeklyChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'bar', label: 'Total Deliveries', data: totals,
          backgroundColor: 'rgba(230,81,0,.12)', borderRadius: 4,
          yAxisID: 'yTotal', order: 2
        },
        {
          type: 'line', label: 'Completion Rate %', data: rates,
          borderColor: '#16A34A', backgroundColor: 'rgba(22,163,74,.12)',
          tension: 0.35, fill: true, pointRadius: 4, pointBackgroundColor: '#16A34A',
          yAxisID: 'yRate', order: 1
        }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + c.formattedValue + (c.dataset.yAxisID==='yRate' ? '%' : '') } }
      },
      scales: {
        yTotal: { position: 'left',  beginAtZero: true, grid: { display:false }, title:{display:true,text:'Deliveries',font:{size:10}} },
        yRate:  { position: 'right', beginAtZero: true, max: 100, grid: { display:false }, ticks:{callback:v=>v+'%'}, title:{display:true,text:'Completion %',font:{size:10}} }
      }
    }
  });
}

// Monday of the week containing a YYYY-MM-DD date string
function mondayOf(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day===0 ? -6 : 1-day));
  return d.toISOString().split('T')[0];
}