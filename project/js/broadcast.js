// ══ BROADCAST MESSAGING (WATI / WHATSAPP) ══

let twilioConfig = { endpoint: '', token: '', templateName: '' };

function loadTwilioConfig() {
  const saved = localStorage.getItem('lunchbox_wati');
  if (saved) {
    twilioConfig = JSON.parse(saved);
    if (twilioConfig.endpoint) {
      const epEl = document.getElementById('watiEndpoint'); if (epEl) epEl.value = twilioConfig.endpoint || '';
      const tkEl = document.getElementById('watiToken'); if (tkEl) tkEl.value = twilioConfig.token || '';
      const tnEl = document.getElementById('watiTemplateName'); if (tnEl) tnEl.value = twilioConfig.templateName || '';
      const twEl = document.getElementById('twilioWarning'); if (twEl) twEl.style.display = 'none';
    }
  }
}

function saveTwilioConfig() {
  twilioConfig = {
    endpoint:     (document.getElementById('watiEndpoint')?.value || '').trim().replace(/\/$/, ''),
    token:        (document.getElementById('watiToken')?.value || '').trim(),
    templateName: (document.getElementById('watiTemplateName')?.value || '').trim()
  };
  localStorage.setItem('lunchbox_wati', JSON.stringify(twilioConfig));
  const twEl = document.getElementById('twilioWarning'); if (twEl) twEl.style.display = 'none';
  toast('WATI credentials saved!', 'ok');
}
const saveWatiConfig = saveTwilioConfig;

function selectRecipients(type, btn) {
  broadcastRecipient = type;
  document.querySelectorAll('#panel-broadcast .f-btn').forEach(b => { b.classList.remove('on'); b.classList.add('off'); });
  btn.classList.add('on'); btn.classList.remove('off');
  const zEl = document.getElementById('zoneSelector'); if (zEl) zEl.style.display = type === 'zone' ? 'block' : 'none';
  const msgs = { all: 'All customers will receive this message', zone: 'Customers in selected zone will receive this', nobox: 'Customers who opted out tomorrow will receive this' };
  const rcEl = document.getElementById('recipientCount'); if (rcEl) rcEl.textContent = msgs[type] || '';
}

const templates = {
  holiday: `Hi {name}! 🏖️ Lunchbox will be closed on [date]. No delivery on that day. We'll resume as usual the next working day. Thank you for your understanding!`,
  delay: `Hi {name} ⚡ Please note there is a route delay today. Your delivery will arrive a bit later than usual. We apologize for the inconvenience!`,
  nobox: `📦 Reminder: If you don't need your lunchbox tomorrow (${tomorrow}), please tap "No Box" in the Lunchbox app by 8 PM today to avoid charges.`,
  menu: `Hi {name}! 🍛 Exciting news — we've updated tomorrow's menu! Check the app for today's special. Enjoy your meal!`,
  price: `Hi {name}, 💰 Please note that starting from next month there will be a slight price adjustment. We'll send full details soon. Thank you for being a loyal customer!`
};

function useTemplate(key) {
  const bMsg = document.getElementById('broadcastMsg');
  if (bMsg) bMsg.value = templates[key] || '';
  updatePreview();
}

function updatePreview() {
  const msg = document.getElementById('broadcastMsg')?.value || '';
  const bcEl = document.getElementById('broadcastCharCount'); if (bcEl) bcEl.textContent = msg.length;
  const preview = msg.replace(/{name}/g, 'Priya').replace(/{boxid}/g, 'LB-001').replace(/{date}/g, today);
  const mpEl = document.getElementById('msgPreview'); if (mpEl) mpEl.textContent = preview || 'Your message preview will appear here...';
}

function openM_broadcast() {
  const msg = (document.getElementById('broadcastMsg')?.value || '').trim();
  if (!msg) { toast('Enter a message first', 'err'); return; }
  if (!twilioConfig.endpoint) { toast('Save WATI credentials first', 'err'); return; }
  const bcdEl = document.getElementById('broadcastConfirmDetails'); if (bcdEl) bcdEl.textContent = `Channel: ${broadcastChannel.toUpperCase()} · Recipients: ${broadcastRecipient}`;
  const bcmEl = document.getElementById('broadcastConfirmMsg'); if (bcmEl) bcmEl.textContent = msg.substring(0, 100) + (msg.length > 100 ? '...' : '');
  openM('broadcastConfirmModal');
}

