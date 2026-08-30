// ══ HISTORY (SUPABASE-BACKED) ══

const SUPABASE_URL = "https://ksskksjnxvlwxrmaptkl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzc2trc2pueHZsd3hybWFwdGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NzIyNTksImV4cCI6MjEwMjQ0ODI1OX0.KwopBYXRmpR--Kcwm8QLF2SCGX-R_Fy8L3UI0P0gXBw";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Holds the full loaded rows so filterHistoryTable can refilter without re-fetching
let _histRows = [];

async function loadHistoryV2() {
    const dt = document.getElementById('histDate')?.value;
    if (!dt) { toast('Select a date first', 'err'); return; }
    const body = document.getElementById('histBody');
    if (body) body.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-text">Loading...</div></td></tr>';
    const summaryEl = document.getElementById('historySummary');
    if (summaryEl) summaryEl.style.display = 'none';

    const { data: rows, error } = await sb
        .from('archived_deliveries')
        .select('*')
        .eq('archive_date', dt)
        .order('pickup_order', { ascending: true });

    if (error) {
        if (body) body.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-text">Error: ${error.message}</div></td></tr>`;
        return;
    }

    if (!rows || !rows.length) {
        if (body) body.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">🗂</div><div class="empty-text">No deliveries archived for ${dt}</div></td></tr>`;
        return;
    }

    _histRows = rows; // store for filter reuse

    // --- Summary stats ---
    const total    = rows.length;
    const delivered = rows.filter(r => r.status === 'Delivered' || r.status === 'Picked').length;
    const delayed   = rows.filter(r => r.status === 'Delayed').length;
    const nobox     = rows.filter(r => r.status === 'NoBox').length;
    const rate      = total > 0 ? Math.round((delivered * 100) / total) : 0;

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('hs_total',   total);
    set('hs_done',    delivered);
    set('hs_delayed', delayed);
    set('hs_nobox',   nobox);
    set('hs_rate',    rate + '%');
    if (summaryEl) summaryEl.style.display = 'grid';

    // Reset active card highlight
    _histSetActiveCard('all');

    // Render with current agent filter, no status filter
    _renderHistoryRows(rows, '');
}

// Called by stat card onclick – filters table without re-fetching Supabase
function filterHistoryTable(status) {
    if (!_histRows.length) return;
    _histSetActiveCard(status);
    _renderHistoryRows(_histRows, status);
}

function _histSetActiveCard(status) {
    ['all', 'done', 'Delayed', 'NoBox', 'rate'].forEach(k => {
        const el = document.getElementById('hscard_' + k);
        if (el) el.classList.remove('active-stat');
    });
    const active = document.getElementById('hscard_' + status);
    if (active) active.classList.add('active-stat');
}

function _renderHistoryRows(rows, statusFilter) {
    const agF  = document.getElementById('histAgentFilter')?.value || '';
    const body = document.getElementById('histBody');
    if (!body) return;

    let docs = [...rows];

    // Agent filter
    if (agF) docs = docs.filter(d => d.assigned_to === agF);

    // Status filter from card click
    if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'done') {
            docs = docs.filter(d => d.status === 'Delivered' || d.status === 'Picked');
        } else {
            docs = docs.filter(d => d.status === statusFilter);
        }
    }

    if (!docs.length) {
        body.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">🗂</div><div class="empty-text">No matching deliveries</div></td></tr>`;
        return;
    }

    // Agent-wise sort + grouping
    docs.sort((a, b) => {
        const an = (agents[a.assigned_to]?.name || a.assigned_name || '~Unassigned').toLowerCase();
        const bn = (agents[b.assigned_to]?.name || b.assigned_name || '~Unassigned').toLowerCase();
        if (an !== bn) return an.localeCompare(bn);
        return (a.pickup_order || 9999) - (b.pickup_order || 9999);
    });

    const sc = { Delivered: 'badge-delivered', Picked: 'badge-picked', Delayed: 'badge-delayed', Pending: 'badge-pending', NoBox: 'badge-nobox' };
    let rowIdx = 0, lastAgent = null;
    body.innerHTML = docs.map(d => {
        rowIdx++;
        const ag = agents[d.assigned_to]?.name || d.assigned_name || 'Unassigned';
        const pickTime = d.picked_at || d.timestamp;
        const t = pickTime ? new Date(Number(pickTime)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
        const delayedTag = (d.was_delayed && d.status !== 'Delayed') ? '<span class="badge badge-delayed" style="margin-left:5px" title="Was Delayed earlier">⚠</span>' : '';
        let groupRow = '';
        if (!agF && ag !== lastAgent) {
            groupRow = `<tr><td colspan="6" style="background:var(--bg);font-weight:700;font-size:11px;color:var(--accent);text-transform:uppercase;letter-spacing:.4px;padding:8px 16px">${ag}</td></tr>`;
            lastAgent = ag;
        }
        return groupRow + `<tr><td style="color:var(--muted)">${rowIdx}</td><td><strong>${d.customer_name || '—'}</strong></td><td style="font-family:var(--mono);font-size:12px;color:var(--blue)">${d.customer_phone || '—'}</td><td>${ag}</td><td><span class="badge ${sc[d.status] || 'badge-pending'}">${d.status}</span>${delayedTag}</td><td style="color:var(--muted);font-size:12px">${t}</td></tr>`;
    }).join('');
}

