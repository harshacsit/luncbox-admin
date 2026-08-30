// ══ HISTORY (SUPABASE-BACKED) ══

const SUPABASE_URL = "https://ksskksjnxvlwxrmaptkl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzc2trc2pueHZsd3hybWFwdGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NzIyNTksImV4cCI6MjEwMjQ0ODI1OX0.KwopBYXRmpR--Kcwm8QLF2SCGX-R_Fy8L3UI0P0gXBw";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Holds the full loaded rows so filterHistoryTable can refilter without re-fetching
let _histRows = [];

const INDIAN_HOLIDAYS = {
  // 2025
  "2025-01-26": "Republic Day",
  "2025-02-26": "Maha Shivratri",
  "2025-03-14": "Holi",
  "2025-03-31": "Id-ul-Fitr (Eid)",
  "2025-04-10": "Mahavir Jayanti",
  "2025-04-18": "Good Friday",
  "2025-05-12": "Buddha Purnima",
  "2025-06-07": "Bakrid / Eid al-Adha",
  "2025-07-06": "Muharram",
  "2025-08-15": "Independence Day",
  "2025-09-05": "Milad-un-Nabi",
  "2025-10-02": "Mahatma Gandhi Jayanti",
  "2025-10-20": "Diwali (Deepavali)",
  "2025-11-05": "Guru Nanak Jayanti",
  "2025-12-25": "Christmas Day",

  // 2026
  "2026-01-26": "Republic Day",
  "2026-02-15": "Maha Shivratri",
  "2026-03-03": "Holi",
  "2026-03-21": "Id-ul-Fitr (Eid)",
  "2026-03-31": "Mahavir Jayanti",
  "2026-04-03": "Good Friday",
  "2026-05-01": "Buddha Purnima",
  "2026-05-27": "Id-ul-Zuha (Bakri-id)",
  "2026-06-26": "Muharram",
  "2026-08-15": "Independence Day",
  "2026-08-26": "Milad-un-Nabi / Id-e-Milad",
  "2026-10-02": "Mahatma Gandhi Jayanti",
  "2026-10-20": "Dussehra (Vijayadashami)",
  "2026-11-08": "Diwali (Deepavali)",
  "2026-11-24": "Guru Nanak Jayanti",
  "2026-12-25": "Christmas Day",

  // 2027
  "2027-01-26": "Republic Day",
  "2027-03-08": "Maha Shivratri",
  "2027-03-22": "Holi",
  "2027-03-10": "Id-ul-Fitr (Eid)",
  "2027-03-26": "Good Friday",
  "2027-04-19": "Mahavir Jayanti",
  "2027-05-20": "Buddha Purnima",
  "2027-08-15": "Independence Day",
  "2027-10-02": "Mahatma Gandhi Jayanti",
  "2027-10-09": "Dussehra (Vijayadashami)",
  "2027-10-29": "Diwali (Deepavali)",
  "2027-11-13": "Guru Nanak Jayanti",
  "2027-12-25": "Christmas Day"
};

async function fetchIndianHolidays(year) {
    const yearHolidays = {};
    Object.entries(INDIAN_HOLIDAYS).forEach(([d, name]) => {
        if (d.startsWith(year)) yearHolidays[d] = name;
    });
    try {
        const custom = JSON.parse(localStorage.getItem('lb_custom_holidays') || '{}');
        Object.entries(custom).forEach(([d, name]) => {
            if (d.startsWith(year)) yearHolidays[d] = name;
        });
    } catch (e) {}
    return yearHolidays;
}

