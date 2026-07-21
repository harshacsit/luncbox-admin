// ══ HISTORY ARCHIVE & DAILY RESET ══

async function loadHistory() {
  const dt = document.getElementById('histDate')?.value;
  if (!dt) { toast('Select a date first', 'err'); return; }
  const body = document.getElementById('histBody');
  if (body) body.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-text">Loading...</div></td></tr>';
  const summaryEl = document.getElementById('historySummary');
  if (summaryEl) summaryEl.style.display = 'none';
  
  const summSnap = await db.doc('history/' + dt + '/summary/stats').get().catch(() => null);
  if (summSnap && summSnap.exists) {
    const s = summSnap.data();
    const totalEl = document.getElementById('hs_total'); if (totalEl) totalEl.textContent = s.totalDeliveries || 0;
    const doneEl = document.getElementById('hs_done'); if (doneEl) doneEl.textContent = s.delivered || 0;
    const delayedEl = document.getElementById('hs_delayed'); if (delayedEl) delayedEl.textContent = s.delayed || 0;
    const rateEl = document.getElementById('hs_rate'); if (rateEl) rateEl.textContent = (s.completionRate || 0) + '%';
    if (summaryEl) summaryEl.style.display = 'grid';
  }
  
  let snap = await db.collection('history/' + dt + '/deliveries').orderBy('pickupOrder', 'asc').get().catch(() => db.collection('history/' + dt + '/deliveries').get());
  if (!body) return;
  if (!snap || snap.empty) { body.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">🗂</div><div class="empty-text">No deliveries archived for ${dt}</div></td></tr>`; return; }
  const sc = { Delivered: 'badge-delivered', Picked: 'badge-picked', Delayed: 'badge-delayed', Pending: 'badge-pending' };
  let i = 0;
  body.innerHTML = [...snap.docs].map(doc => {
    const d = doc.data(); i++;
    const ag = agents[d.assignedTo]?.name || d.assignedName || '?';
    const pickTime = d.pickedAt || d.timestamp;
    const t = pickTime ? new Date(pickTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
    const delayedTag = (d.wasDelayed && d.status !== 'Delayed') ? '<span class="badge badge-delayed" style="margin-left:5px" title="This delivery was marked Delayed earlier that day">⚠ Was Delayed</span>' : '';
    return `<tr><td style="color:var(--muted)">${i}</td><td><strong>${d.customerName || '—'}</strong></td><td style="font-family:var(--mono);font-size:12px;color:var(--blue)">${d.customerPhone || '—'}</td><td>${ag}</td><td><span class="badge ${sc[d.status] || 'badge-pending'}">${d.status}</span>${delayedTag}</td><td style="color:var(--muted);font-size:12px">${t}</td></tr>`;
  }).join('');
}

async function saveGlobalPin() {
  const pin = (document.getElementById('globalPinInp')?.value || '').trim();
  if (pin.length !== 4) { toast('Enter a 4-digit PIN', 'err'); return; }
  await db.collection('config').doc('app').set({ customerPin: pin }, { merge: true });
  const msg = document.getElementById('pinSaveMsg');
  if (msg) {
    msg.textContent = '✅ PIN saved! Customers can now sign in with PIN: ' + pin;
    msg.style.display = 'block';
  }
  toast('Global PIN updated to ' + pin, 'ok');
}

async function loadGlobalPin() {
  const snap = await db.collection('config').doc('app').get().catch(() => null);
  if (snap && snap.exists && snap.data().customerPin) {
    const pinInp = document.getElementById('globalPinInp');
    if (pinInp) pinInp.value = snap.data().customerPin;
  }
}

async function triggerReset(auto) {
  auto = !!auto;
  if (!auto && !confirm('Archive all current deliveries and clear the list for tomorrow?')) return;
  const btn = document.getElementById('btnReset');
  if (btn) { btn.disabled = true; btn.textContent = 'Archiving...'; }
  try {
    const snap = await db.collection('deliveries').get();
    const t = snap.size;
    if (t === 0) {
      if (btn) { btn.disabled = false; btn.textContent = 'Archive & Reset for Tomorrow'; }
      if (!auto) toast('No deliveries to archive', 'info');
      await db.collection('config').doc('app').set({ lastAutoReset: today }, { merge: true }).catch(() => {});
      return;
    }
    let del = 0, dly = 0, pnd = 0;
    snap.forEach(d => { const s = d.data().status || ''; if (s === 'Delivered' || s === 'Picked') del++; else if (s === 'Delayed') dly++; else pnd++; });
    const pct = t > 0 ? Math.round((del * 100) / t) : 0;
    let batch = db.batch(), ops = 0;
    for (const doc of snap.docs) {
      batch.set(db.doc('history/' + today + '/deliveries/' + doc.id), { ...doc.data(), archiveDate: today, archivedAt: Date.now() });
      batch.delete(doc.ref); ops += 2;
      if (ops >= 490) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    batch.set(db.doc('history/' + today + '/summary/stats'), { date: today, totalDeliveries: t, delivered: del, delayed: dly, pending: pnd, completionRate: pct, archivedAt: Date.now() });
    await batch.commit();
    await db.collection('config').doc('app').set({ lastAutoReset: today }, { merge: true }).catch(() => {});
    historyCache = null;
    if (btn) { btn.disabled = false; btn.textContent = 'Archive & Reset for Tomorrow'; }
    const rm = document.getElementById('resetResultMsg');
    if (rm) { rm.style.display = 'block'; rm.textContent = '✅ Archived ' + t + ' deliveries — ' + pct + '% completion rate — ready for tomorrow!'; }
    toast(auto ? 'Auto Reset complete!' : 'Reset complete!', 'ok');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Archive & Reset for Tomorrow'; }
    toast('Reset failed: ' + e.message, 'err');
  }
}
