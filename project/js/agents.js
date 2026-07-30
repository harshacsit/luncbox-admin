// ══ DELIVERY AGENTS MANAGEMENT ══

function loadAgents() {
  db.collection('users').where('role', '==', 'delivery').get().then(snap => {
    agents = {};
    let grid = '', agOpts = '<option value="">Select agent...</option>', uidRows = '', zones = new Set();
    let count = 0;
    const docs = snap.docs.slice().sort((a, b) => (a.data().name || '').localeCompare(b.data().name || '', undefined, { numeric: true, sensitivity: 'base' }));
    docs.forEach(doc => {
      const d = doc.data(); count++;
      agents[doc.id] = { name: d.name || '?', fcmToken: d.fcmToken || '', zone: d.zone || '', maxDeliveries: d.maxDeliveries || 999, email: d.email || '', phone: d.phone || '' };
      const ini = (d.name || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
      const tot = d.totalDeliveries || 0, dn = d.completedDeliveries || 0, pct = tot > 0 ? Math.round((dn * 100) / tot) : 0;
      if (d.zone) zones.add(d.zone.toLowerCase());
      grid += `<div class="agent-card"><div class="ag-top"><div class="ag-av">${ini}</div><div><div class="ag-name">${d.name || '?'}</div><div class="ag-email">${d.email || ''}</div><div class="ag-email">Zone: ${d.zone || '—'}</div></div></div><div class="ag-stats"><div class="ag-stat"><div class="num" id="agTot_${doc.id}">${tot}</div><div class="lbl">Total</div></div><div class="ag-stat"><div class="num" id="agDone_${doc.id}">${dn}</div><div class="lbl">Done</div></div><div class="ag-stat"><div class="num" id="agRate_${doc.id}" style="color:var(--accent)">${pct}%</div><div class="lbl">Rate</div></div></div><div class="perf-bar"><div class="perf-fill" id="agBar_${doc.id}" style="width:${pct}%"></div></div><div class="perf-label" id="agPerfLbl_${doc.id}">Performance: ${pct}%</div>${d.email ? `<div class="cred-box">Login: <strong>${d.email}</strong></div>` : ''}<button class="topbar-btn secondary" style="width:100%;margin-top:10px;font-size:12px" onclick="openEditAgent('${doc.id}')">✏️ Edit Agent</button></div>`;
      agOpts += `<option value="${doc.id}">${d.name || '?'}</option>`;
      uidRows += `<tr><td><strong>${d.name || '?'}</strong></td><td style="color:var(--muted)">${d.email || ''}</td><td style="color:var(--muted)">${d.zone || '—'}</td><td><code style="font-family:var(--mono);font-size:10px;cursor:pointer;color:var(--accent)" onclick="copyUID('${doc.id}')" title="Click to copy">${doc.id}</code></td></tr>`;
    });
    const agentGridEl = document.getElementById('agentGrid');
    if (agentGridEl) agentGridEl.innerHTML = grid || '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">👤</div><div class="empty-text">No agents yet.</div></div>';
    const uidBodyEl = document.getElementById('uidBody');
    if (uidBodyEl) uidBodyEl.innerHTML = uidRows || '<tr><td colspan="4" class="empty-state"><div class="empty-text">No agents yet</div></td></tr>';
    
    ['dAg', 'cAg', 'ecAg', 'overrideAgent'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = agOpts; });
    
    let agFilt = '<option value="">All Agents</option>';
    Object.entries(agents).forEach(([uid, a]) => agFilt += `<option value="${uid}">${a.name}</option>`);
    const af = document.getElementById('agentFilter'); if (af) af.innerHTML = agFilt;
    const caf = document.getElementById('custAgentFilter'); if (caf) caf.innerHTML = agFilt;
    const aac = document.getElementById('activeAgentCount'); if (aac) aac.textContent = count + ' agent' + (count !== 1 ? 's' : '');
    
    const zSel = document.getElementById('broadcastZone');
    if (zSel) { zSel.innerHTML = '<option value="">Select Zone...</option>'; zones.forEach(z => zSel.innerHTML += `<option value="${z}">${z}</option>`); }
    renderAgentLoad();
    loadHistoryCache().then(applyAgentPerfToCards).catch(() => {});
  }).catch(e => toast('Could not load agents: ' + e.message, 'err'));
}

