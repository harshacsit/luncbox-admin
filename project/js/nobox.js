// ══ NO BOX REQUESTS MANAGEMENT ══

function listenNoBox() {
  db.collection('nobox_requests').orderBy('requestedAt', 'desc').limit(300).onSnapshot(snap => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const tomorrow2 = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const tomorrowCount = all.filter(r => r.date === tomorrow2).length;
    const todayCount = all.filter(r => r.date === today).length;
    const badge = document.getElementById('noboxBadge');
    if (badge) {
      badge.style.display = tomorrowCount > 0 ? '' : 'none';
      badge.textContent = tomorrowCount;
    }
    const ov = document.getElementById('ov_nobox'); if (ov) ov.textContent = tomorrowCount;
    const nb_t = document.getElementById('nb_tomorrow'), nb_td = document.getElementById('nb_today'), nb_tot = document.getElementById('nb_total');
    if (nb_t) nb_t.textContent = tomorrowCount;
    if (nb_td) nb_td.textContent = todayCount;
    if (nb_tot) nb_tot.textContent = all.length;
  }, () => { });
}

function loadNoBoxRequests() {
  const df = document.getElementById('noboxDateFilter')?.value;
  let ref = db.collection('nobox_requests').orderBy('requestedAt', 'desc').limit(500);
  if (df) ref = db.collection('nobox_requests').where('date', '==', df).limit(500);
  ref.get().then(snap => {
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const body = document.getElementById('noboxBody');
    if (!body) return;
    body.innerHTML = rows.length
      ? rows.map((r, i) => {
        const t = r.requestedAt ? new Date(r.requestedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
        const isTomorrow = r.date === tomorrow;
        return `<tr class="${isTomorrow ? 'row-nobox' : ''}"><td style="color:var(--muted)">${i + 1}</td><td><strong>${r.customerName || '—'}</strong></td><td style="font-family:var(--mono);font-size:12px;color:var(--blue)">${r.customerPhone || '—'}</td><td style="font-family:var(--mono);font-size:12px">${r.date || '—'}</td><td style="font-size:11px;color:var(--muted)">${t}</td><td><span class="badge ${isTomorrow ? 'badge-nobox' : 'badge-pending'}">${isTomorrow ? 'Tomorrow' : r.date === today ? 'Today' : 'Past'}</span></td></tr>`;
      }).join('')
      : '<tr><td colspan="6" class="empty-state"><div class="empty-icon">📦</div><div class="empty-text">No no-box requests</div></td></tr>';
  }).catch(() => { });
}