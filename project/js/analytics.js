// ══ CUSTOMER & AGENT ANALYTICS ══

function analyticsTab(which,btn){
  document.querySelectorAll('#panel-analytics .f-btn').forEach(b=>{b.classList.remove('on');b.classList.add('off');});
  btn.classList.add('on');btn.classList.remove('off');
  document.getElementById('analyticsOverviewView').style.display=which==='overview'?'block':'none';
  document.getElementById('analyticsCustomersView').style.display=which==='customers'?'block':'none';
  document.getElementById('analyticsAgentsView').style.display=which==='agents'?'block':'none';
  if(which==='overview') refreshAnalyticsCharts();
}

function onAnalyticsScopeChange(){
  const scope=document.getElementById('analyticsScope').value;
  const picker=document.getElementById('analyticsMonthPicker');
  const rangeEl=document.getElementById('analyticsRangePicker');
  picker.style.display = scope==='month' ? 'inline-block' : 'none';
  if(scope==='month' && !picker.value) picker.value = today.slice(0,7);
  rangeEl.style.display = scope==='range' ? 'inline-flex' : 'none';
  if(scope==='range'){
    const fromEl=document.getElementById('analyticsRangeFrom'), toEl=document.getElementById('analyticsRangeTo');
    if(!toEl.value) toEl.value = today;
    if(!fromEl.value) fromEl.value = new Date(Date.now()-29*86400000).toISOString().split('T')[0];
  }
  loadAnalytics();
}

let historyCache = null;
async function loadHistoryCache(force){
  if(historyCache && !force) return historyCache;
  const snap = await db.collectionGroup('deliveries').get();
  historyCache = snap.docs.map(d=>d.data());
  return historyCache;
}

