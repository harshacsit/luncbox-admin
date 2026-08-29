// ══ CUSTOMER MASTER LIST & EXCEL IMPORT ══

function loadCustomers() {
  db.collection('customers').get().then(snap => {
    allCustomers = [];
    snap.forEach(doc => { const d = doc.data(); d.id = doc.id; if (d.active !== false) allCustomers.push(d); });
    renderCustomers();
    const acc = document.getElementById('activeCustomerCount'); if (acc) acc.textContent = allCustomers.length + ' customer' + (allCustomers.length !== 1 ? 's' : '');
  }).catch(e => toast('Customers error: ' + e.message, 'err'));
}

function renderCustomers() {
  const q = (document.getElementById('custSearch')?.value || '').toLowerCase();
  const agF = document.getElementById('custAgentFilter')?.value || '';
  const sortBy = document.getElementById('custSort')?.value || 'boxid';
  const rows = allCustomers.filter(c => {
    const matchesSearch = !q
      || (c.name || '').toLowerCase().includes(q)
      || (c.phone || '').includes(q)
      || (c.boxId || '').toLowerCase().includes(q)
      || (c.zone || '').toLowerCase().includes(q);
    const matchesAgent = !agF || c.assignedAgent === agF;
    return matchesSearch && matchesAgent;
  });
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const sortKey = sortBy === 'name' ? 'name' : sortBy === 'zone' ? 'zone' : 'boxId';
  rows.sort((a, b) => collator.compare(a[sortKey] || '', b[sortKey] || '') || collator.compare(a.name || '', b.name || ''));

  const body = document.getElementById('customerBody');
  if (!body) return;
  body.innerHTML = rows.length
    ? rows.map((c, i) => {
      const agNm = c.assignedAgent && agents[c.assignedAgent] ? agents[c.assignedAgent].name : 'Auto';
      return `<tr><td style="color:var(--muted)">${i + 1}</td><td><span style="background:var(--accentbg);border:1px solid var(--accent);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;color:var(--accent);font-family:var(--mono)">${c.boxId || '—'}</span></td><td><strong>${c.name || '—'}</strong></td><td style="font-family:var(--mono);font-size:12px;color:var(--blue)">${c.phone || '—'}</td><td style="font-size:12px;color:var(--muted)">${c.pickupLocation || '—'}</td><td style="font-size:12px;color:var(--muted)">${c.deliveryAddress || '—'}</td><td><span style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:2px 7px;font-size:10px">${c.zone || '—'}</span></td><td style="font-size:12px">${agNm}</td><td><span class="badge badge-picked">Active</span></td><td><button class="f-btn off" onclick="openEditCustomer('${c.id}')" style="font-size:10px;color:var(--blue)">Edit</button> <button class="f-btn off" onclick="pauseCustomer('${c.id}')" style="font-size:10px">Pause</button> <button class="f-btn off" onclick="deleteCustomer('${c.id}','${escQ(c.name)}')" style="font-size:10px;color:var(--red)">Delete</button></td></tr>`;
    }).join('')
    : '<tr><td colspan="9" class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">No customers.</div></td></tr>';
}

function pauseCustomer(id) {
  db.collection('customers').doc(id).update({ active: false }).then(() => { loadCustomers(); toast('Customer paused', 'ok'); }).catch(e => toast(e.message, 'err'));
}

async function deleteCustomer(id, name) {
  const ok = await askConfirm(
    `This only removes them from future Auto Assign. Their past deliveries and history stay archived and are never deleted.`,
    { title: `Delete ${name || 'this customer'}?`, confirmLabel: 'Delete', danger: true }
  );
  if (!ok) return;
  db.collection('customers').doc(id).delete()
    .then(() => { loadCustomers(); toast('Customer deleted — delivery history is safe', 'ok'); })
    .catch(e => toast('Delete failed: ' + e.message, 'err'));
}

async function findBoxIdOwner(boxId, excludeId) {
  if (!boxId) return null;
  const snap = await db.collection('customers').where('boxId', '==', boxId).get();
  for (const doc of snap.docs) {
    if (doc.id !== excludeId) return { id: doc.id, name: doc.data().name || 'Unknown', active: doc.data().active !== false };
  }
  return null;
}

async function liveCheckBoxId(inputId, excludeId) {
  const input = document.getElementById(inputId);
  const warnEl = document.getElementById(inputId + 'Warn');
  if (!input || !warnEl) return;
  const bx = (input.value || '').trim().toUpperCase();
  if (!bx) { warnEl.style.display = 'none'; return; }
  const owner = await findBoxIdOwner(bx, excludeId);
  if (owner) {
    warnEl.textContent = `⚠ Already allotted to ${owner.name}${owner.active ? '' : ' (paused)'}`;
    warnEl.style.display = 'block';
  } else {
    warnEl.style.display = 'none';
  }
}

