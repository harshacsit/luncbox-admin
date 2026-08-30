// ══ DATA EXPORT (Excel) ══
// Uses the xlsx.js library already loaded in index.html.
// All three exports run entirely in the browser — no server calls.

// ---------- CUSTOMERS ----------
function exportCustomersToExcel() {
  if (!allCustomers.length) { toast('No customers to export', 'err'); return; }
  const rows = allCustomers.map(c => ({
    'Box ID': c.boxId || '',
    'Name': c.name || '',
    'Phone': c.phone || '',
    'Pickup Location': c.pickupLocation || '',
    'Delivery Address': c.deliveryAddress || '',
    'Zone': c.zone || '',
    'Preferred Agent': (c.assignedAgent && agents[c.assignedAgent]) ? agents[c.assignedAgent].name : 'Auto',
    'Notes': c.notes || '',
    'Item Count': c.itemCount || 1
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Customers');
  XLSX.writeFile(wb, `lunchbox_customers_${today}.xlsx`);
  toast('Customer list exported!', 'ok');
}

// ---------- HISTORY EXPORT ----------
function onHistExportScopeChange() {
  const scope = document.getElementById('histExportScope')?.value;
  const startEl = document.getElementById('histExportStart');
  const endEl = document.getElementById('histExportEnd');
  const monthEl = document.getElementById('histExportMonth');
  if (startEl) startEl.style.display = scope === 'range' ? 'inline-block' : 'none';
  if (endEl) endEl.style.display = scope === 'range' ? 'inline-block' : 'none';
  if (monthEl) monthEl.style.display = scope === 'month' ? 'inline-block' : 'none';
}

async function exportHistoryToExcel() {
  const scope = document.getElementById('histExportScope')?.value || 'all';
  const start = document.getElementById('histExportStart')?.value;
  const end = document.getElementById('histExportEnd')?.value;
  const month = document.getElementById('histExportMonth')?.value;
  if (scope === 'range' && (!start || !end)) { toast('Pick a start and end date', 'err'); return; }
  if (scope === 'month' && !month) { toast('Pick a month', 'err'); return; }

  let rows;
  try {
    let s = '2020-01-01', e = today;
    if (scope === 'month') {
      s = month + '-01';
      const d = new Date(month + '-01T00:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0);
      e = d.toISOString().split('T')[0];
      toast('Reading ' + month + ' from Supabase…', 'info');
    } else if (scope === 'range') {
      s = start; e = end;
      toast(`Reading ${start} to ${end} from Supabase…`, 'info');
    } else {
      toast('Reading full history from Supabase…', 'info');
    }
    if (typeof fetchArchivedDeliveriesFromSupabase === 'function') {
      rows = await fetchArchivedDeliveriesFromSupabase(s, e, scope);
    } else {
      const { data, error } = await sb.from('archived_deliveries').select('*').gte('archive_date', s).lte('archive_date', e);
      if (error) throw new Error(error.message);
      rows = data || [];
    }
  } catch (e) {
    toast('Export failed: ' + e.message, 'err');
    return;
  }

  if (!rows || !rows.length) { toast('No history found for that period', 'err'); return; }

  const sheetRows = rows.map(d => ({
    'Date': d.archive_date || d.delivery_date || '',
    'Box ID': d.box_id || '',
    'Customer': d.customer_name || '',
    'Phone': d.customer_phone || '',
    'Agent': agents[d.assigned_to]?.name || d.assigned_name || '',
    'Status': d.status || '',
    'Was Delayed (flag)': d.was_delayed ? 'Yes' : 'No',
    'Pickup Location': d.pickup_location || '',
    'Delivery Address': d.delivery_address || '',
    'Item Count': d.item_count || 1,
    'Picked/Delivered Time': (d.picked_at || d.timestamp) ? new Date(Number(d.picked_at || d.timestamp)).toLocaleString('en-IN') : ''
  }));
  const ws = XLSX.utils.json_to_sheet(sheetRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'History');
  const label = scope === 'month' ? month : scope === 'range' ? `${start}_to_${end}` : 'all_time';
  XLSX.writeFile(wb, `lunchbox_history_${label}.xlsx`);
  toast('History exported!', 'ok');
}

// ---------- ANALYTICS EXPORT ----------
// Exports whatever is currently loaded in the Analytics panel (Customers +
// Agents breakdown, as two sheets) for whichever scope is selected there
// (All Time / Specific Month / Date Range) — load/refresh Analytics first.
function exportAnalyticsToExcel() {
  if (!analyticsCustomers.length && !analyticsAgents.length) {
    toast('Load the Analytics tab first', 'err'); return;
  }
  const custRows = analyticsCustomers.map(c => ({
    'Box ID': c.boxId, 'Name': c.name, 'Zone': c.zone,
    'Total Deliveries': c.total, 'Completed': c.delivered,
    'No Box (Agent Reported)': c.noboxAgent, 'Times Delayed': c.delayedFlag,
    'Ended Delayed': c.endedDelayed, 'No Box Requests (Self)': c.noboxReqTotal
  }));
  const agentRows = analyticsAgents.map(a => ({
    'Agent': a.name, 'Zone': a.zone, 'Total Handled': a.total,
    'Completed': a.delivered, 'Ended Delayed': a.delayedEnded,
    'Times Delayed': a.delayedFlag, 'No Box Marked': a.noBoxAgent,
    'Completion Rate %': a.total > 0 ? Math.round((a.delivered * 100) / a.total) : 0
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(custRows), 'Customers');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(agentRows), 'Agents');
  const scope = document.getElementById('analyticsScope')?.value || 'all';
  const label = scope === 'month' ? (document.getElementById('analyticsMonthPicker')?.value || 'month')
              : scope === 'range' ? `${document.getElementById('analyticsRangeStart')?.value || '?'}_to_${document.getElementById('analyticsRangeEnd')?.value || '?'}`
              : 'all_time';
  XLSX.writeFile(wb, `lunchbox_analytics_${label}.xlsx`);
  toast('Analytics exported!', 'ok');
}