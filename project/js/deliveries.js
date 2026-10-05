// ══ DELIVERIES MANAGEMENT ══

function listenDeliveries() {
  db.collection('deliveries').where('deliveryDate', '==', today).onSnapshot(snap => {
    allDeliveries = [];
    snap.forEach(doc => { const d = doc.data(); d.id = doc.id; allDeliveries.push(d); });
    allDeliveries.sort((a, b) => (a.pickupOrder || 999) - (b.pickupOrder || 999));
    updateStats(); renderDeliveries(); renderDelayed(); renderAgentLoad(); renderSchoolLoad(); renderRecentActivity(); updateAgentTodayStats();
  }, e => toast('Listener error: ' + e.message, 'err'));
}

function updateStats() {
  const td = allDeliveries.filter(d => d.deliveryDate === today);
  const t = td.length, p = td.filter(d => d.status === 'Pending').length, k = td.filter(d => d.status === 'Picked' || d.status === 'Delivered').length, dl = td.filter(d => d.status === 'Delayed').length, nb = td.filter(d => d.status === 'NoBox').length;
  ['ov', 'dl'].forEach(px => {
    const _t = document.getElementById(px + '_total'), _p = document.getElementById(px + '_pending'), _k = document.getElementById(px + '_done'), _dl = document.getElementById(px + '_delayed');
    if (_t) _t.textContent = t; if (_p) _p.textContent = p; if (_k) _k.textContent = k; if (_dl) _dl.textContent = dl;
  });
  const _nbt = document.getElementById('ov_noboxtoday'); if (_nbt) _nbt.textContent = nb;
  const _dlnb = document.getElementById('dl_nobox'); if (_dlnb) _dlnb.textContent = nb;
  const pct = t > 0 ? Math.round((k * 100) / t) : 0;
  const progressBar = document.getElementById('progressBar');
  const progressPct = document.getElementById('progressPct');
  if (progressBar) progressBar.style.width = pct + '%';
  if (progressPct) progressPct.textContent = pct + '%';
  const rs_t = document.getElementById('rs_total'), rs_r = document.getElementById('rs_rate');
  if (rs_t) rs_t.textContent = t; if (rs_r) rs_r.textContent = pct + '%';
  const badge = document.getElementById('delayedBadge');
  if (badge) {
    if (dl > 0) {
      badge.style.display = ''; badge.textContent = dl;
      const dInfo = document.getElementById('delayedInfo'); if (dInfo) dInfo.textContent = dl + ' delayed';
      const ovSub = document.getElementById('ov_delayedSub'); if (ovSub) ovSub.textContent = 'Needs attention';
    } else {
      badge.style.display = 'none';
      const dInfo = document.getElementById('delayedInfo'); if (dInfo) dInfo.textContent = 'All clear';
      const ovSub = document.getElementById('ov_delayedSub'); if (ovSub) ovSub.textContent = 'All clear';
    }
  }
}