// ══ HOLIDAY MANAGER ══
// Holidays stored in localStorage so they persist across sessions without a backend.
// Format: { "2026-08-15": "Independence Day", "2026-10-02": "Gandhi Jayanti" }

function _getHolidays() {
    try { return JSON.parse(localStorage.getItem('lb_holidays') || '{}'); }
    catch { return {}; }
}

function _saveHolidays(h) {
    localStorage.setItem('lb_holidays', JSON.stringify(h));
}

function addHoliday() {
    const dt   = document.getElementById('holidayDateInp')?.value;
    const name = (document.getElementById('holidayNameInp')?.value || '').trim();
    if (!dt)   { toast('Select a date for the holiday', 'err'); return; }
    if (!name) { toast('Enter a holiday name', 'err'); return; }
    const h = _getHolidays();
    h[dt] = name;
    _saveHolidays(h);
    renderHolidayList();
    document.getElementById('holidayDateInp').value  = '';
    document.getElementById('holidayNameInp').value  = '';
    toast('Holiday added: ' + name, 'ok');
    // If the current histDate matches, show the banner immediately
    _checkHolidayBanner();
}

function removeHoliday(dt) {
    const h = _getHolidays();
    delete h[dt];
    _saveHolidays(h);
    renderHolidayList();
    _checkHolidayBanner();
    toast('Holiday removed', 'ok');
}

function renderHolidayList() {
    const el = document.getElementById('holidayList');
    if (!el) return;
    const h = _getHolidays();
    const entries = Object.entries(h).sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) {
        el.innerHTML = '<span style="font-size:11px;color:var(--muted)">No holidays added yet</span>';
        return;
    }
    el.innerHTML = entries.map(([dt, name]) =>
        `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--amberbg);border:1px solid var(--amber);border-radius:20px;padding:4px 10px;font-size:11px;font-weight:600;color:var(--amber)">
            🎉 ${name} <span style="font-weight:400;color:var(--muted)">${dt}</span>
            <span onclick="removeHoliday('${dt}')" style="cursor:pointer;color:var(--red);font-weight:700;margin-left:2px" title="Remove">✕</span>
         </span>`
    ).join('');
}

function _checkHolidayBanner() {
    const dt      = document.getElementById('histDate')?.value;
    const banner  = document.getElementById('histHolidayBanner');
    const nameEl  = document.getElementById('histHolidayName');
    if (!banner) return;
    const h = _getHolidays();
    if (dt && h[dt]) {
        if (nameEl) nameEl.textContent = h[dt];
        banner.style.display = 'flex';
    } else {
        banner.style.display = 'none';
    }
}

// Wire up: check holiday banner whenever the date changes
document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('histDate');
    if (inp) inp.addEventListener('change', _checkHolidayBanner);
    renderHolidayList();
});