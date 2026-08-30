// ══ ROUTE AUTO ASSIGNMENT ══

async function previewAssign() {
  if (!Object.keys(agents).length) { toast('No agents found', 'err'); return; }
  try {
    const snap = await db.collection('customers').get();
    const customers = []; snap.forEach(doc => { const d = doc.data(); if (d.active !== false) customers.push({ id: doc.id, ...d }); });
    if (!customers.length) { toast('No customers found', 'err'); return; }
    const agList = Object.entries(agents).map(([uid, d]) => ({ uid, name: d.name, zone: d.zone || '', maxDeliveries: d.maxDeliveries || 999 }));
    const result = _assignCustomers(customers, agList);
    const assignPreviewEl = document.getElementById('assignPreview');
    if (assignPreviewEl) {
      assignPreviewEl.innerHTML = Object.entries(result).map(([uid, custs]) => `<div class="assign-agent-card"><div class="assign-agent-name">${agents[uid]?.name || uid}</div><div class="assign-count" style="color:var(--green);font-weight:600">${custs.length} deliveries</div><div style="margin-top:6px;font-size:11px;color:var(--muted)">${custs.slice(0, 4).map(c => c.name).join(', ')}${custs.length > 4 ? ` +${custs.length - 4} more` : ''}</div></div>`).join('');
    }
    toast('Preview ready', 'info');
  } catch (e) { toast('Preview failed: ' + e.message, 'err'); }
}