async function loadHistoryV2() {
    const dt = document.getElementById('histDate')?.value;
    if (!dt) { toast('Select a date first', 'err'); return; }
    const body = document.getElementById('histBody');
    if (body) body.innerHTML = '<tr><td colspan="6" class="empty-state"><div class="empty-text">Loading...</div></td></tr>';
    const summaryEl = document.getElementById('historySummary');
    if (summaryEl) summaryEl.style.display = 'none';

    // Fetch holidays for the selected year
    const year = dt.split('-')[0];
    const holidays = await fetchIndianHolidays(year);
    const holidayName = holidays[dt];

    const { data: rows, error } = await sb
        .from('archived_deliveries')
        .select('*')
        .eq('archive_date', dt)
        .order('pickup_order', { ascending: true });

    if (error) {
        if (body) body.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-text">Error: ${error.message}</div></td></tr>`;
        return;
    }

    // Update holiday banner visibility and subtext
    const banner = document.getElementById('histHolidayBanner');
    const nameEl = document.getElementById('histHolidayName');
    const subtextEl = document.getElementById('histHolidaySubtext');
    if (banner) {
        if (holidayName) {
            if (nameEl) nameEl.textContent = holidayName;
            if (subtextEl) {
                subtextEl.textContent = (rows && rows.length)
                    ? '— Public Holiday (Deliveries Active / Archived)'
                    : '— Public Holiday (No Deliveries Scheduled)';
            }
            banner.style.display = 'flex';
        } else {
            banner.style.display = 'none';
        }
    }

    if (!rows || !rows.length) {
        if (body) {
            if (holidayName) {
                body.innerHTML = `<tr><td colspan="6" class="empty-state" style="padding:40px 20px"><div class="empty-icon" style="font-size:36px">🎉</div><div class="empty-text" style="font-weight:600;color:var(--amber);font-size:14px;margin-top:8px">${holidayName}</div><div class="empty-text" style="font-size:12px;color:var(--muted);margin-top:4px">This day was a Public Holiday. No deliveries were scheduled.</div></td></tr>`;
            } else {
                body.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">🗂</div><div class="empty-text">No deliveries archived for ${dt}</div></td></tr>`;
            }
        }
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

// ══ HOLIDAY LIST RENDERING FOR COLLAPSIBLE VIEW ══
async function loadYearHolidays() {
    const dt = document.getElementById('histDate')?.value || today;
    const year = dt.split('-')[0];
    const yrLabel = document.getElementById('holidayYearLabel');
    if (yrLabel) yrLabel.textContent = year;

    const el = document.getElementById('holidayList');
    if (!el) return;
    el.innerHTML = '<span style="font-size:11px;color:var(--muted)">Loading holidays for ' + year + '...</span>';

    const h = await fetchIndianHolidays(year);
    const entries = Object.entries(h).sort(([a], [b]) => a.localeCompare(b));
    if (!entries.length) {
        el.innerHTML = '<span style="font-size:11px;color:var(--muted)">No public holidays found for ' + year + '</span>';
        return;
    }

    el.innerHTML = entries.map(([d, name]) => {
        const isSelected = d === dt;
        const style = isSelected ? ';background:var(--accentbg);border-color:var(--accent);color:var(--accent)' : '';
        return `<span style="display:inline-flex;align-items:center;gap:5px;background:var(--amberbg);border:1px solid var(--border);border-radius:20px;padding:4px 10px;font-size:11px;font-weight:600;color:var(--amber)${style}">
            🎉 ${name} <span style="font-weight:400;color:var(--muted)">${d}</span>
         </span>`;
    }).join('');
}

async function _checkHolidayBanner() {
    const dt = document.getElementById('histDate')?.value;
    const banner = document.getElementById('histHolidayBanner');
    const nameEl = document.getElementById('histHolidayName');
    if (!banner) return;
    if (!dt) { banner.style.display = 'none'; return; }
    const year = dt.split('-')[0];
    const holidays = await fetchIndianHolidays(year);
    if (holidays[dt]) {
        if (nameEl) nameEl.textContent = holidays[dt];
        banner.style.display = 'flex';
    } else {
        banner.style.display = 'none';
    }
}

// Wire up: check holiday banner whenever the date changes
document.addEventListener('DOMContentLoaded', () => {
    const inp = document.getElementById('histDate');
    if (inp) inp.addEventListener('change', _checkHolidayBanner);
    _checkHolidayBanner();
});