function renderDeliveries() {
  const q = (document.getElementById('searchQ')?.value || '').toLowerCase();
  const agF = document.getElementById('agentFilter')?.value || '';
  const rows = allDeliveries.filter(d => {
    const ms = !q || (d.customerName || '').toLowerCase().includes(q) || (d.customerPhone || '').includes(q) || (d.boxId || '').toLowerCase().includes(q);
    const mf = curFilter === 'ALL' || (curFilter === 'DONE' ? (d.status === 'Picked' || d.status === 'Delivered') : d.status === curFilter);
    const ma = !agF || d.assignedTo === agF;
    const md = q ? true : (d.deliveryDate === today);
    return ms && mf && ma && md;
  });
  const body = document.getElementById('deliveryBody');
  if (!body) return;
  if (!rows.length) { body.innerHTML = '<tr><td colspan="9" class="empty-state"><div class="empty-icon">📦</div><div class="empty-text">No deliveries found.</div></td></tr>'; return; }
  body.innerHTML = rows.map((d, i) => {
    const ag = agents[d.assignedTo]?.name || '— Unassigned —';
    const cls = { Pending: 'badge-pending', Picked: 'badge-picked', Delayed: 'badge-delayed', Delivered: 'badge-delivered' }[d.status] || 'badge-pending';
    const isDel = d.status === 'Delayed', isUna = !d.assignedTo;
    const opts = Object.entries(agents).filter(([uid]) => uid !== d.assignedTo).map(([uid, a]) => `<option value="${uid}">${a.name}</option>`).join('');
    let act = '<span style="color:var(--muted)">—</span>';
    if (isDel || isUna) act = `<div class="rea-wrap"><select class="rea-sel" id="rs_${d.id}"><option value="">${isUna ? 'Pick agent' : 'Pick agent'}</option>${opts}</select><button class="rea-btn" onclick="doReassign_d('${d.id}','${escQ(d.customerName)}')">${isUna ? 'Assign' : 'Reassign'}</button></div>`;
    let orderCell;
    if (agF && d.assignedTo === agF) {
      orderCell = `<input type="number" min="1" value="${d.pickupOrder || i + 1}" id="ord_${d.id}" style="width:52px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;font-family:var(--mono);font-size:12px;background:var(--bg);color:var(--text)">`;
    } else {
      orderCell = '#' + (d.pickupOrder || '—');
    }
    const boxCell = `<span style="background:var(--accentbg);border:1px solid var(--accent);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;color:var(--accent);font-family:var(--mono)">${d.boxId || '—'}</span>`;
    const delayedTag = (d.wasDelayed && d.status !== 'Delayed') ? '<span class="badge badge-delayed" style="margin-left:5px" title="This delivery was marked Delayed earlier today">⚠ Was Delayed</span>' : '';
    return `<tr class="${isDel ? 'row-delayed' : ''}"><td style="color:var(--muted);font-family:var(--mono);font-size:11px">${i + 1}</td><td>${boxCell}</td><td><strong>${d.customerName || '—'}</strong></td><td style="color:var(--muted);font-size:12px">${d.pickupLocation || '—'}</td><td style="color:var(--muted);font-size:12px">${d.deliveryAddress || '—'}</td><td style="${isUna ? 'color:var(--red)' : ''}">${ag}</td><td style="font-family:var(--mono);font-size:12px;color:var(--muted);white-space:nowrap">${orderCell}</td><td><span class="badge ${cls}">${d.status || '?'}</span>${delayedTag}</td><td>${act}</td></tr>`;
  }).join('');
}

function renderDelayed() {
  const dl = allDeliveries.filter(d => d.status === 'Delayed' && d.deliveryDate === today);
  const body = document.getElementById('delayedBody');
  if (!body) return;
  if (!dl.length) { body.innerHTML = '<tr><td colspan="7" class="empty-state"><div class="empty-icon">✅</div><div class="empty-text">No delayed deliveries!</div></td></tr>'; return; }
  body.innerHTML = dl.map((d, i) => {
    const ag = agents[d.assignedTo]?.name || '— Unknown —';
    const opts = Object.entries(agents).filter(([uid]) => uid !== d.assignedTo).map(([uid, a]) => `<option value="${uid}">${a.name}</option>`).join('');
    const boxCell = `<span style="background:var(--accentbg);border:1px solid var(--accent);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;color:var(--accent);font-family:var(--mono)">${d.boxId || '—'}</span>`;
    return `<tr class="row-delayed"><td style="color:var(--red);font-weight:700">${i + 1}</td><td>${boxCell}</td><td><strong>${d.customerName || '—'}</strong></td><td style="font-family:var(--mono);font-size:12px;color:var(--blue)">${d.customerPhone || '—'}</td><td>${ag}</td><td style="font-size:12px;color:var(--muted)">${d.pickupLocation || '—'}</td><td><div class="rea-wrap"><select class="rea-sel" id="drs_${d.id}"><option value="">Pick agent</option>${opts}</select><button class="rea-btn" onclick="doReassign_dl('${d.id}','${escQ(d.customerName)}')">Reassign</button></div></td></tr>`;
  }).join('');
}

