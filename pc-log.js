
'use strict';

const PC_KEY='cp_pclog_v25';
const DEFAULT_PC={
  scenario:{incident:'Testincident',grip:'Geen GRIP',phase:'Inzet',commander:'',location:'',notes:''},
  platoons:[],
  air:[],
  rehab:[],
  water:[],
  foam:[],
  equipment:[],
  requests:[],
  actions:[],
  decisions:[],
  diary:[]
};
let pcState=Object.assign({},DEFAULT_PC,JSON.parse(localStorage.getItem(PC_KEY)||'{}'));
for(const k of ['platoons','air','rehab','water','foam','equipment','requests','actions','decisions','diary']){
  if(!Array.isArray(pcState[k])) pcState[k]=[];
}
function pcSave(){localStorage.setItem(PC_KEY,JSON.stringify(pcState));}
function pcId(){return (crypto.randomUUID?crypto.randomUUID():'pc-'+Date.now()+'-'+Math.random().toString(36).slice(2));}
function pcEsc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function addDiary(text,category='PC Log'){
  pcState.diary.unshift({id:pcId(),time:new Date().toISOString(),category,text});
  pcSave();
}
window.PCLOG={addDiary};

function pcInit(){
  document.querySelectorAll('.logtab').forEach(b=>b.onclick=()=>switchLogTab(b.dataset.logtab));
  const ids=['newPlatoon','addAir','addRehab','addWater','addFoam','addEquipment','newRequest','newAction','newDecision'];
  ids.forEach(id=>{const el=document.getElementById(id);if(el)el.onclick=()=>openPcDialog(id);});
  document.getElementById('savePcDialog').onclick=savePcDialog;
  document.getElementById('refreshOperational').onclick=renderPcLog;
  renderPcLog();
}
document.addEventListener('DOMContentLoaded',pcInit);

function switchLogTab(name){
  document.querySelectorAll('.logtab').forEach(b=>b.classList.toggle('active',b.dataset.logtab===name));
  document.querySelectorAll('.logpane').forEach(p=>p.classList.toggle('active',p.id===`logpane-${name}`));
}