function applyAgentPerfToCards(historyDocs) {
  const perf = {};
  (historyDocs || []).forEach(d => {
    const uid = d.assignedTo; if (!uid) return;
    if (!perf[uid]) perf[uid] = { total: 0, done: 0 };
    perf[uid].total++;
    if (d.status === 'Delivered' || d.status === 'Picked') perf[uid].done++;
  });
  Object.keys(agents).forEach(uid => {
    const p = perf[uid] || { total: 0, done: 0 };
    const pct = p.total > 0 ? Math.round((p.done * 100) / p.total) : 0;
    const tEl = document.getElementById('agTot_' + uid), dEl = document.getElementById('agDone_' + uid),
      rEl = document.getElementById('agRate_' + uid), bEl = document.getElementById('agBar_' + uid),
      lEl = document.getElementById('agPerfLbl_' + uid);
    if (tEl) tEl.textContent = p.total;
    if (dEl) dEl.textContent = p.done;
    if (rEl) rEl.textContent = pct + '%';
    if (bEl) bEl.style.width = pct + '%';
    if (lEl) lEl.textContent = 'Performance: ' + pct + '% (all-time)';
  });
}

function createAgent() {
  const n = gv('aN'), ph = gv('aPh'), em = gv('aEm'), pw = gv('aPw'), zn = gv('aZn');
  const mx = parseInt(document.getElementById('aMx').value) || 30;
  if (!n || !em || !pw) { toast('Name, email and password required', 'err'); return; }
  if (pw.length < 6) { toast('Password min 6 characters', 'err'); return; }
  const btn = document.getElementById('createAgentBtn'); btn.disabled = true; btn.textContent = 'Creating...';
  fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em, password: pw, returnSecureToken: true }) })
    .then(r => r.json()).then(data => {
      if (data.error) throw new Error(data.error.message);
      return db.collection('users').doc(data.localId).set({ userId: data.localId, name: n, phone: ph, email: em, role: 'delivery', zone: zn, maxDeliveries: mx, fcmToken: '', totalDeliveries: 0, completedDeliveries: 0, active: true });
    }).then(() => {
      btn.disabled = false; btn.textContent = 'Create Agent'; closeM('addAgentModal'); loadAgents();
      showAgentCredentials(n, em, pw);
      toast('Agent ' + n + ' created!', 'ok');
      ['aN', 'aPh', 'aEm', 'aPw', 'aZn'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    }).catch(e => { btn.disabled = false; btn.textContent = 'Create Agent'; let msg = e.message; if (msg.includes('EMAIL_EXISTS')) msg = 'Email already registered.'; toast('Failed: ' + msg, 'err'); });
}

let _lastAgentCreds=null;
function showAgentCredentials(name,email,pass){
  _lastAgentCreds={name,email,pass};
  const nameEl = document.getElementById('credAgentName');
  const emailEl = document.getElementById('credAgentEmail');
  const passEl = document.getElementById('credAgentPass');
  if (nameEl) nameEl.textContent=name;
  if (emailEl) emailEl.textContent=email;
  if (passEl) passEl.textContent=pass;
  openM('credentialsModal');
}
function copyAgentCredentials(){
  if(!_lastAgentCreds) return;
  navigator.clipboard.writeText(`Email: ${_lastAgentCreds.email}\nPassword: ${_lastAgentCreds.pass}`)
    .then(()=>toast('Credentials copied!','ok')).catch(()=>toast('Could not copy — select manually','err'));
}

function openEditAgent(uid) {
  const a = agents[uid];
  if (!a) { toast('Agent not found', 'err'); return; }
  document.getElementById('eaUid').value = uid;
  document.getElementById('eaN').value = a.name || '';
  document.getElementById('eaPh').value = a.phone || '';
  document.getElementById('eaZn').value = a.zone || '';
  document.getElementById('eaMx').value = a.maxDeliveries || 30;
  document.getElementById('eaEm').value = a.email || '';
  openM('editAgentModal');
}

function saveAgentEdit() {
  const uid = document.getElementById('eaUid').value;
  const n = gv('eaN'), ph = gv('eaPh'), zn = gv('eaZn');
  const mx = parseInt(document.getElementById('eaMx').value) || 30;
  if (!uid) { toast('Missing agent reference', 'err'); return; }
  if (!n) { toast('Name is required', 'err'); return; }
  db.collection('users').doc(uid).update({ name: n, phone: ph, zone: zn, maxDeliveries: mx })
    .then(() => { closeM('editAgentModal'); loadAgents(); toast('Agent updated!', 'ok'); })
    .catch(e => toast('Update failed: ' + e.message, 'err'));
}