function renderAgentLoad() {
  const map = {};
  allDeliveries.filter(d => d.deliveryDate === today).forEach(d => {
    if (!map[d.assignedTo]) map[d.assignedTo] = { p: 0, k: 0, dl: 0 };
    if (d.status === 'Pending') map[d.assignedTo].p++;
    else if (d.status === 'Picked' || d.status === 'Delivered') map[d.assignedTo].k++;
    else if (d.status === 'Delayed') map[d.assignedTo].dl++;
  });
  const grid = document.getElementById('agentLoadGrid');
  if (!grid) return;
  const entries = Object.entries(map);
  if (!entries.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-text">No deliveries today yet</div></div>'; return; }
  grid.innerHTML = entries.map(([uid, c]) => {
    const nm = agents[uid]?.name || 'Unknown';
    const ini = nm.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    return `<div class="agent-mini-card" onclick="openAgentDeliveries('${uid}')" title="View ${escQ(nm)}'s deliveries">
      <div class="agent-mini-av">${ini}</div>
      <div class="agent-mini-name">${nm}</div>
      <div class="agent-mini-stats">
        <span class="p">${c.p}P</span><span class="k">${c.k}D</span>${c.dl > 0 ? `<span class="dl">${c.dl}L</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderSchoolLoad() {
  // Normalize: lowercase, strip the word "school", trim → use as grouping key.
  // "westberry school", "Westberry School", "westberry" all map to key "westberry".
  function schoolKey(addr) {
    return (addr || 'unknown').toLowerCase().replace(/\bschool\b/gi, '').trim();
  }
  // Build a nice display label: Title Case + " School" suffix
  function schoolLabel(key) {
    if (!key) return 'Unknown School';
    const titled = key.replace(/\b\w/g, c => c.toUpperCase());
    return titled + ' School';
  }

  const map = {}; // key → { label, p, k, dl }
  allDeliveries.filter(d => d.deliveryDate === today).forEach(d => {
    const raw = (d.deliveryAddress || '').trim();
    const key = schoolKey(raw) || 'unknown';
    if (!map[key]) map[key] = { label: schoolLabel(key), p: 0, k: 0, dl: 0 };
    if (d.status === 'Pending') map[key].p++;
    else if (d.status === 'Picked' || d.status === 'Delivered') map[key].k++;
    else if (d.status === 'Delayed') map[key].dl++;
  });
  const grid = document.getElementById('schoolLoadGrid');
  if (!grid) return;
  const entries = Object.values(map);
  if (!entries.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-text">No deliveries today yet</div></div>'; return; }
  grid.innerHTML = entries.map(c => {
    const ini = c.label.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    return `<div class="agent-mini-card" title="${escQ(c.label)}">
      <div class="agent-mini-av">${ini}</div>
      <div class="agent-mini-name">${c.label}</div>
      <div class="agent-mini-stats">
        <span class="p">${c.p}P</span><span class="k">${c.k}D</span>${c.dl > 0 ? `<span class="dl">${c.dl}L</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function openAgentDeliveries(uid) {
  goToFiltered('ALL');
  const agF = document.getElementById('agentFilter');
  if (agF) agF.value = uid;
  renderDeliveries();
}

function renderRecentActivity() {
  const sorted = [...allDeliveries].filter(d => d.deliveryDate === today).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 5);
  const icons = { Pending: '🕐', Picked: '✅', Delayed: '⚠️', Delivered: '📦' };
  const colors = { Pending: 'var(--amber)', Picked: 'var(--green)', Delayed: 'var(--red)', Delivered: 'var(--blue)' };
  const recEl = document.getElementById('recentActivity');
  if (!recEl) return;
  recEl.innerHTML = sorted.length
    ? sorted.map(d => `<div style="display:flex;align-items:center;gap:10px;padding:8px 16px;border-bottom:1px solid var(--border)"><span style="font-size:14px">${icons[d.status] || '📋'}</span><div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.customerName || '—'}</div><div style="font-size:11px;color:var(--muted)">${agents[d.assignedTo]?.name || 'Unassigned'}</div></div><span style="font-size:11px;font-weight:600;color:${colors[d.status] || 'var(--muted)'}">${d.status}</span></div>`).join('')
    : '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">No updates today yet</div></div>';
}

function applyDeliveryFilter(status) {
  curFilter = status;
  document.querySelectorAll('#panel-deliveries .f-btn[data-status]').forEach(b => {
    b.classList.remove('on'); b.classList.add('off');
    if (b.dataset.status === status) { b.classList.remove('off'); b.classList.add('on'); }
  });
  document.querySelectorAll('#panel-deliveries .stat-card.clickable').forEach(c => c.classList.remove('active-stat'));
  const activeCard = document.getElementById('dlcard_' + status);
  if (activeCard) activeCard.classList.add('active-stat');
  renderDeliveries();
}

function goToFiltered(status) {
  nav('deliveries', document.getElementById('navItemDeliveries'));
  applyDeliveryFilter(status);
  const panel = document.getElementById('panel-deliveries');
  if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function doReassign_d(id, nm) { const s = document.getElementById('rs_' + id); if (!s || !s.value) { toast('Select an agent first', 'err'); return; } _doReassign(id, s.value, nm); }
function doReassign_dl(id, nm) { const s = document.getElementById('drs_' + id); if (!s || !s.value) { toast('Select an agent first', 'err'); return; } _doReassign(id, s.value, nm); }
function _doReassign(id, uid, nm) {
  const ag = agents[uid];
  db.collection('deliveries').doc(id).update({ assignedTo: uid, assignedName: ag?.name || '', status: 'Pending' })
    .then(() => toast('Reassigned to ' + (ag?.name || 'agent'), 'ok'))
    .catch(e => toast('Reassign failed: ' + e.message, 'err'));
}

function getAgentRoute(agentUid) {
  return allDeliveries.filter(d => d.assignedTo === agentUid && d.deliveryDate === today)
    .sort((a, b) => (a.pickupOrder || 9999) - (b.pickupOrder || 9999));
}

async function saveRouteOrder() {
  const agF = document.getElementById('agentFilter')?.value || '';
  if (!agF) { toast('Select an agent first to edit their route order', 'err'); return; }
  const route = getAgentRoute(agF);
  if (!route.length) { toast('No deliveries for this agent today', 'err'); return; }
  const entries = route.map((d, i) => {
    const inp = document.getElementById('ord_' + d.id);
    const val = (inp && inp.value !== '') ? parseFloat(inp.value) : (d.pickupOrder || i + 1);
    return { id: d.id, val, origIndex: i, customerId: d.customerId || null };
  });
  entries.sort((a, b) => a.val - b.val || a.origIndex - b.origIndex);
  try {
    let batch = db.batch(), ops = 0;
    for (let i = 0; i < entries.length; i++) {
      batch.update(db.collection('deliveries').doc(entries[i].id), { pickupOrder: i + 1 });
      ops++;
      if (entries[i].customerId) {
        batch.set(db.collection('customers').doc(entries[i].customerId), { routeOrder: i + 1 }, { merge: true });
        ops++;
      }
      if (ops >= 480) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();
    toast('Route order saved — will repeat tomorrow too', 'ok');
  } catch (e) { toast('Save failed: ' + e.message, 'err'); }
}

function addDelivery() {
  const n = gv('dN'), ph = gv('dPh'), pk = gv('dPk'), ad = gv('dAd'), ag = gv('dAg'), no = gv('dNo'), bx = gv('dBx').toUpperCase();
  const it = parseInt(document.getElementById('dIt').value) || 1;
  if (!n || !pk || !ad) { toast('Name, pickup and delivery address required', 'err'); return; }
  if (!ag) { toast('Select an agent', 'err'); return; }
  const order = allDeliveries.filter(d => d.assignedTo === ag && d.deliveryDate === today).length + 1;
  db.collection('deliveries').add({
    customerName: n, customerPhone: ph, boxId: bx, pickupLocation: pk, deliveryAddress: ad,
    assignedTo: ag, assignedName: agents[ag]?.name || '', agentPhone: agents[ag]?.phone || '', status: 'Pending',
    itemCount: it, notes: no, pickupOrder: order, deliveryDate: today, timestamp: Date.now()
  }).then(() => { closeM('addDeliveryModal'); toast('Delivery added!', 'ok'); ['dN', 'dPh', 'dPk', 'dAd', 'dNo', 'dBx'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); })
    .catch(e => toast('Error: ' + e.message, 'err'));
}

async function markAllDelivered() {
  const count = allDeliveries.filter(d =>
    d.deliveryDate === today && d.status !== 'Delivered'
  ).length;

  const btn = document.getElementById('btnMarkAllDelivered');
  if (btn) btn.disabled = true;

  const ok = await askConfirm('This updates all customer dashboards instantly.', {title:`Mark all ${count} remaining deliveries as Delivered?`, confirmLabel:'Mark Delivered'});
  if (!ok) { if (btn) btn.disabled = false; return; }

  if (btn) btn.textContent = 'Updating...';

  try {
    let batch = db.batch();
    let ops = 0;

    for (const d of allDeliveries) {
      if (d.deliveryDate === today && d.status !== 'Delivered') {
        batch.update(db.collection('deliveries').doc(d.id), {
          status: 'Delivered',
          timestamp: Date.now(),
          deliveredAt: Date.now()
        });
        ops++;
        if (ops >= 490) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }
    }
    if (ops > 0) await batch.commit();

    toast('All deliveries marked as Delivered! Customers can see it now.', 'ok');
  } catch (e) {
    toast('Error: ' + e.message, 'err');
  }

  if (btn) { btn.disabled = false; btn.textContent = '✅ Mark All Delivered'; }
}