async function loadAnalytics(forceRefresh){
  const loadingEl=document.getElementById('analyticsLoading');
  if(loadingEl) loadingEl.style.display='block';
  const scope=document.getElementById('analyticsScope')?.value||'all';
  const monthVal=document.getElementById('analyticsMonthPicker')?.value||today.slice(0,7);
  const rangeFrom=document.getElementById('analyticsRangeFrom')?.value||'';
  const rangeTo=document.getElementById('analyticsRangeTo')?.value||'';
  const isMonth = scope==='month';
  const isRange = scope==='range' && rangeFrom && rangeTo;
  const isScoped = isMonth || isRange;

  const scopeLabelEl=document.getElementById('analyticsScopeLabel');
  let periodLabel;
  if(isMonth) periodLabel = new Date(monthVal+'-02').toLocaleDateString('en-IN',{month:'long',year:'numeric'});
  else if(isRange) periodLabel = `${new Date(rangeFrom+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})} – ${new Date(rangeTo+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}`;
  else periodLabel = 'All-time';
  if(scopeLabelEl) scopeLabelEl.textContent = `${periodLabel} performance, built from your daily History archives`;
  ['an_totalDelayedFlagLbl','an_totalEndedDelayedLbl','an_totalNoboxReqLbl'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    const base=id==='an_totalDelayedFlagLbl'?'Delay Flags':id==='an_totalEndedDelayedLbl'?'Ended Delayed':'No Box Requests';
    el.textContent = `${base} (${isScoped?periodLabel:'All Time'})`;
  });
  const agTitleEl=document.getElementById('analyticsAgentTitle');
  if(agTitleEl) agTitleEl.innerHTML = `Agent Performance (${isScoped?periodLabel:'All-Time'}) <span style="font-weight:400;color:var(--muted);font-size:11px">— click a row for full detail</span>`;

  try{
    const [custSnap,noboxSnap,fullHistory]=await Promise.all([
      db.collection('customers').get(),
      db.collection('nobox_requests').get(),
      loadHistoryCache(forceRefresh)
    ]);
    const histDocs = isMonth ? fullHistory.filter(d=>(d.archiveDate||'').slice(0,7)===monthVal)
      : isRange ? fullHistory.filter(d=>d.archiveDate && d.archiveDate>=rangeFrom && d.archiveDate<=rangeTo)
      : fullHistory;

    const custMap={};
    custSnap.forEach(doc=>{
      const d=doc.data();
      custMap[doc.id]={
        id:doc.id, name:d.name||'—', boxId:d.boxId||'—', zone:d.zone||'—',
        phone:d.phone||'', active:d.active!==false,
        total:0, delivered:0, noboxAgent:0, delayedFlag:0, endedDelayed:0,
        noboxReqTotal:0, noboxReqYesterday:0
      };
    });

    noboxSnap.forEach(doc=>{
      const d=doc.data();
      const c=custMap[d.customerId];
      if(!c) return;
      c.noboxReqTotal++;
      if(d.date===yesterday) c.noboxReqYesterday++;
    });

    const agentMap={};
    histDocs.forEach(d=>{
      const c=custMap[d.customerId];
      if(c){
        c.total++;
        if(d.status==='NoBox') c.noboxAgent++;
        if(d.wasDelayed) c.delayedFlag++;
        if(d.status==='Delayed') c.endedDelayed++;
        if(d.status==='Delivered'||d.status==='Picked') c.delivered++;
      }
      const auid=d.assignedTo;
      if(auid){
        if(!agentMap[auid]) agentMap[auid]={total:0,delivered:0,delayedEnded:0,delayedFlag:0,noBoxAgent:0};
        const a=agentMap[auid];
        a.total++;
        if(d.status==='Delivered'||d.status==='Picked') a.delivered++;
        if(d.status==='Delayed') a.delayedEnded++;
        if(d.wasDelayed) a.delayedFlag++;
        if(d.status==='NoBox') a.noBoxAgent++;
      }
    });

    analyticsCustomers=Object.values(custMap).sort((a,b)=>(b.delayedFlag+b.noboxAgent)-(a.delayedFlag+a.noboxAgent));
    analyticsAgents=Object.entries(agentMap).map(([uid,a])=>({
      uid, name:agents[uid]?.name||'Unknown', zone:agents[uid]?.zone||'—', email:agents[uid]?.email||'', ...a
    })).sort((a,b)=>b.total-a.total);

    const totDelayFlag=analyticsCustomers.reduce((s,c)=>s+c.delayedFlag,0);
    const totEndedDelayed=analyticsCustomers.reduce((s,c)=>s+c.endedDelayed,0);
    const totNoboxReq=analyticsCustomers.reduce((s,c)=>s+c.noboxReqTotal,0);
    const setTxt=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
    setTxt('an_totalCust',analyticsCustomers.length);
    setTxt('an_totalDelayedFlag',totDelayFlag);
    setTxt('an_totalEndedDelayed',totEndedDelayed);
    setTxt('an_totalNoboxReq',totNoboxReq);

    drawAnalyticsCustomerTable();
    drawAnalyticsAgentTable();

    if(!isScoped) applyAgentPerfToCards(fullHistory);

    analyticsLoaded=true;
  }catch(e){
    toast('Analytics load failed: '+e.message,'err');
  }
  if(loadingEl) loadingEl.style.display='none';
  refreshAnalyticsCharts();
}

let weeklyChartInstance=null, statusChartInstance=null, agentChartInstance=null;
let chartJsLoadPromise=null;

function ensureChartJsLoaded(){
  if(typeof Chart!=='undefined') return Promise.resolve(true);
  if(chartJsLoadPromise) return chartJsLoadPromise;
  chartJsLoadPromise=new Promise(resolve=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload=()=>resolve(typeof Chart!=='undefined');
    s.onerror=()=>resolve(false);
    document.head.appendChild(s);
  });
  return chartJsLoadPromise;
}

async function refreshAnalyticsCharts(){
  const overviewEl=document.getElementById('analyticsOverviewView');
  if(!overviewEl || overviewEl.style.display==='none') return;
  const ok=await ensureChartJsLoaded();
  if(!ok){
    ['weeklyTrendEmpty','statusBreakdownEmpty','agentLeaderboardEmpty'].forEach(id=>{
      const el=document.getElementById(id);
      if(el){ el.style.display='flex'; el.querySelector('.empty-text').textContent='Chart.js failed to load from both CDNs — check your internet connection and reload.'; }
    });
    return;
  }
  loadWeeklyTrend();
  renderStatusBreakdownChart();
  renderAgentLeaderboardChart();
}

