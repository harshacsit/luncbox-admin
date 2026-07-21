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

function nav(id, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const targetPanel = document.getElementById('panel-' + id);
  if (targetPanel) targetPanel.classList.add('active');
  if (el) el.classList.add('active');
  
  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) pageTitle.textContent = panelTitles[id] || id;
  
  const markBtn = document.getElementById('btnMarkAllDelivered');
  if (markBtn) markBtn.style.display = (id === 'overview' || id === 'deliveries') ? '' : 'none';
  
  if (id === 'inbox') loadInboxPanel();
  if (id === 'nobox') loadNoBoxRequests();
  if (id === 'broadcast') loadBroadcastLog();
  if (id === 'reset') loadGlobalPin();
  if (id === 'analytics' && !analyticsLoaded) loadAnalytics();
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
