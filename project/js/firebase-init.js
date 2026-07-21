// ══ FIREBASE CONFIG & INITIALIZATION ══
const firebaseConfig = {
  apiKey:            "REMOVE",
  authDomain:        "REMOVED",
  projectId:         "lunchboxdelivery-3d673",
  storageBucket:     "lunchboxdelivery-3d673.firebasestorage.app",
  messagingSenderId: "979213722326",
  appId:             "REMOVED"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

// Global Shared State
let allDeliveries = [], agents = {}, allCustomers = [], parsedData = [], curFilter = 'ALL';
let inboxConvos = {}, activeConvoId = null, msgListeners = [];
let broadcastChannel = 'whatsapp', broadcastRecipient = 'all';
let analyticsLoaded = false, analyticsCustomers = [], analyticsAgents = [];

const today     = new Date().toISOString().split('T')[0];
const tomorrow  = new Date(Date.now() + 86400000).toISOString().split('T')[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

// ── AUTO SCHEDULE ──
const AUTO_RESET_HOUR  = 17; // 5 PM — Daily Reset fires automatically after this hour if not already done today
const AUTO_ASSIGN_HOUR = 10; // 10 AM — Auto Assign fires automatically after this hour if not already done today

function checkAutoSchedule(){
  const hh = new Date().getHours();
  db.collection('config').doc('app').get().then(snap => {
    const d = snap.exists ? snap.data() : {};
    if (hh >= AUTO_RESET_HOUR  && d.lastAutoReset  !== today) triggerReset(true);
    if (hh >= AUTO_ASSIGN_HOUR && d.lastAutoAssign !== today) runAssign(true);
  }).catch(() => {});
}

// ── AUTH LISTENER ──
auth.onAuthStateChanged(u => {
  if (!u) { showLoginPage(); return; }
  showDashboard();
  db.collection('users').doc(u.uid).get().then(d => {
    const nm = (d.exists && d.data().name) || u.email || 'Admin';
    const adminNameEl = document.getElementById('adminName');
    const adminAvEl = document.getElementById('adminAv');
    if (adminNameEl) adminNameEl.textContent = nm;
    if (adminAvEl) adminAvEl.textContent = nm.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  }).catch(err => {
    console.warn('Could not load admin profile doc (continuing anyway):', err.code, err.message);
    const adminNameEl = document.getElementById('adminName');
    const adminAvEl = document.getElementById('adminAv');
    if (adminNameEl) adminNameEl.textContent = u.email || 'Admin';
    if (adminAvEl) adminAvEl.textContent = 'AD';
  });
  loadAgents(); listenDeliveries(); loadCustomers();
  listenInbox(); listenNoBox(); listenAdminNotifications();
  loadTwilioConfig();
  checkAutoSchedule();
  setInterval(checkAutoSchedule, 60000);
});

function showLoginPage() {
  document.getElementById('screen-dashboard').classList.remove('active');
  document.getElementById('screen-login').classList.add('active');
  const err = document.getElementById('loginErr');
  if (err) err.textContent = '';
}

function showDashboard() {
  document.getElementById('screen-login').classList.remove('active');
  document.getElementById('screen-dashboard').classList.add('active');
}

function doLogin() {
  const e = document.getElementById('loginEmail').value.trim();
  const p = document.getElementById('loginPass').value;
  if (!e || !p) { document.getElementById('loginErr').textContent = 'Enter email and password'; return; }
  auth.signInWithEmailAndPassword(e, p).catch(err => {
    document.getElementById('loginErr').textContent = (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') ? 'Wrong email or password.' : err.message;
  });
}

function doLogout() {
  auth.signOut();
}