async function addCustomer() {
  const n = gv('cN'), ph = gv('cPh'), bx = gv('cBx').toUpperCase(), pk = gv('cPk'), ad = gv('cAd'), zn = gv('cZn'), ag = gv('cAg'), no = gv('cNo');
  if (!n || !pk || !ad) { toast('Name, pickup and delivery address required', 'err'); return; }
  if (!bx) { toast('Box ID is required', 'err'); return; }
  const owner = await findBoxIdOwner(bx, null);
  if (owner) { toast(`Box ID ${bx} is already allotted to ${owner.name}${owner.active ? '' : ' (paused)'}`, 'err'); return; }
  db.collection('customers').add({ name: n, phone: ph, boxId: bx, pickupLocation: pk, deliveryAddress: ad, zone: zn, assignedAgent: ag, notes: no, itemCount: 1, active: true, createdAt: Date.now() })
    .then(() => { closeM('addCustomerModal'); loadCustomers(); toast('Customer added!', 'ok');['cN', 'cPh', 'cBx', 'cPk', 'cAd', 'cZn', 'cNo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; }); })
    .catch(e => toast('Error: ' + e.message, 'err'));
}

function openEditCustomer(id) {
  const c = allCustomers.find(x => x.id === id);
  if (!c) { toast('Customer not found', 'err'); return; }
  document.getElementById('ecId').value = id;
  document.getElementById('ecN').value = c.name || '';
  document.getElementById('ecPh').value = c.phone || '';
  document.getElementById('ecBx').value = c.boxId || '';
  document.getElementById('ecZn').value = c.zone || '';
  document.getElementById('ecPk').value = c.pickupLocation || '';
  document.getElementById('ecAd').value = c.deliveryAddress || '';
  document.getElementById('ecAg').value = c.assignedAgent || '';
  document.getElementById('ecNo').value = c.notes || '';
  openM('editCustomerModal');
}

async function saveCustomerEdit() {
  const id = document.getElementById('ecId').value;
  const n = gv('ecN'), ph = gv('ecPh'), bx = gv('ecBx').toUpperCase(), pk = gv('ecPk'), ad = gv('ecAd'), zn = gv('ecZn'), ag = gv('ecAg'), no = gv('ecNo');
  if (!id) { toast('Missing customer reference', 'err'); return; }
  if (!n || !pk || !ad) { toast('Name, pickup and delivery address required', 'err'); return; }
  if (!bx) { toast('Box ID is required', 'err'); return; }
  const owner = await findBoxIdOwner(bx, id);
  if (owner) { toast(`Box ID ${bx} is already allotted to ${owner.name}${owner.active ? '' : ' (paused)'}`, 'err'); return; }
  db.collection('customers').doc(id).update({
    name: n, phone: ph, boxId: bx, pickupLocation: pk, deliveryAddress: ad, zone: zn, assignedAgent: ag, notes: no
  }).then(() => { closeM('editCustomerModal'); loadCustomers(); toast('Customer updated!', 'ok'); })
    .catch(e => toast('Update failed: ' + e.message, 'err'));
}

// ── EXCEL IMPORT ──
function dragOver(e) { e.preventDefault(); document.getElementById('dropZone').classList.add('drag'); }
function dragLeave() { document.getElementById('dropZone').classList.remove('drag'); }
function dropFile(e) { e.preventDefault(); dragLeave(); const f = e.dataTransfer.files[0]; if (f) readFile(f); }

function readFile(file) {
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const wb = XLSX.read(evt.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      parsedData = rows.filter(r => r.CustomerName || r.customerName || r['Customer Name']);
      if (!parsedData.length) { toast('No valid rows found', 'err'); return; }
      showImportPreview(parsedData);
    } catch (e) { toast('Could not read file: ' + e.message, 'err'); }
  };
  reader.readAsBinaryString(file);
}

function showImportPreview(rows) {
  document.getElementById('importCount').textContent = '✅ ' + rows.length + ' customers found';
  document.getElementById('previewBody').innerHTML = rows.slice(0, 15).map((r, i) => {
    const nm = r.CustomerName || r.customerName || r['Customer Name'] || '';
    const ph = (r.Phone || r.phone || '').toString();
    const bx = (r.BoxID || r.boxId || r['Box ID'] || r.boxid || '').toString().toUpperCase();
    const pk = r.PickupLocation || r.pickupLocation || r['Pickup Location'] || '';
    const zn = r.Zone || r.zone || '';
    return `<tr><td style="padding:6px 12px;color:var(--muted)">${i + 1}</td><td style="padding:6px 12px"><strong>${nm}</strong></td><td style="padding:6px 12px;font-family:var(--mono);font-size:11px">${ph}</td><td style="padding:6px 12px"><span style="background:var(--accentbg);color:var(--accent);border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700;font-family:var(--mono)">${bx || '—'}</span></td><td style="padding:6px 12px;font-size:11px;color:var(--muted)">${pk}</td><td style="padding:6px 12px"><span style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:10px">${zn || '—'}</span></td></tr>`;
  }).join('') + (rows.length > 15 ? `<tr><td colspan="5" style="padding:8px 12px;color:var(--muted);text-align:center;font-size:11px">...and ${rows.length - 15} more rows</td></tr>` : '');
  document.getElementById('importPreviewSection').style.display = 'block';
  toast('Parsed ' + rows.length + ' rows — review then import', 'info');
}

async function importCustomers() {
  if (!parsedData.length) { toast('Nothing to import', 'err'); return; }
  const ov = document.getElementById('overrideAgent').value;
  document.getElementById('importProgressWrap').style.display = 'block';
  document.getElementById('importStatusText').textContent = 'Checking for duplicate Box IDs...';

  const existingSnap = await db.collection('customers').get();
  const usedBoxIds = new Set();
  existingSnap.forEach(doc => { const b = (doc.data().boxId || '').toUpperCase(); if (b) usedBoxIds.add(b); });

  const toImport = [], skipped = [];
  parsedData.forEach(r => {
    const bx = (r.BoxID || r.boxId || r['Box ID'] || r.boxid || '').toString().toUpperCase();
    const nm = r.CustomerName || r.customerName || r['Customer Name'] || '';
    if (bx && usedBoxIds.has(bx)) {
      skipped.push(`${nm || '(no name)'} — ${bx}`);
    } else {
      if (bx) usedBoxIds.add(bx);
      toImport.push(r);
    }
  });

  if (!toImport.length) {
    toast('All rows were skipped — every Box ID is already in use', 'err');
    document.getElementById('importProgressWrap').style.display = 'none';
    return;
  }

  let done = 0, total = toImport.length;
  for (let s = 0; s < toImport.length; s += 400) {
    const chunk = toImport.slice(s, s + 400);
    const batch = db.batch();
    chunk.forEach(r => {
      const nm = r.CustomerName || r.customerName || r['Customer Name'] || '';
      const ph = (r.Phone || r.phone || '').toString();
      const bx = (r.BoxID || r.boxId || r['Box ID'] || r.boxid || '').toString().toUpperCase();
      batch.set(db.collection('customers').doc(), {
        name: nm, phone: ph, boxId: bx,
        pickupLocation: r.PickupLocation || r.pickupLocation || r['Pickup Location'] || '',
        deliveryAddress: r.DeliveryAddress || r.deliveryAddress || r['Delivery Address'] || '',
        zone: r.Zone || r.zone || '', assignedAgent: ov || (r.AgentUID || r.agentUID || ''),
        notes: r.Notes || r.notes || '', itemCount: parseInt(r.ItemCount || r.itemCount || 1) || 1,
        active: true, createdAt: Date.now()
      });
    });
    await batch.commit();
    done += chunk.length;
    document.getElementById('importProgressFill').style.width = Math.round((done / total) * 100) + '%';
    document.getElementById('importStatusText').textContent = 'Imported ' + done + ' of ' + total + '...';
  }
  const skipMsg = skipped.length ? ` — skipped ${skipped.length} duplicate Box ID${skipped.length === 1 ? '' : 's'} (${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? ', …' : ''})` : '';
  document.getElementById('importStatusText').textContent = '✅ ' + total + ' customers imported!' + skipMsg;
  toast(total + ' imported' + (skipped.length ? `, ${skipped.length} skipped as duplicate Box IDs` : '!'), 'ok');
  parsedData = []; loadCustomers();
  setTimeout(() => { document.getElementById('importPreviewSection').style.display = 'none'; document.getElementById('importProgressWrap').style.display = 'none'; document.getElementById('fileInput').value = ''; }, skipped.length ? 6000 : 3000);
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([['CustomerName', 'Phone', 'BoxID', 'PickupLocation', 'DeliveryAddress', 'Zone', 'AgentUID', 'Notes', 'ItemCount'], ['Priya Sharma', '9876543210', 'LB-001', 'MG Road', 'House 12 Gandhi Nagar', 'north', '', '2nd floor', '1'], ['Arjun Reddy', '9876543211', 'LB-002', 'Clock Tower', 'Flat 3B Nehru Colony', 'south', '', '', '1']]);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Customers');
  XLSX.writeFile(wb, 'lunchbox_customer_template.xlsx');
  toast('Template downloaded!', 'ok');
}
