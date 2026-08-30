// ══ HISTORY ARCHIVE & DAILY RESET ══

async function loadHistory() {
  const dt = document.getElementById('histDate')?.value;
  if (!dt) { toast('Select a date first', 'err'); return; }
  const agF = document.getElementById('histAgentFilter')?.value || '';
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

  const snap = await db.collection('history/' + dt + '/deliveries').get().catch(() => null);
  if (!body) return;
  if (!snap || snap.empty) { body.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">🗂</div><div class="empty-text">No deliveries archived for ${dt}</div></td></tr>`; return; }

  let docs = snap.docs.map(doc => doc.data());
  if (agF) docs = docs.filter(d => d.assignedTo === agF);
  if (!docs.length) { body.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">🗂</div><div class="empty-text">No deliveries for this agent on ${dt}</div></td></tr>`; return; }

  // Agent-wise sort: when "All Agents" is selected, group by agent name
  // (then by pickup order within each agent) so one agent's stops read
  // together instead of interleaved by write order.
  docs.sort((a, b) => {
    const an = (agents[a.assignedTo]?.name || a.assignedName || '~Unassigned').toLowerCase();
    const bn = (agents[b.assignedTo]?.name || b.assignedName || '~Unassigned').toLowerCase();
    if (an !== bn) return an.localeCompare(bn);
    return (a.pickupOrder || 9999) - (b.pickupOrder || 9999);
  });

  const sc = { Delivered: 'badge-delivered', Picked: 'badge-picked', Delayed: 'badge-delayed', Pending: 'badge-pending' };
  let i = 0, lastAgent = null;
  body.innerHTML = docs.map(d => {
    i++;
    const ag = agents[d.assignedTo]?.name || d.assignedName || 'Unassigned';
    const pickTime = d.pickedAt || d.timestamp;
    const t = pickTime ? new Date(pickTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
    const delayedTag = (d.wasDelayed && d.status !== 'Delayed') ? '<span class="badge badge-delayed" style="margin-left:5px" title="This delivery was marked Delayed earlier that day">⚠ Was Delayed</span>' : '';
    let groupRow = '';
    if (!agF && ag !== lastAgent) {
      groupRow = `<tr><td colspan="6" style="background:var(--bg);font-weight:700;font-size:11px;color:var(--accent);text-transform:uppercase;letter-spacing:.4px;padding:8px 16px">${ag}</td></tr>`;
      lastAgent = ag;
    }
    return groupRow + `<tr><td style="color:var(--muted)">${i}</td><td><strong>${d.customerName || '—'}</strong></td><td style="font-family:var(--mono);font-size:12px;color:var(--blue)">${d.customerPhone || '—'}</td><td>${ag}</td><td><span class="badge ${sc[d.status] || 'badge-pending'}">${d.status}</span>${delayedTag}</td><td style="color:var(--muted);font-size:12px">${t}</td></tr>`;
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
// ── SHARED ARCHIVER ──
// includeToday=true  → archives every delivery currently in the collection
//                      (used by the manual "Archive & Reset" button)
// includeToday=false → archives only leftovers from a PREVIOUS day, leaving
//                      today's deliveries untouched (used automatically by
//                      Auto Assign, so a missed reset never blocks tomorrow)
// Each doc is always filed under ITS OWN deliveryDate, never "today" —
// this is the fix for the misfiled-history bug.
async function archiveDeliveries(includeToday) {
  const snap = await db.collection('deliveries').get();
  const toArchive = snap.docs.filter(doc => includeToday || (doc.data().deliveryDate || today) !== today);
  if (!toArchive.length) return { archivedDates: [], archivedCount: 0 };

  const groups = {};
  toArchive.forEach(doc => {
    const date = doc.data().deliveryDate || today;
    if (!groups[date]) groups[date] = [];
    groups[date].push(doc);
  });

  const currentUser = firebase.auth().currentUser;
  if (!currentUser) throw new Error('You must be signed in to archive deliveries.');
  const token = await currentUser.getIdToken();
  const archivedDates = [];
  let archivedCount = 0;

  for (const [date, docs] of Object.entries(groups)) {
    let del = 0, dly = 0, pnd = 0;
    docs.forEach(doc => {
      const s = doc.data().status || '';
      if (s === 'Delivered' || s === 'Picked') del++;
      else if (s === 'Delayed') dly++;
      else pnd++;
    });

    const totalDeliveries = docs.length;
    const delivered = del;
    const delayed = dly;
    const pending = pnd;
    const completionRate = totalDeliveries > 0 ? Math.round((delivered * 100) / totalDeliveries) : 0;

    const payload = {
      date,
      summary: {
        totalDeliveries,
        delivered,
        delayed,
        pending,
        completionRate,
        archivedAt: Date.now()
      },
      deliveries: docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          customerId: d.customerId || '',
          customerName: d.customerName || '',
          customerPhone: d.customerPhone || '',
          boxId: d.boxId || '',
          pickupLocation: d.pickupLocation || '',
          deliveryAddress: d.deliveryAddress || '',
          assignedTo: d.assignedTo || '',
          assignedName: d.assignedName || '',
          agentPhone: d.agentPhone || '',
          status: d.status || 'Pending',
          wasDelayed: !!d.wasDelayed,
          pickupOrder: d.pickupOrder || null,
          itemCount: d.itemCount || 1,
          notes: d.notes || '',
          deliveryDate: d.deliveryDate || date,
          pickedAt: d.pickedAt || null,
          timestamp: d.timestamp || Date.now(),
          archivedAt: Date.now()
        };
      })
    };

    // Call Netlify function to sync to Supabase
    const res = await fetch('/.netlify/functions/sync-history', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to sync date ${date} to Supabase`);
    }

    // After successful sync, delete from Firestore
    let batch = db.batch(), ops = 0;
    for (const doc of docs) {
      batch.delete(doc.ref);
      ops++;
      if (ops >= 480) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    await batch.commit();

    archivedDates.push(date);
    archivedCount += docs.length;
  }

  analyticsLoaded = false; // invalidate cache so Analytics re-fetches from Supabase
  return { archivedDates, archivedCount };
}
async function triggerReset(auto) {
  if (auto) return; // All automatic daily resets have been stopped
  const btn = document.getElementById('btnReset');
  if (btn) btn.disabled = true;

  // ── DELIVERY HOURS GUARD ── (10:30 AM – 1:00 PM)
  const _now = new Date();
  const hour = _now.getHours(), min = _now.getMinutes();
  const isDuringDeliveries = (hour === 10 && min >= 30) || hour === 11 || hour === 12;
  if (isDuringDeliveries) {
    const nowStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    const proceed = await askConfirm(
      `⚠️ It is currently ${nowStr} — agents may be actively delivering right now.\n\nResetting mid-delivery will permanently archive unfinished deliveries.\n\nAre you SURE this is the right time to reset?`,
      { title: '⛔ Deliveries Are In Progress!', confirmLabel: 'Yes, I understand the risk', danger: true }
    );
    if (!proceed) { if (btn) btn.disabled = false; return; }
  }

  // ── SECOND CONFIRMATION ── (always required)
  const ok = await askConfirm(
    `This will archive ALL current deliveries to Supabase history and completely clear the delivery list.\n\nThis action cannot be undone.\n\nConfirm to proceed.`,
    { title: 'Final Confirmation — Archive & Reset?', confirmLabel: '✅ Archive & Reset Now', danger: true }
  );
  if (!ok) { if (btn) btn.disabled = false; return; }

  if (btn) btn.textContent = 'Archiving...';
  try {
    const result = await archiveDeliveries(true); // true = archive everything, including today's
    await db.collection('config').doc('app').set({ lastAutoReset: today }, { merge: true }).catch(() => {});
    if (btn) { btn.disabled = false; btn.textContent = 'Archive & Reset for Tomorrow'; }
    const rm = document.getElementById('resetResultMsg');
    if (rm) {
      rm.style.display = 'block';
      rm.textContent = result.archivedCount
        ? `✅ Archived ${result.archivedCount} deliveries across ${result.archivedDates.length} date(s) (${result.archivedDates.join(', ')}) — ready for tomorrow!`
        : 'No deliveries to archive.';
    }
    toast(auto ? 'Auto Reset complete!' : 'Reset complete!', 'ok');
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Archive & Reset for Tomorrow'; }
    toast('Reset failed: ' + e.message, 'err');
  }
}