// ══ HISTORY (SUPABASE-BACKED) ══

// You need a Supabase client in the browser. Add this ONE script tag to
// index.html, right before your other <script> tags at the bottom:
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

const SUPABASE_URL = "https://ksskksjnxvlwxrmaptkl.supabase.co"; // your project URL
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzc2trc2pueHZsd3hybWFwdGtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NzIyNTksImV4cCI6MjEwMjQ0ODI1OX0.KwopBYXRmpR--Kcwm8QLF2SCGX-R_Fy8L3UI0P0gXBw"; // NOT the service_role key
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

    // Build the same summary stats your old Firestore version showed
    const total = rows.length;
    const delivered = rows.filter(r => r.status === 'Delivered' || r.status === 'Picked').length;
    const delayed = rows.filter(r => r.status === 'Delayed').length;
    const rate = total > 0 ? Math.round((delivered * 100) / total) : 0;

    const totalEl = document.getElementById('hs_total'); if (totalEl) totalEl.textContent = total;
    const doneEl = document.getElementById('hs_done'); if (doneEl) doneEl.textContent = delivered;
    const delayedEl = document.getElementById('hs_delayed'); if (delayedEl) delayedEl.textContent = delayed;
    const rateEl = document.getElementById('hs_rate'); if (rateEl) rateEl.textContent = rate + '%';
    if (summaryEl) summaryEl.style.display = 'grid';

    const agF = document.getElementById('histAgentFilter')?.value || '';
    let docs = [...rows];
    if (agF) docs = docs.filter(d => d.assigned_to === agF);

    if (!docs.length) {
        if (body) body.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">🗂</div><div class="empty-text">No deliveries for this agent on ${dt}</div></td></tr>`;
        return;
    }

    // Agent-wise sort: when "All Agents" is selected, group by agent name
    // (then by pickup order within each agent) so one agent's stops read
    // together instead of interleaved by write order.
    docs.sort((a, b) => {
        const an = (agents[a.assigned_to]?.name || a.assigned_name || '~Unassigned').toLowerCase();
        const bn = (agents[b.assigned_to]?.name || b.assigned_name || '~Unassigned').toLowerCase();
        if (an !== bn) return an.localeCompare(bn);
        return (a.pickup_order || 9999) - (b.pickup_order || 9999);
    });

    const sc = { Delivered: 'badge-delivered', Picked: 'badge-picked', Delayed: 'badge-delayed', Pending: 'badge-pending' };
    let rowIdx = 0, lastAgent = null;
    body.innerHTML = docs.map(d => {
        rowIdx++;
        const ag = agents[d.assigned_to]?.name || d.assigned_name || 'Unassigned';
        const pickTime = d.picked_at || d.timestamp;
        const t = pickTime ? new Date(Number(pickTime)).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—';
        const delayedTag = (d.was_delayed && d.status !== 'Delayed') ? '<span class="badge badge-delayed" style="margin-left:5px" title="This delivery was marked Delayed earlier that day">⚠ Was Delayed</span>' : '';
        let groupRow = '';
        if (!agF && ag !== lastAgent) {
            groupRow = `<tr><td colspan="6" style="background:var(--bg);font-weight:700;font-size:11px;color:var(--accent);text-transform:uppercase;letter-spacing:.4px;padding:8px 16px">${ag}</td></tr>`;
            lastAgent = ag;
        }
        return groupRow + `<tr><td style="color:var(--muted)">${rowIdx}</td><td><strong>${d.customer_name || '—'}</strong></td><td style="font-family:var(--mono);font-size:12px;color:var(--blue)">${d.customer_phone || '—'}</td><td>${ag}</td><td><span class="badge ${sc[d.status] || 'badge-pending'}">${d.status}</span>${delayedTag}</td><td style="color:var(--muted);font-size:12px">${t}</td></tr>`;
    }).join('');
}