async function loadWeeklyTrend(){
  const canvas=document.getElementById('weeklyTrendChart');
  const emptyEl=document.getElementById('weeklyTrendEmpty');
  if(!canvas) return;
  let snap;
  try{ snap = await db.collectionGroup('summary').get(); }
  catch(e){ if(emptyEl){emptyEl.style.display='flex';emptyEl.querySelector('.empty-text').textContent='Could not load history: '+e.message;} return; }

  if(!snap || snap.empty){
    canvas.style.display='none';
    if(emptyEl) emptyEl.style.display='flex';
    return;
  }
  canvas.style.display='block';
  if(emptyEl) emptyEl.style.display='none';

  const byWeek={};
  snap.forEach(doc=>{
    const d=doc.data();
    if(!d.date) return;
    const wk=mondayOf(d.date);
    if(!byWeek[wk]) byWeek[wk]={total:0,delivered:0};
    byWeek[wk].total+=d.totalDeliveries||0;
    byWeek[wk].delivered+=d.delivered||0;
  });

  const weeks=Object.keys(byWeek).sort().slice(-8);
  const labels=weeks.map(w=>{
    const start=new Date(w+'T00:00:00');
    const end=new Date(start); end.setDate(start.getDate()+6);
    return start.toLocaleDateString('en-IN',{day:'numeric',month:'short'})+'–'+end.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
  });
  const rates=weeks.map(w=> byWeek[w].total>0 ? Math.round((byWeek[w].delivered*100)/byWeek[w].total) : 0);
  const totals=weeks.map(w=> byWeek[w].total);

  const rangeEl=document.getElementById('weeklyChartRange');
  if(rangeEl) rangeEl.textContent = labels.length>1 ? `${labels[0]} → ${labels[labels.length-1]}` : (labels[0]||'');

  if(weeklyChartInstance) weeklyChartInstance.destroy();
  weeklyChartInstance=new Chart(canvas.getContext('2d'),{
    type:'bar',
    data:{ labels, datasets:[
      { type:'bar', label:'Total Deliveries', data:totals, backgroundColor:'rgba(230,81,0,.15)', borderRadius:4, yAxisID:'yTotal', order:2 },
      { type:'line', label:'Completion Rate %', data:rates, borderColor:'#16A34A', backgroundColor:'rgba(22,163,74,.12)', tension:.35, fill:true, pointRadius:4, pointBackgroundColor:'#16A34A', yAxisID:'yRate', order:1 }
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{position:'bottom',labels:{boxWidth:10,font:{size:11}}},
        tooltip:{callbacks:{label:c=>c.dataset.label+': '+c.formattedValue+(c.dataset.yAxisID==='yRate'?'%':'')}}
      },
      scales:{
        yTotal:{position:'left',beginAtZero:true,grid:{display:false},title:{display:true,text:'Deliveries',font:{size:10}}},
        yRate:{position:'right',beginAtZero:true,max:100,grid:{display:false},ticks:{callback:v=>v+'%'},title:{display:true,text:'Completion %',font:{size:10}}}
      }
    }
  });
}

function renderStatusBreakdownChart(){
  const overviewEl=document.getElementById('analyticsOverviewView');
  if(!overviewEl || overviewEl.style.display==='none') return;
  if(typeof Chart==='undefined') return;
  const canvas=document.getElementById('statusBreakdownChart');
  const emptyEl=document.getElementById('statusBreakdownEmpty');
  if(!canvas) return;
  const todays=allDeliveries.filter(d=>d.deliveryDate===today);
  const counts={Pending:0,Picked:0,Delayed:0,Delivered:0,NoBox:0};
  todays.forEach(d=>{ if(counts[d.status]!==undefined) counts[d.status]++; });
  const total=todays.length;

  const totalEl=document.getElementById('statusChartTotal');
  if(totalEl) totalEl.textContent = total ? total+' total today' : '';

  if(!total){
    canvas.style.display='none';
    if(emptyEl) emptyEl.style.display='flex';
    return;
  }
  canvas.style.display='block';
  if(emptyEl) emptyEl.style.display='none';

  const labels=['Pending','Picked','Delayed','Delivered','No Box'];
  const data=[counts.Pending,counts.Picked,counts.Delayed,counts.Delivered,counts.NoBox];
  const colors=['#D97706','#16A34A','#DC2626','#2563EB','#9333EA'];

  if(statusChartInstance) statusChartInstance.destroy();
  statusChartInstance=new Chart(canvas.getContext('2d'),{
    type:'doughnut',
    data:{ labels, datasets:[{ data, backgroundColor:colors, borderWidth:0, hoverOffset:6 }] },
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{
        legend:{position:'bottom',labels:{boxWidth:10,font:{size:11},padding:12}},
        tooltip:{callbacks:{label:c=>`${c.label}: ${c.raw} (${Math.round((c.raw*100)/total)}%)`}}
      }
    }
  });
}

