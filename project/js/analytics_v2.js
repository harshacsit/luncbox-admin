// ══ ANALYTICS (SUPABASE-BACKED) ══
// Uses the same `sb` client already created in history_v2.js

async function fetchArchivedDeliveriesFromSupabase(startDate, endDate, scope) {
  let allRows = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = sb.from('archived_deliveries').select('*');
    if (scope !== 'all') {
      query = query.gte('archive_date', startDate).lte('archive_date', endDate);
    }
    const { data, error } = await query
      .order('archive_date', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);

    if (data && data.length > 0) {
      allRows.push(...data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    } else {
      hasMore = false;
    }
  }
  return allRows;
}

async function loadAnalyticsV2(forceRefresh) {
  const loadingEl = document.getElementById('analyticsLoading');
  if (loadingEl) loadingEl.style.display = 'block';

  const scope = document.getElementById('analyticsScope')?.value || 'all';
  const monthVal = document.getElementById('analyticsMonthPicker')?.value || today.slice(0, 7);
  const rangeStart = document.getElementById('analyticsRangeStart')?.value;
  const rangeEnd = document.getElementById('analyticsRangeEnd')?.value;
  const isMonth = scope === 'month';
  const isRange = scope === 'range';

  // Build date range for the query
  let startDate = '2020-01-01'; // Default for All-time
  let endDate = today;
  if (isMonth) {
    startDate = monthVal + '-01';
    const [y, m] = monthVal.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    endDate = `${monthVal}-${String(lastDay).padStart(2, '0')}`;
  } else if (isRange) {
    startDate = rangeStart || today;
    endDate = rangeEnd || today;
  }

  const scopeLabelEl = document.getElementById('analyticsScopeLabel');
  const periodLabel = isMonth
    ? new Date(monthVal + '-02').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : isRange
      ? `${startDate} → ${endDate}`
      : 'All-time performance';
  if (scopeLabelEl) scopeLabelEl.textContent = `${periodLabel} performance, from Supabase archive`;

  ['an_totalDelayedFlagLbl', 'an_totalEndedDelayedLbl', 'an_totalNoboxReqLbl'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const base = id === 'an_totalDelayedFlagLbl' ? 'Delay Flags' : id === 'an_totalEndedDelayedLbl' ? 'Ended Delayed' : 'No Box Requests';
    el.textContent = `${base} (${(isMonth || isRange) ? periodLabel : 'All Time'})`;
  });
  const agTitleEl = document.getElementById('analyticsAgentTitle');
  if (agTitleEl) agTitleEl.innerHTML = `Agent Performance (${(isMonth || isRange) ? periodLabel : 'All-Time'}) <span style="font-weight:400;color:var(--muted);font-size:11px">— click a row for full detail</span>`;

  try {
    // Pull customers (from Firestore master list), nobox requests, archived deliveries (Supabase), and active live deliveries (Firestore)
    const [custSnap, noboxSnap, archivedRows, liveSnap] = await Promise.all([
      db.collection('customers').get(),
      db.collection('nobox_requests').get(),
      fetchArchivedDeliveriesFromSupabase(startDate, endDate, scope),
      db.collection('deliveries').get().catch(() => ({ docs: [] }))
    ]);

    const histDocs = [...archivedRows];
    if (liveSnap && liveSnap.docs) {
      liveSnap.docs.forEach(doc => {
        const d = doc.data();
        const delDate = d.deliveryDate || today;
        if (scope === 'all' || (delDate >= startDate && delDate <= endDate)) {
          histDocs.push({
            customer_id: d.customerId || doc.id,
            customer_name: d.customerName || '',
            customer_phone: d.customerPhone || '',
            box_id: d.boxId || '',
            assigned_to: d.assignedTo || '',
            status: d.status || 'Pending',
            was_delayed: !!d.wasDelayed,
            archive_date: delDate
          });
        }
      });
    }

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
      const c = custMap[d.customer_id];
      if (c) {
        c.total++;
        if (d.status === 'NoBox') c.noboxAgent++;
        if (d.was_delayed) c.delayedFlag++;
        if (d.status === 'Delayed') c.endedDelayed++;
        if (d.status === 'Delivered' || d.status === 'Picked') c.delivered++;
      }
      const auid = d.assigned_to;
      if (auid) {
        if (!agentMap[auid]) agentMap[auid] = { total: 0, delivered: 0, delayedEnded: 0, delayedFlag: 0, noBoxAgent: 0 };
        const a = agentMap[auid];
        a.total++;
        if (d.status === 'Delivered' || d.status === 'Picked') a.delivered++;
        if (d.status === 'Delayed') a.delayedEnded++;
        if (d.was_delayed) a.delayedFlag++;
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
    await loadWeeklyTrendV2();

    analyticsLoaded = true;
  } catch (e) {
    console.error("Analytics load failed:", e);
    toast('Analytics load failed: ' + e.message, 'err');
  }
  if (loadingEl) loadingEl.style.display = 'none';
}

async function loadWeeklyTrendV2() {
  const canvas = document.getElementById('weeklyTrendChart');
  if (!canvas || typeof Chart === 'undefined') return;

  const { data: rows, error } = await sb
    .from('archived_deliveries')
    .select('archive_date, status')
    .limit(5000);

  if (error) {
    console.error("Weekly trend query failed:", error);
    return;
  }

  if (!rows || !rows.length) return;

  const byDate = {};
  rows.forEach(r => {
    const date = r.archive_date;
    if (!date) return;
    if (!byDate[date]) byDate[date] = { total: 0, delivered: 0 };
    byDate[date].total++;
    if (r.status === 'Delivered' || r.status === 'Picked') {
      byDate[date].delivered++;
    }
  });

  const mondayOf = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return d.toISOString().split('T')[0];
  };

  const byWeek = {};
  Object.entries(byDate).forEach(([date, stats]) => {
    const wk = mondayOf(date);
    if (!byWeek[wk]) byWeek[wk] = { total: 0, delivered: 0 };
    byWeek[wk].total += stats.total;
    byWeek[wk].delivered += stats.delivered;
  });

  const weeks = Object.keys(byWeek).sort().slice(-8); // last 8 weeks
  if (!weeks.length) return;

  const labels = weeks.map(w => {
    const start = new Date(w + 'T00:00:00');
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + '–' + end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  });
  const rates = weeks.map(w => byWeek[w].total > 0 ? Math.round((byWeek[w].delivered * 100) / byWeek[w].total) : 0);
  const totals = weeks.map(w => byWeek[w].total);

  const rangeEl = document.getElementById('weeklyChartRange');
  if (rangeEl) rangeEl.textContent = weeks.length > 1 ? `${labels[0]} → ${labels[labels.length - 1]}` : labels[0];

  if (typeof weeklyChartInstance !== 'undefined' && weeklyChartInstance) {
    weeklyChartInstance.destroy();
  }
  
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
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + c.formattedValue + (c.dataset.yAxisID === 'yRate' ? '%' : '') } }
      },
      scales: {
        yTotal: { position: 'left', beginAtZero: true, grid: { display: false }, title: { display: true, text: 'Deliveries', font: { size: 10 } } },
        yRate: { position: 'right', beginAtZero: true, max: 100, grid: { display: false }, ticks: { callback: v => v + '%' }, title: { display: true, text: 'Completion %', font: { size: 10 } } }
      }
    }
  });
}

// Global fallback alias
window.loadAnalytics = loadAnalyticsV2;