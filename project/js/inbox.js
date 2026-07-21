// ══ CUSTOMER MESSAGING / INBOX ══

let allConvos = [];

function listenInbox() {
  db.collection('messages').orderBy('timestamp', 'desc').onSnapshot(snap => {
    const groups = {};
    snap.forEach(doc => {
      const m = doc.data(); m.id = doc.id;
      if (!groups[m.customerId]) groups[m.customerId] = { customerId: m.customerId, customerName: m.customerName, customerPhone: m.customerPhone, messages: [], unread: 0 };
      groups[m.customerId].messages.push(m);
      if (!m.read && m.from === 'customer') groups[m.customerId].unread++;
    });
    allConvos = Object.values(groups);
    const total = allConvos.reduce((s, c) => s + c.unread, 0);
    const badge = document.getElementById('inboxBadge');
    if (badge) {
      badge.style.display = total > 0 ? '' : 'none';
      badge.textContent = total;
    }
    const ov = document.getElementById('ov_msgs'); if (ov) ov.textContent = total;
    const panelInbox = document.getElementById('panel-inbox');
    if (panelInbox && panelInbox.classList.contains('active')) renderInboxList();
  }, () => {});
}

function loadInboxPanel() { renderInboxList(); }
function filterInbox() { renderInboxList(); }

function renderInboxList() {
  const q = (document.getElementById('inboxSearch')?.value || '').toLowerCase();
  const filtered = allConvos.filter(c => !q || (c.customerName || '').toLowerCase().includes(q) || (c.customerPhone || '').includes(q));
  const listEl = document.getElementById('inboxList');
  if (!listEl) return;
  if (!filtered.length) {
    listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">💬</div><div class="empty-text">No conversations</div></div>';
    return;
  }
  listEl.innerHTML = filtered.map(c => {
    const last = c.messages[0] || {};
    const t = last.timestamp ? new Date(last.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
    const initials = (c.customerName || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    return `<div class="inbox-item ${c.unread ? 'unread' : ''} ${activeConvoId === c.customerId ? 'active' : ''}" onclick="openConvo('${c.customerId}')">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:34px;height:34px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div class="inbox-name">${c.customerName || c.customerPhone || 'Unknown'}</div>
            <div class="inbox-time">${t}</div>
          </div>
          <div class="inbox-preview">${last.text || ''}</div>
        </div>
        ${c.unread ? '<div class="inbox-dot"></div>' : ''}
      </div>
    </div>`;
  }).join('');
}

function openConvo(customerId) {
  activeConvoId = customerId;
  renderInboxList();
  const convo = allConvos.find(c => c.customerId === customerId);
  if (!convo) return;
  const initials = (convo.customerName || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const chatArea = document.getElementById('chatArea');
  if (!chatArea) return;
  chatArea.innerHTML = `
    <div class="chat-header">
      <div class="chat-av">${initials}</div>
      <div>
        <div style="font-size:14px;font-weight:600">${convo.customerName || 'Customer'}</div>
        <div style="font-size:11px;color:var(--muted)">${convo.customerPhone || ''}</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="topbar-btn secondary" style="font-size:11px" onclick="callCustomer('${convo.customerPhone}')">📞 Call</button>
      </div>
    </div>
    <div class="chat-messages" id="chatMessages">
      ${[...convo.messages].reverse().map(m => {
        const t = m.timestamp ? new Date(m.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
        const isAdmin = m.from === 'admin';
        return `<div class="msg-bubble ${isAdmin ? 'admin' : 'customer'}">${m.text || ''}<span class="msg-time">${t}</span></div>`;
      }).join('')}
    </div>
    <div class="chat-input-row">
      <input class="chat-inp" id="adminReplyInp" placeholder="Reply to ${convo.customerName || 'customer'}..." onkeydown="if(event.key==='Enter')sendAdminReply('${customerId}','${escQ(convo.customerName)}','${convo.customerPhone || ''}')">
      <button class="chat-send" onclick="sendAdminReply('${customerId}','${escQ(convo.customerName)}','${convo.customerPhone || ''}')">Send</button>
    </div>`;

  convo.messages.filter(m => !m.read && m.from === 'customer').forEach(m => {
    db.collection('messages').doc(m.id).update({ read: true }).catch(() => {});
  });
  setTimeout(() => { const cm = document.getElementById('chatMessages'); if (cm) cm.scrollTop = cm.scrollHeight; }, 100);
}

async function sendAdminReply(customerId, customerName, customerPhone) {
  const inp = document.getElementById('adminReplyInp');
  const txt = (inp?.value || '').trim();
  if (!txt) return;
  inp.value = '';
  try {
    await db.collection('messages').add({
      customerId, customerName, customerPhone,
      text: txt, from: 'admin', timestamp: Date.now(), read: true
    });
    toast('Reply sent', 'ok');
  } catch (e) { toast('Error: ' + e.message, 'err'); }
}

function callCustomer(phone) {
  if (!phone) { toast('No phone number', 'err'); return; }
  window.open('tel:' + phone);
}

function listenAdminNotifications() {
  db.collection('admin_notifications').where('read', '==', false)
    .onSnapshot(snap => {
      if (!snap.empty) {
        snap.forEach(doc => {
          const n = doc.data();
          if (n.type === 'message') toast('💬 ' + n.message?.substring(0, 60), 'info');
          if (n.type === 'nobox') toast('📦 ' + n.message?.substring(0, 60), 'info');
          db.collection('admin_notifications').doc(doc.id).update({ read: true }).catch(() => {});
        });
      }
    }, () => {});
}