function renderAgentLeaderboardChart(){
  const canvas=document.getElementById('agentLeaderboardChart');
  const emptyEl=document.getElementById('agentLeaderboardEmpty');
  const scopeEl=document.getElementById('agentLeaderboardScope');
  if(!canvas) return;
  if(scopeEl){
    const scope=document.getElementById('analyticsScope')?.value||'all';
    scopeEl.textContent = scope==='month' ? '— current scope: selected month' : scope==='range' ? '— current scope: custom date range' : '— current scope: all time';
  }
  const top=[...analyticsAgents].sort((a,b)=>b.total-a.total).slice(0,8);

  if(!top.length){
    canvas.style.display='none';
    if(emptyEl) emptyEl.style.display='flex';
    return;
  }
  canvas.style.display='block';
  if(emptyEl) emptyEl.style.display='none';

  const labels=top.map(a=>a.name);
  const rates=top.map(a=>a.total>0?Math.round((a.delivered*100)/a.total):0);
  const totals=top.map(a=>a.total);

  if(agentChartInstance) agentChartInstance.destroy();
  agentChartInstance=new Chart(canvas.getContext('2d'),{
    type:'bar',
    data:{ labels, datasets:[{
      label:'Completion Rate %', data:rates,
      backgroundColor:rates.map(r=> r>=80?'rgba(22,163,74,.75)': r>=50?'rgba(217,119,6,.75)':'rgba(220,38,38,.75)'),
      borderRadius:4
    }]},
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{
          label:c=>c.formattedValue+'% completed',
          afterLabel:c=>totals[c.dataIndex]+' total deliveries'
        }}
      },
      scales:{ x:{beginAtZero:true,max:100,ticks:{callback:v=>v+'%'}} }
    }
  });
}

function mondayOf(dateStr){
  const d=new Date(dateStr+'T00:00:00');
  const day=d.getDay();
  d.setDate(d.getDate()+(day===0?-6:1-day));
  return d.toISOString().split('T')[0];
}

function drawAnalyticsCustomerTable(){
  const q=(document.getElementById('analyticsCustSearch')?.value||'').toLowerCase();
  const rows=analyticsCustomers.filter(c=>!q||c.name.toLowerCase().includes(q)||c.boxId.toLowerCase().includes(q)||c.zone.toLowerCase().includes(q));
  const body=document.getElementById('analyticsCustomerBody');
  if(!body) return;
  body.innerHTML=rows.length?rows.map((c,i)=>`
    <tr onclick="openCustomerAnalytics('${c.id}')" style="cursor:pointer">
      <td style="color:var(--muted)">${i+1}</td>
      <td><span style="background:var(--accentbg);border:1px solid var(--accent);border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;color:var(--accent);font-family:var(--mono)">${c.boxId}</span></td>
      <td><strong>${c.name}</strong>${c.active?'':' <span style="color:var(--muted);font-size:10px">(paused)</span>'}</td>
      <td style="font-size:12px"><span style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:2px 7px">${c.zone}</span></td>
      <td style="text-align:center;font-family:var(--mono)">${c.total}</td>
      <td style="text-align:center;font-family:var(--mono);color:var(--purple)">${c.noboxAgent}</td>
      <td style="text-align:center;font-family:var(--mono);color:var(--amber)">${c.delayedFlag}</td>
      <td style="text-align:center;font-family:var(--mono);color:var(--red)">${c.endedDelayed}</td>
      <td style="text-align:center;font-family:var(--mono);color:var(--teal)">${c.noboxReqTotal}${c.noboxReqYesterday?` <span class="badge badge-nobox" title="Informed no-box for yesterday (${yesterday})">${c.noboxReqYesterday} yest.</span>`:''}</td>
    </tr>`).join('')
    :'<tr><td colspan="9" class="empty-state"><div class="empty-icon">👥</div><div class="empty-text">No customer history yet.</div></td></tr>';
}