async function executeBroadcast() {
  closeM('broadcastConfirmModal');
  const msg = (document.getElementById('broadcastMsg')?.value || '').trim();
  if (!msg || !twilioConfig.endpoint || !twilioConfig.token || !twilioConfig.templateName) {
    toast('Setup WATI endpoint, token and template name first', 'err'); return;
  }
  let recipients = [];
  if (broadcastRecipient === 'all') {
    recipients = allCustomers.filter(c => c.phone).map(c => ({ name: c.name, phone: c.phone, boxId: c.boxId }));
  } else if (broadcastRecipient === 'zone') {
    const zone = document.getElementById('broadcastZone')?.value;
    recipients = allCustomers.filter(c => c.phone && c.zone && c.zone.toLowerCase() === zone).map(c => ({ name: c.name, phone: c.phone, boxId: c.boxId }));
  } else if (broadcastRecipient === 'nobox') {
    const snap = await db.collection('nobox_requests').where('date', '==', tomorrow).get();
    snap.forEach(doc => {
      const d = doc.data();
      if (d.customerPhone) {
        const cust = allCustomers.find(c => c.id === d.customerId);
        recipients.push({ name: d.customerName, phone: d.customerPhone, boxId: cust?.boxId || '' });
      }
    });
  }
  if (!recipients.length) { toast('No recipients found', 'err'); return; }

  const spEl = document.getElementById('sendProgress'); if (spEl) spEl.style.display = 'block';
  let sent = 0, failed = 0;
  for (const r of recipients) {
    const phone = '91' + r.phone.replace(/\D/g, '');
    try {
      const res = await fetch(
        `${twilioConfig.endpoint}/api/v2/sendTemplateMessage?whatsappNumber=${phone}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${twilioConfig.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            template_name: twilioConfig.templateName,
            broadcast_name: `admin_broadcast_${today}`,
            parameters: [
              { name: 'name', value: r.name || 'Customer' },
              { name: 'boxid', value: r.boxId || '—' }
            ]
          })
        }
      );
      if (res.ok) sent++; else failed++;
    } catch (e) { failed++; }
    const pct = Math.round(((sent + failed) / recipients.length) * 100);
    const spfEl = document.getElementById('sendProgressFill'); if (spfEl) spfEl.style.width = pct + '%';
    const sstEl = document.getElementById('sendStatusText'); if (sstEl) sstEl.textContent = `Sending ${sent + failed} of ${recipients.length}...`;
  }

  await db.collection('broadcast_logs').add({
    channel: 'whatsapp', templateName: twilioConfig.templateName, message: msg, recipientType: broadcastRecipient,
    totalRecipients: recipients.length, sent, failed, timestamp: Date.now()
  }).catch(() => {});
  setTimeout(() => { const spEl = document.getElementById('sendProgress'); if (spEl) spEl.style.display = 'none'; }, 3000);
  const sstEl = document.getElementById('sendStatusText'); if (sstEl) sstEl.textContent = `✅ Done! ${sent} sent, ${failed} failed.`;
  toast(`Broadcast done: ${sent}/${recipients.length} sent`, 'ok');
  loadBroadcastLog();
}

async function loadBroadcastLog() {
  const snap = await db.collection('broadcast_logs').orderBy('timestamp', 'desc').limit(20).get().catch(() => null);
  const logEl = document.getElementById('broadcastLog');
  if (!logEl) return;
  if (!snap || snap.empty) { logEl.innerHTML = '<tr><td colspan="5" class="empty-state"><div class="empty-text">No broadcasts sent yet</div></td></tr>'; return; }
  logEl.innerHTML = snap.docs.map(doc => {
    const d = doc.data();
    const t = d.timestamp ? new Date(d.timestamp).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    const ch = d.channel === 'whatsapp' ? '💬 WhatsApp' : '📱 SMS';
    return `<tr><td style="font-size:12px;color:var(--muted);font-family:var(--mono)">${t}</td><td>${ch}</td><td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${d.message || '—'}</td><td style="font-family:var(--mono);font-size:12px">${d.totalRecipients || 0}</td><td><span class="badge badge-picked">${d.sent || 0} sent</span> ${d.failed > 0 ? `<span class="badge badge-delayed">${d.failed} failed</span>` : ''}</td></tr>`;
  }).join('');
}