const DIALOGS={
  newPlatoon:{title:'Nieuw peloton',type:'platoon',fields:[
    ['name','Naam peloton','text','Peloton 1'],['commander','Pelotonscommandant','text',''],
    ['personnel','Personeel','number','32'],['vehicles','Voertuigen','number','8'],
    ['air','Ademlucht %','number','100'],['water','Water %','number','100'],
    ['foam','Schuim %','number','100'],['food','Voeding','select','Nee|Geregeld|Onderweg'],
    ['rest','Rustlocatie','select','Nee|Geregeld|In gebruik'],['sector','Sector/inzetvak','text','']
  ]},
  addAir:{title:'Ademlucht registreren',type:'air',fields:[
    ['unit','Eenheid/peloton','text',''],['available','Beschikbare cilinders','number','6'],
    ['used','Gebruikt','number','0'],['expected','Verwacht wisselmoment','datetime-local',''],
    ['exchange','Wisselpunt','text',''],['post','Post/locatie','text','']
  ]},
  addRehab:{title:'Rehab registreren',type:'rehab',fields:[
    ['unit','Ploeg/peloton','text',''],['people','Aantal personen','number','6'],
    ['drink','Drinken','select','Niet nodig|Nodig|Geregeld'],['food','Voeding','select','Niet nodig|Nodig|Geregeld'],
    ['rest','Rust','select','Niet nodig|Nodig|In rust'],['medical','Medische controle','select','Nee|Geadviseerd|Uitgevoerd'],
    ['location','Rehablocatie','text',''],['due','Volgende controle','datetime-local','']
  ]},
  addWater:{title:'Waterlogistiek registreren',type:'water',fields:[
    ['unit','Voertuig/waterpunt','text',''],['kind','Type','select','Watertankwagen|Waterpunt|Dompelpomp|WTS|Overig'],
    ['status','Status','select','Beschikbaar|Onderweg|Ter plaatse|Ingezet|Uitgeput'],
    ['capacity','Capaciteit/voorraad %','number','100'],['location','Locatie/post','text',''],['eta','Verwachte aankomst','datetime-local','']
  ]},
  addFoam:{title:'Schuimlogistiek registreren',type:'foam',fields:[
    ['unit','Eenheid/voorraad','text',''],['kind','Type schuim','text',''],
    ['status','Status','select','Beschikbaar|Onderweg|Ter plaatse|Ingezet|Uitgeput'],
    ['capacity','Voorraad %','number','100'],['amount','Hoeveelheid','text',''],['location','Locatie/post','text','']
  ]},
  addEquipment:{title:'Materieel toevoegen',type:'equipment',fields:[
    ['name','Materieel','text','Lichtmast'],['amount','Aantal','number','1'],
    ['status','Status','select','Beschikbaar|Aangevraagd|Onderweg|Ter plaatse|Ingezet|Defect'],
    ['location','Locatie/post','text',''],['owner','Beheerder/eenheid','text','']
  ]},
  newRequest:{title:'Nieuw logistiek verzoek',type:'request',fields:[
    ['request','Verzoek','text',''],['requester','Aanvrager/OSC','text',''],['priority','Prioriteit','select','Normaal|Hoog|Spoed'],
    ['status','Status','select','Nieuw|Onderweg|Uitgevoerd'],['location','Bestemming','text',''],['assigned','Toegewezen aan','text',''],['eta','ETA','datetime-local','']
  ]},
  newAction:{title:'Nieuw CoPI-actiepunt',type:'action',fields:[
    ['text','Actiepunt','text',''],['owner','Eigenaar','text',''],['due','Deadline','datetime-local',''],['status','Status','select','Open|Bezig|Gereed']
  ]},
  newDecision:{title:'Nieuw CoPI-besluit',type:'decision',fields:[
    ['text','Besluit','text',''],['owner','Besluit door','text',''],['effect','Gevolg/uitwerking','text','']
  ]}
};
let dialogConfig=null;
function openPcDialog(buttonId){
  dialogConfig=DIALOGS[buttonId];if(!dialogConfig)return;
  document.getElementById('pcDialogTitle').textContent=dialogConfig.title;
  document.getElementById('pcDialogType').value=dialogConfig.type;
  document.getElementById('pcDialogFields').innerHTML=dialogConfig.fields.map(([id,label,type,def])=>{
    if(type==='select'){
      return `<label>${pcEsc(label)}<select id="pcf-${id}">${def.split('|').map(v=>`<option>${pcEsc(v)}</option>`).join('')}</select></label>`;
    }
    return `<label>${pcEsc(label)}<input id="pcf-${id}" type="${type}" value="${pcEsc(def)}"></label>`;
  }).join('');
  document.getElementById('pcLogDialog').showModal();
}
function savePcDialog(){
  if(!dialogConfig)return;
  const item={id:pcId(),created:new Date().toISOString()};
  dialogConfig.fields.forEach(([id])=>item[id]=document.getElementById(`pcf-${id}`).value);
  const map={platoon:'platoons',air:'air',rehab:'rehab',water:'water',foam:'foam',equipment:'equipment',request:'requests',action:'actions',decision:'decisions'};
  pcState[map[dialogConfig.type]].push(item);
  addDiary(`${dialogConfig.title}: ${item.name||item.unit||item.request||item.text||''}`,dialogConfig.type);
  pcSave();document.getElementById('pcLogDialog').close();renderPcLog();
}

function renderPcLog(){
  renderOperation();renderPlatoons();renderAir();renderRehab();renderWater();renderFoam();renderEquipment();
  renderRequests();renderCopi();renderDiary();renderLogisticsMap();
}