function drawAnalyticsAgentTable(){
  const body=document.getElementById('analyticsAgentBody');
  if(!body) return;
  body.innerHTML=analyticsAgents.length?analyticsAgents.map((a,i)=>{
    const rate=a.total>0?Math.round((a.delivered*100)/a.total):0;
    return `<tr onclick="openAgentAnalytics('${a.uid}')" style="cursor:pointer">
      <td style="color:var(--muted)">${i+1}</td>
      <td><strong>${a.name}</strong></td>
      <td style="font-size:12px"><span style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:2px 7px">${a.zone}</span></td>
      <td style="text-align:center;font-family:var(--mono)">${a.total}</td>
      <td style="text-align:center;font-family:var(--mono);color:var(--green)">${a.delivered}</td>
      <td style="text-align:center;font-family:var(--mono);color:var(--red)">${a.delayedEnded}</td>
      <td style="text-align:center;font-family:var(--mono);color:var(--accent)">${rate}%</td>
    </tr>`;
  }).join(''):'<tr><td colspan="7" class="empty-state"><div class="empty-icon">👤</div><div class="empty-text">No agent activity yet.</div></td></tr>';
}

function openCustomerAnalytics(id){
  const c=analyticsCustomers.find(x=>x.id===id);
  if(!c){toast('No history found for this customer yet','err');return;}
  document.getElementById('caTitle').textContent=c.name+' — '+c.boxId;
  document.getElementById('caBody').innerHTML=`
    <div class="ag-stats" style="grid-template-columns:repeat(2,1fr);margin-bottom:10px">
      <div class="ag-stat"><div class="num">${c.total}</div><div class="lbl">Total Deliveries</div></div>
      <div class="ag-stat"><div class="num" style="color:var(--green)">${c.delivered}</div><div class="lbl">Completed</div></div>
      <div class="ag-stat"><div class="num" style="color:var(--purple)">${c.noboxAgent}</div><div class="lbl">No Box (Agent Reported)</div></div>
      <div class="ag-stat"><div class="num" style="color:var(--teal)">${c.noboxReqTotal}</div><div class="lbl">No Box Requests (Self)</div></div>
      <div class="ag-stat"><div class="num" style="color:var(--amber)">${c.delayedFlag}</div><div class="lbl">Times Delayed</div></div>
      <div class="ag-stat"><div class="num" style="color:var(--red)">${c.endedDelayed}</div><div class="lbl">Ended Delayed (Never Picked)</div></div>
    </div>
    ${c.noboxReqYesterday>0
      ?`<div class="info-box purple">📦 Informed No Box for yesterday (${yesterday}) — ${c.noboxReqYesterday} request(s), counted separately from their all-time total above.</div>`
      :`<div class="info-box teal">No no-box request logged for yesterday (${yesterday}).</div>`}
    <div style="font-size:12px;color:var(--muted);margin-top:10px">Zone: ${c.zone} · Phone: ${c.phone||'—'}</div>
  `;
  openM('customerAnalyticsModal');
}

function openAgentAnalytics(uid){
  const a=analyticsAgents.find(x=>x.uid===uid);
  if(!a){toast('No history found for this agent yet','err');return;}
  const rate=a.total>0?Math.round((a.delivered*100)/a.total):0;
  document.getElementById('aaTitle').textContent=a.name;
  document.getElementById('aaBody').innerHTML=`
    <div class="ag-stats" style="grid-template-columns:repeat(2,1fr);margin-bottom:10px">
      <div class="ag-stat"><div class="num">${a.total}</div><div class="lbl">Total Handled</div></div>
      <div class="ag-stat"><div class="num" style="color:var(--green)">${a.delivered}</div><div class="lbl">Completed</div></div>
      <div class="ag-stat"><div class="num" style="color:var(--red)">${a.delayedEnded}</div><div class="lbl">Ended Delayed</div></div>
      <div class="ag-stat"><div class="num" style="color:var(--amber)">${a.delayedFlag}</div><div class="lbl">Times Delayed</div></div>
      <div class="ag-stat"><div class="num" style="color:var(--purple)">${a.noBoxAgent}</div><div class="lbl">No Box Marked</div></div>
      <div class="ag-stat"><div class="num" style="color:var(--accent)">${rate}%</div><div class="lbl">Completion Rate</div></div>
    </div>
    <div class="info-box">"Total Handled" counts every archived delivery ever assigned to this agent — used here as the app-usage proxy since login/session tracking isn't wired up yet. That's a good next step once you're on Blaze.</div>
  `;
  openM('agentAnalyticsModal');
}