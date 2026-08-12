// ══ UI NAVIGATION & UTILITY FUNCTIONS ══

const panelTitles = {
  overview: 'Dashboard',
  delayed: 'Delayed Deliveries',
  assign: 'Auto Assign',
  deliveries: 'Deliveries',
  customers: 'Customer Master List',
  import: 'Excel Import',
  inbox: 'Customer Inbox',
  broadcast: 'Broadcast Message',
  nobox: 'No Box Requests',
  agents: 'Delivery Agents',
  history: 'History',
  analytics: 'Analytics',
  reset: 'Daily Reset'
};

let _activeConfirmResolve = null;

function nav(id, el) {
  if (_activeConfirmResolve) {
    _activeConfirmResolve(false);
  }
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const targetPanel = document.getElementById('panel-' + id);
  if (targetPanel) targetPanel.classList.add('active');
  if (el) el.classList.add('active');
  
  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = panelTitles[id] || id;
  document.title = (panelTitles[id]||id) + ' · Lunchbox Admin';
  
  const markBtn = document.getElementById('btnMarkAllDelivered');
  if (markBtn) markBtn.style.display = (id === 'overview' || id === 'deliveries') ? '' : 'none';
  
  if (id === 'inbox') loadInboxPanel();
  if (id === 'nobox') loadNoBoxRequests();
  if (id === 'broadcast') loadBroadcastLog();
  if (id === 'reset') loadGlobalPin();
  if (id === 'analytics' && !analyticsLoaded) onAnalyticsScopeChange();
}

function openM(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeM(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function gv(id) {
  return (document.getElementById(id)?.value || '').trim();
}

function escQ(s) {
  return (s || '').replace(/'/g, "\\'");
}

function copyUID(uid) {
  navigator.clipboard.writeText(uid).then(() => toast('UID copied!', 'ok'));
}

let _tt;
function toast(msg, type) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(_tt);
  _tt = setTimeout(() => el.classList.remove('show'), 4000);
}

// Global Promise-based Confirmation Modal
function askConfirm(message, options = {}) {
  if (_activeConfirmResolve) {
    _activeConfirmResolve(false);
  }

  return new Promise(resolve => {
    let overlay = document.getElementById('globalConfirmModal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.id = 'globalConfirmModal';
      overlay.style.zIndex = '10000';
      overlay.innerHTML = `
        <div class="modal" style="max-width:440px">
          <div class="modal-h">
            <h3 id="globalConfirmTitle">Confirm</h3>
            <span class="modal-cl" id="globalConfirmClose">✕</span>
          </div>
          <div class="modal-b" style="font-size:13px;line-height:1.6;white-space:pre-line;color:var(--text)" id="globalConfirmMsg"></div>
          <div class="modal-f">
            <button class="topbar-btn secondary" id="globalConfirmCancel">Cancel</button>
            <button class="topbar-btn" id="globalConfirmOk">Confirm</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const titleEl = document.getElementById('globalConfirmTitle');
    const msgEl = document.getElementById('globalConfirmMsg');
    const okBtn = document.getElementById('globalConfirmOk');
    const cancelBtn = document.getElementById('globalConfirmCancel');
    const closeBtn = document.getElementById('globalConfirmClose');

    if (titleEl) titleEl.textContent = options.title || 'Confirm Action';
    if (msgEl) msgEl.textContent = message || '';
    if (okBtn) {
      okBtn.textContent = options.confirmLabel || 'Confirm';
      if (options.danger) {
        okBtn.style.background = 'var(--red)';
        okBtn.style.color = '#fff';
      } else {
        okBtn.style.background = 'var(--accent)';
        okBtn.style.color = '#fff';
      }
    }
    if (cancelBtn) cancelBtn.textContent = options.cancelLabel || 'Cancel';

    const cleanup = (val) => {
      overlay.classList.remove('open');
      document.removeEventListener('keydown', onKeyDown);
      if (okBtn) okBtn.onclick = null;
      if (cancelBtn) cancelBtn.onclick = null;
      if (closeBtn) closeBtn.onclick = null;
      overlay.onclick = null;
      _activeConfirmResolve = null;
      resolve(val);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') cleanup(false);
    };

    _activeConfirmResolve = cleanup;

    if (okBtn) okBtn.onclick = () => cleanup(true);
    if (cancelBtn) cancelBtn.onclick = () => cleanup(false);
    if (closeBtn) closeBtn.onclick = () => cleanup(false);
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(false);
    };
    document.addEventListener('keydown', onKeyDown);

    overlay.classList.add('open');
  });
}

// Attach modal overlay click-outside listeners
document.addEventListener('DOMContentLoaded', () => {
  const dateEl = document.getElementById('todayDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  const ovDateEl = document.getElementById('ov_date');
  if (ovDateEl) ovDateEl.textContent = today;

  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m) m.classList.remove('open');
    });
  });
});