function renderOperation(){
  const activeUnits=state.units.filter(u=>active(u));
  document.getElementById('opPlatoons').textContent=pcState.platoons.length;
  document.getElementById('opRequests').textContent=pcState.requests.filter(r=>r.status!=='Uitgevoerd').length;
  const airVals=pcState.platoons.map(p=>Number(p.air||100)).concat(pcState.air.map(a=>{
    const av=Number(a.available||0),used=Number(a.used||0);return av+used?Math.round(av/(av+used)*100):100;
  }));
  document.getElementById('opAir').textContent=(airVals.length?Math.round(airVals.reduce((a,b)=>a+b,0)/airVals.length):100)+'%';
  document.getElementById('opRehab').textContent=pcState.rehab.filter(r=>['Nodig','Geadviseerd'].includes(r.drink)||['Nodig','Geadviseerd'].includes(r.food)||r.rest==='Nodig').length;
  document.getElementById('opWater').textContent=pcState.water.filter(w=>Number(w.capacity)<30||w.status==='Uitgeput').length;
  document.getElementById('opFoam').textContent=pcState.foam.filter(w=>Number(w.capacity)<30||w.status==='Uitgeput').length;
  renderAlerts(activeUnits);renderScenario(activeUnits);renderCoverage();renderReliefAdvice(activeUnits);
}
function renderAlerts(activeUnits){
  const alerts=[];
  activeUnits.forEach(u=>{
    const h=hoursSince(u.startTime);
    if(h>=4)alerts.push({level:'danger',text:`${unitLabel(u)} is ${duration(h)} ingezet: aflossing noodzakelijk.`});
    else if(h>=3&&!((u.reliefs||[]).length))alerts.push({level:'',text:`${unitLabel(u)} is ${duration(h)} ingezet en heeft nog geen aflossing.`});
  });
  pcState.requests.filter(r=>r.priority==='Spoed'&&r.status!=='Uitgevoerd').forEach(r=>alerts.push({level:'danger',text:`Spoedverzoek open: ${r.request}`}));
  pcState.water.filter(w=>Number(w.capacity)<30).forEach(w=>alerts.push({level:'info',text:`Watercapaciteit laag: ${w.unit} (${w.capacity}%).`}));
  pcState.foam.filter(w=>Number(w.capacity)<30).forEach(w=>alerts.push({level:'info',text:`Schuimvoorraad laag: ${w.unit} (${w.capacity}%).`}));
  pcState.platoons.filter(p=>Number(p.air)<30).forEach(p=>alerts.push({level:'danger',text:`Ademlucht peloton ${p.name} onder 30%.`}));
  document.getElementById('autoAlerts').innerHTML=alerts.length?alerts.map(a=>`<div class="alertitem ${a.level}">${pcEsc(a.text)}</div>`).join(''):'<div class="listitem">Geen automatische waarschuwingen.</div>';
}
function renderScenario(activeUnits){
  const personnel=activeUnits.reduce((s,u)=>s+Number(u.crew||0),0);
  const planned=activeUnits.filter(u=>(u.reliefs||[]).length).length;
  const missing=activeUnits.length-planned;
  const s=pcState.scenario;
  const fields=[['Incident',s.incident],['GRIP',s.grip],['Fase',s.phase],['Pelotons',pcState.platoons.length],['Personeel',personnel],['Voertuigen',activeUnits.length],['Aflossingen gepland',planned],['Aflossingen ontbreken',missing],['Open verzoeken',pcState.requests.filter(r=>r.status!=='Uitgevoerd').length]];
  document.getElementById('scenarioSummary').innerHTML=fields.map(([k,v])=>`<div><strong>${pcEsc(k)}</strong>${pcEsc(v)}</div>`).join('');
}
function renderCoverage(){
  const activeNums=new Set(state.units.filter(u=>active(u)&&u.source==='VGGM').map(u=>u.callsign));
  document.getElementById('coverageByArea').innerHTML=Object.entries(AREAS).map(([area,posts])=>{
    let tsTotal=0,tsFree=0,special=0;
    posts.forEach(p=>(VEHICLES[p]||[]).forEach(v=>{
      const isTs=v.type.toLowerCase().includes('tankautospuit');
      if(isTs){tsTotal++;if(!activeNums.has(v.number))tsFree++;}
      else if(!activeNums.has(v.number)&&/hoogwerker|hulpverlening|watertank|brandweervaartuig|oppervlakte/i.test(v.type))special++;
    }));
    return `<div class="coverage-row"><strong>${pcEsc(area)}</strong><span class="${tsFree<2?'critical':''}">TS vrij ${tsFree}/${tsTotal}</span><span>Specialismen vrij ${special}</span><span>Posten ${posts.length}</span><span>${tsFree<2?'⚠️ dunne dekking':'✓'}</span></div>`;
  }).join('');
}
function distancePosts(a,b){
  const A=POST_COORDS[a],B=POST_COORDS[b];if(!A||!B)return 999;
  return Math.hypot(A[0]-B[0],A[1]-B[1]);
}
function renderReliefAdvice(activeUnits){
  const used=new Set(activeUnits.map(u=>u.callsign));
  const advice=activeUnits.filter(u=>hoursSince(u.startTime)>=2.5).slice(0,8).map(u=>{
    if(u.source!=='VGGM')return `<div class="advice-card"><strong>${pcEsc(unitLabel(u))}</strong>Externe eenheid: aflossing handmatig coördineren.</div>`;
    const wanted=(u.type||'').toLowerCase();
    const candidates=[];
    Object.entries(VEHICLES).forEach(([post,list])=>list.forEach(v=>{
      if(!used.has(v.number)&&((wanted.includes('tankautospuit')&&v.type.toLowerCase().includes('tankautospuit'))||v.type.toLowerCase()===wanted)){
        const d=distancePosts(u.post,post);candidates.push({post,...v,d,minutes:Math.max(8,Math.round(d*1.6))});
      }
    }));
    candidates.sort((a,b)=>a.d-b.d);
    const list=candidates.slice(0,3).map((c,i)=>`${i+1}. ${c.number} • ${c.post} • indicatief ${c.minutes} min`).join('<br>');
    return `<div class="advice-card"><strong>${pcEsc(unitLabel(u))} · ${duration(hoursSince(u.startTime))}</strong>${list||'Geen passende vrije eenheid gevonden.'}<div class="small">Indicatief op basis van kaartafstand; controleer restdekking en werkelijke reistijd.</div></div>`;
  });
  document.getElementById('reliefAdvice').innerHTML=advice.length?advice.join(''):'<div class="listitem">Nog geen eenheden waarvoor aflossingsadvies nodig is.</div>';
}