async function runAssign(auto) {
  if (auto) return; // All automatic assignments have been stopped
  if (!Object.keys(agents).length) { toast('No agents found', 'err'); return; }
  const btn = document.querySelector('#panel-assign .topbar-btn.green-btn');
  if (btn) btn.disabled = true;

  // ── DELIVERY HOURS GUARD ── (10:30 AM – 1:00 PM)
  const _now = new Date();
  const hour = _now.getHours(), min = _now.getMinutes();
  const isDuringDeliveries = (hour === 10 && min >= 30) || hour === 11 || hour === 12;
  if (isDuringDeliveries) {
    const nowStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const proceed = await askConfirm(
      `⚠️ It is currently ${nowStr} — agents may already be delivering.\n\nRunning Assign mid-delivery will create duplicate routes or overwrite active deliveries.\n\nAre you SURE you want to assign routes right now?`,
      { title: '⛔ Deliveries Are In Progress!', confirmLabel: 'Yes, I understand the risk', danger: true }
    );
    if (!proceed) { if (btn) btn.disabled = false; return; }
  }

  // ── SECOND CONFIRMATION ── (always required)
  if (!(await askConfirm(
    `This will assign today's deliveries to all agents.\n\nAgents will immediately see their routes on the app.\n\nProceed?`,
    { title: 'Confirm: Assign Today\'s Routes?', confirmLabel: '✅ Yes, Assign Routes', danger: false }
  ))) {
    if (btn) btn.disabled = false;
    return;
  }
  if (btn) btn.textContent = 'Working...';
  const progEl = document.getElementById('assignProgress');
  const barEl = document.getElementById('assignBar');
  const statusEl = document.getElementById('assignStatus');
  if (progEl) progEl.style.display = 'block';
  if (barEl) barEl.style.width = '5%';
  if (statusEl) statusEl.textContent = 'Reading customers...';
// Auto-heal: archive any leftover deliveries from a previous day BEFORE
// creating today's routes. This means a forgotten manual reset no longer
// blocks or corrupts anything — it's handled here automatically.
try {
  const cleanup = await archiveDeliveries(false); // false = only non-today leftovers
  if (cleanup.archivedCount && statusEl) {
    statusEl.textContent = `Archived ${cleanup.archivedCount} leftover deliveries from ${cleanup.archivedDates.join(', ')}...`;
  }
} catch (e) {
  console.error('Leftover archive failed:', e);
}
  try {
    const snap = await db.collection('customers').get();
    const customers = []; snap.forEach(doc => { const d = doc.data(); if (d.active !== false) customers.push({ id: doc.id, ...d }); });
    if (!customers.length) {
      if (!auto) toast('No customers found', 'err');
      if (progEl) progEl.style.display = 'none';
      if (btn) { btn.disabled = false; btn.textContent = '🚀 Assign Today\'s Routes'; }
      return;
    }
    const existing = await db.collection('deliveries').where('deliveryDate', '==', today).limit(1).get();
    if (!existing.empty) {
      if (auto) {
        await db.collection('config').doc('app').set({ lastAutoAssign: today }, { merge: true }).catch(() => {});
        if (progEl) progEl.style.display = 'none';
        if (btn) { btn.disabled = false; btn.textContent = '🚀 Assign Today\'s Routes'; }
        return;
      }
      // ── DELETE & REASSIGN: double confirmation ── (most dangerous action)
      const ok1 = await askConfirm(
        `⚠️ Today's deliveries already exist.\n\nDeleting and reassigning will ERASE all current delivery progress (Picked, Delivered, Delayed statuses).\n\nThis cannot be undone.`,
        { title: '⛔ Overwrite Active Deliveries?', confirmLabel: 'Continue to final confirm', danger: true }
      );
      if (!ok1) { if (progEl) progEl.style.display = 'none'; if (btn) { btn.disabled = false; btn.textContent = '🚀 Assign Today\'s Routes'; } return; }

      const ok2 = await askConfirm(
        `FINAL WARNING: All delivery progress from today will be permanently lost.\n\nAre you absolutely sure you want to delete and reassign?`,
        { title: '❗ Final Confirmation — Delete & Reassign?', confirmLabel: '❌ Delete All & Reassign', danger: true }
      );
      if (!ok2) { if (progEl) progEl.style.display = 'none'; if (btn) { btn.disabled = false; btn.textContent = '🚀 Assign Today\'s Routes'; } return; }
      const allToday = await db.collection('deliveries').where('deliveryDate', '==', today).get();
      const delBatch = db.batch(); allToday.forEach(d => delBatch.delete(d.ref)); await delBatch.commit();
    }
    if (barEl) barEl.style.width = '25%';
    const agList = Object.entries(agents).map(([uid, d]) => ({ uid, name: d.name, zone: d.zone || '', maxDeliveries: d.maxDeliveries || 999 }));
    const result = _assignCustomers(customers, agList);
    let batch = db.batch(), ops = 0, done = 0, total = customers.length;
    for (const [uid, custs] of Object.entries(result)) {
      for (let i = 0; i < custs.length; i++) {
        const c = custs[i];
        batch.set(db.collection('deliveries').doc(), {
          customerName: c.name || '', customerPhone: c.phone || '', pickupLocation: c.pickupLocation || '',
          deliveryAddress: c.deliveryAddress || '', notes: c.notes || '', itemCount: c.itemCount || 1,
          customerId: c.id, boxId: c.boxId || '', assignedTo: uid, assignedName: agents[uid]?.name || '',
          agentPhone: agents[uid]?.phone || '',
          status: 'Pending', pickupOrder: i + 1, deliveryDate: today, timestamp: Date.now() + done
        });
        ops++; done++;
        if (ops >= 490) { await batch.commit(); batch = db.batch(); ops = 0; }
        if (barEl) barEl.style.width = Math.round(25 + (done / total) * 70) + '%';
        if (statusEl) statusEl.textContent = 'Writing ' + done + ' of ' + total + '...';
      }
    }
    if (ops > 0) await batch.commit();
    await db.collection('config').doc('app').set({ lastAutoAssign: today }, { merge: true }).catch(() => {});
    if (barEl) barEl.style.width = '100%';
    if (statusEl) statusEl.textContent = '✅ Done! ' + total + ' deliveries created.';
    toast((auto ? 'Auto Assign: ' : '') + total + ' deliveries assigned to ' + agList.length + ' agents!', 'ok');
    setTimeout(() => { if (progEl) progEl.style.display = 'none'; }, 3000);
  } catch (e) {
    if (progEl) progEl.style.display = 'none';
    toast('Error: ' + e.message, 'err');
  }
  if (btn) { btn.disabled = false; btn.textContent = '🚀 Assign Today\'s Routes'; }
}

function _assignCustomers(customers, agentList) {
  const result = {}; agentList.forEach(a => { result[a.uid] = []; });
  const unassigned = [];
  for (const c of customers) { if (c.assignedAgent && result[c.assignedAgent] !== undefined) result[c.assignedAgent].push(c); else unassigned.push(c); }
  const noZone = [];
  for (const c of unassigned) { const cz = (c.zone || '').toLowerCase(); const match = agentList.find(a => a.zone && cz && cz.includes(a.zone.toLowerCase()) && result[a.uid].length < a.maxDeliveries); if (match) result[match.uid].push(c); else noZone.push(c); }
  for (const c of noZone) { let least = agentList[0]; for (const a of agentList) if (result[a.uid].length < result[least.uid].length) least = a; result[least.uid].push(c); }
  for (const uid in result) result[uid].sort((a, b) => {
    const ra = (a.routeOrder != null) ? a.routeOrder : 999999;
    const rb = (b.routeOrder != null) ? b.routeOrder : 999999;
    if (ra !== rb) return ra - rb;
    return (a.pickupLocation || '').localeCompare(b.pickupLocation || '');
  });
  return result;
}