function pctBar(value){
  const n=Math.max(0,Math.min(100,Number(value||0))),cls=n<30?'danger':n<60?'warn':'';
  return `<div class="progress ${cls}"><span style="width:${n}%"></span></div>`;
}
function renderPlatoons(){
  document.getElementById('platoonCards').innerHTML=pcState.platoons.map(p=>`<article class="platoon-card">
    <div class="cardhead"><div><strong>${pcEsc(p.name)}</strong><div class="small">${pcEsc(p.commander)} · ${pcEsc(p.sector)}</div></div><button class="danger" onclick="pcRemove('platoons','${p.id}')">Verwijder</button></div>
    <div class="platoon-grid">
      <div class="metric"><strong>Personeel</strong>${pcEsc(p.personnel)}</div><div class="metric"><strong>Voertuigen</strong>${pcEsc(p.vehicles)}</div>
      <div class="metric"><strong>Ademlucht</strong>${pcEsc(p.air)}%${pctBar(p.air)}</div><div class="metric"><strong>Water</strong>${pcEsc(p.water)}%${pctBar(p.water)}</div>
      <div class="metric"><strong>Schuim</strong>${pcEsc(p.foam)}%${pctBar(p.foam)}</div><div class="metric"><strong>Voeding</strong>${pcEsc(p.food)}</div>
      <div class="metric"><strong>Rustlocatie</strong>${pcEsc(p.rest)}</div><div class="metric"><strong>Sector</strong>${pcEsc(p.sector)}</div>
    </div></article>`).join('')||'<div class="listitem">Nog geen pelotons geregistreerd.</div>';
}
function tableHtml(headers,rows){
  return `<table class="data-table"><thead><tr>${headers.map(h=>`<th>${pcEsc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}
function renderAir(){
  document.getElementById('airTable').innerHTML=tableHtml(['Eenheid','Beschikbaar','Gebruikt','Wisselmoment','Wisselpunt','Acties'],pcState.air.map(a=>`<tr><td>${pcEsc(a.unit)}</td><td>${pcEsc(a.available)}</td><td>${pcEsc(a.used)}</td><td>${a.expected?new Date(a.expected).toLocaleString('nl-NL'):'-'}</td><td>${pcEsc(a.exchange)}</td><td><button class="danger" onclick="pcRemove('air','${a.id}')">×</button></td></tr>`));
}
function renderRehab(){
  document.getElementById('rehabTable').innerHTML=tableHtml(['Ploeg','Personen','Drinken','Voeding','Rust','Medisch','Locatie','Acties'],pcState.rehab.map(a=>`<tr><td>${pcEsc(a.unit)}</td><td>${pcEsc(a.people)}</td><td>${pcEsc(a.drink)}</td><td>${pcEsc(a.food)}</td><td>${pcEsc(a.rest)}</td><td>${pcEsc(a.medical)}</td><td>${pcEsc(a.location)}</td><td><button class="danger" onclick="pcRemove('rehab','${a.id}')">×</button></td></tr>`));
}
function renderWater(){
  document.getElementById('waterTable').innerHTML=tableHtml(['Eenheid','Type','Status','Capaciteit','Locatie','ETA','Acties'],pcState.water.map(a=>`<tr><td>${pcEsc(a.unit)}</td><td>${pcEsc(a.kind)}</td><td>${pcEsc(a.status)}</td><td>${pcEsc(a.capacity)}%${pctBar(a.capacity)}</td><td>${pcEsc(a.location)}</td><td>${a.eta?new Date(a.eta).toLocaleString('nl-NL'):'-'}</td><td><button class="danger" onclick="pcRemove('water','${a.id}')">×</button></td></tr>`));
}
function renderFoam(){
  document.getElementById('foamTable').innerHTML=tableHtml(['Eenheid','Type','Status','Voorraad','Hoeveelheid','Locatie','Acties'],pcState.foam.map(a=>`<tr><td>${pcEsc(a.unit)}</td><td>${pcEsc(a.kind)}</td><td>${pcEsc(a.status)}</td><td>${pcEsc(a.capacity)}%${pctBar(a.capacity)}</td><td>${pcEsc(a.amount)}</td><td>${pcEsc(a.location)}</td><td><button class="danger" onclick="pcRemove('foam','${a.id}')">×</button></td></tr>`));
}
function renderEquipment(){
  document.getElementById('equipmentTable').innerHTML=tableHtml(['Materieel','Aantal','Status','Locatie','Beheerder','Acties'],pcState.equipment.map(a=>`<tr><td>${pcEsc(a.name)}</td><td>${pcEsc(a.amount)}</td><td>${pcEsc(a.status)}</td><td>${pcEsc(a.location)}</td><td>${pcEsc(a.owner)}</td><td><button class="danger" onclick="pcRemove('equipment','${a.id}')">×</button></td></tr>`));
}
window.pcRemove=(collection,id)=>{
  const item=pcState[collection].find(x=>x.id===id);pcState[collection]=pcState[collection].filter(x=>x.id!==id);
  addDiary(`Verwijderd uit ${collection}: ${item?.name||item?.unit||item?.request||item?.text||''}`,'Wijziging');pcSave();renderPcLog();
};

function requestColumn(status,id){
  const rows=pcState.requests.filter(r=>r.status===status).map(r=>`<div class="kancard"><strong>${pcEsc(r.request)}</strong><br>${pcEsc(r.requester)} · ${pcEsc(r.priority)}<br><span class="small">${pcEsc(r.location)} ${r.eta?'· '+new Date(r.eta).toLocaleString('nl-NL'):''}</span><div class="moves">${status!=='Nieuw'?`<button onclick="moveRequest('${r.id}',-1)">←</button>`:''}${status!=='Uitgevoerd'?`<button onclick="moveRequest('${r.id}',1)">→</button>`:''}<button class="danger" onclick="pcRemove('requests','${r.id}')">×</button></div></div>`).join('');
  document.getElementById(id).innerHTML=rows||'<div class="small">Geen verzoeken.</div>';
}
function renderRequests(){requestColumn('Nieuw','kan-new');requestColumn('Onderweg','kan-transit');requestColumn('Uitgevoerd','kan-done');}
window.moveRequest=(id,dir)=>{
  const r=pcState.requests.find(x=>x.id===id);if(!r)return;const st=['Nieuw','Onderweg','Uitgevoerd'];r.status=st[Math.max(0,Math.min(2,st.indexOf(r.status)+dir))];
  addDiary(`Verzoek ${r.request}: status ${r.status}`,'Verzoek');pcSave();renderPcLog();
};
function renderCopi(){
  document.getElementById('copiActions').innerHTML=pcState.actions.map(a=>`<div class="listitem"><strong>${pcEsc(a.text)}</strong><br>${pcEsc(a.owner)} · ${pcEsc(a.status)} ${a.due?'· '+new Date(a.due).toLocaleString('nl-NL'):''}<div class="pc-actions"><button onclick="cyclePcStatus('actions','${a.id}')">Status</button><button class="danger" onclick="pcRemove('actions','${a.id}')">×</button></div></div>`).join('')||'<div class="small">Geen actiepunten.</div>';
  document.getElementById('copiDecisions').innerHTML=pcState.decisions.map(a=>`<div class="listitem"><strong>${pcEsc(a.text)}</strong><br>${pcEsc(a.owner)} · ${pcEsc(a.effect)}<button class="danger" onclick="pcRemove('decisions','${a.id}')">×</button></div>`).join('')||'<div class="small">Geen besluiten.</div>';
}
window.cyclePcStatus=(col,id)=>{
  const a=pcState[col].find(x=>x.id===id);if(!a)return;const st=['Open','Bezig','Gereed'];a.status=st[(st.indexOf(a.status)+1)%3];addDiary(`${a.text}: ${a.status}`,'CoPI');pcSave();renderPcLog();
};
function renderDiary(){
  const combined=pcState.diary.concat(state.log.map(x=>({time:x.time,category:'Eenheden',text:x.text}))).sort((a,b)=>new Date(b.time)-new Date(a.time));
  document.getElementById('pcDiary').innerHTML=combined.slice(0,200).map(d=>`<div class="diaryitem"><strong>${new Date(d.time).toLocaleString('nl-NL')} · ${pcEsc(d.category)}</strong><br>${pcEsc(d.text)}</div>`).join('')||'Nog geen dagboekregels.';
}
function logisticsPoint(item,type){
  const post=item.location||item.post;
  const coord=POST_COORDS[post];if(!coord)return '';
  return `<button class="lm ${type}" style="left:${coord[0]}%;top:${coord[1]}%" title="${pcEsc(item.unit||item.name||type)}"></button>`;
}
function renderLogisticsMap(){
  const html=pcState.water.map(x=>logisticsPoint(x,'water')).concat(pcState.foam.map(x=>logisticsPoint(x,'foam')),pcState.rehab.map(x=>logisticsPoint(x,'rehab')),pcState.air.map(x=>logisticsPoint(x,'air')),pcState.equipment.map(x=>logisticsPoint(x,'equipment'))).join('');
  document.getElementById('logisticsMarkers').innerHTML=html||'';
}
