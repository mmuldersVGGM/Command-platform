
'use strict';

const PC_KEY='cp_pclog_v28';
const OLD_KEYS=['cp_pclog_v27','cp_pclog_v26','cp_pclog_v25'];
const REQUEST_STATUSES=['Nieuw','Geaccepteerd','Onderweg','Ter plaatse','Uitgevoerd','Geannuleerd'];
const WATER_STATUSES=['Beschikbaar','Onderweg','Ter plaatse','Ingezet','Uitgeput','Retour'];
const FOAM_STATUSES=['Beschikbaar','Onderweg','Ter plaatse','Ingezet','Uitgeput','Retour'];
const EQUIPMENT_STATUSES=['Beschikbaar','Aangevraagd','Onderweg','Ter plaatse','Opgesteld','Ingezet','Retour','Defect'];
const REHAB_STATES={
  drink:['Niet nodig','Nodig','Geregeld'],
  food:['Niet nodig','Nodig','Geregeld'],
  rest:['Niet nodig','Nodig','In rust','Gereed'],
  medical:['Nee','Geadviseerd','Uitgevoerd']
};
const PLATOON_TYPES={
  'Brandbestrijding':{description:'Meerdere tankautospuiten voor gezamenlijke brandbestrijding.',expect:{ts:4}},
  'Natuurbrandbestrijding':{description:'Terreinaardige eenheden voor natuurbrandbestrijding.',expect:{natureTs:4}},
  'Watertransport':{description:'Waterwinning, transport en grootschalige watervoorziening.',expect:{water:2}},
  'Logistiek/ondersteuning':{description:'Materieel, verzorging, brandstof en logistieke ondersteuning.',expect:{logistics:2}},
  'IBGS':{description:'Gevaarlijke stoffen, ontsmetting en specialistische ondersteuning.',expect:{ibgs:1}},
  'Redding/waterongevallen':{description:'Redding, hulpverlening of waterongevallen.',expect:{rescue:1}},
  'Maatwerk':{description:'Vrij samen te stellen peloton.',expect:{}}
};
const ACTIVE_PLATOON_STATUSES=['Onderweg','Ingezet','Aflossing gepland'];

const DEFAULT_PC={
  scenario:{incident:'Testincident',grip:'Geen GRIP',phase:'Inzet',commander:'',location:'',notes:''},
  platoons:[],air:[],rehab:[],water:[],foam:[],equipment:[],requests:[],actions:[],decisions:[],diary:[]
};

function readOldPcState(){
  const direct=localStorage.getItem(PC_KEY);
  if(direct) return JSON.parse(direct);
  for(const key of OLD_KEYS){
    const raw=localStorage.getItem(key);
    if(raw) return JSON.parse(raw);
  }
  return {};
}
let pcState=Object.assign({},DEFAULT_PC,readOldPcState());
for(const k of ['platoons','air','rehab','water','foam','equipment','requests','actions','decisions','diary']){
  if(!Array.isArray(pcState[k]))pcState[k]=[];
}
pcState.platoons.forEach(p=>{
  if(!Array.isArray(p.unitIds)) p.unitIds=[];
  if(!p.platoonType)p.platoonType='Maatwerk';
  if(!p.status)p.status='Ingezet';
  if(!p.startTime)p.startTime='';
  if(p.extraPersonnel===undefined)p.extraPersonnel='0';
});

function pcSave(){localStorage.setItem(PC_KEY,JSON.stringify(pcState));}
function pcId(){return (crypto.randomUUID?crypto.randomUUID():'pc-'+Date.now()+'-'+Math.random().toString(36).slice(2));}
function pcEsc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function addDiary(text,category='PC Log'){
  pcState.diary.unshift({id:pcId(),time:new Date().toISOString(),category,text});
  pcSave();
}

function getPlatoonForUnit(unitId){
  return pcState.platoons.find(p=>(p.unitIds||[]).includes(unitId))||null;
}
function getExtraPlatoonPersonnel(){
  return pcState.platoons.filter(p=>ACTIVE_PLATOON_STATUSES.includes(p.status)).reduce((s,p)=>s+Number(p.extraPersonnel||0),0);
}
window.PCLOG={addDiary,getPlatoonForUnit,getExtraPlatoonPersonnel};

function migrateOldEmbeddedVehicles(){
  let migrated=0;
  pcState.platoons.forEach(p=>{
    if(!Array.isArray(p.unitIds))p.unitIds=[];
    if(Array.isArray(p.vehicleUnits)&&p.vehicleUnits.length){
      p.vehicleUnits.forEach(v=>{
        let unit=state.units.find(u=>u.callsign===v.callsign && (u.source||'VGGM')===(v.source||'VGGM'));
        if(!unit){
          unit={
            id:uid(),source:v.source||'VGGM',sourceCode:v.sourceCode||v.source||'VGGM',
            post:v.post||'',callsign:v.callsign,type:v.type||'Overig',description:v.assignment||'',
            crew:Number(v.crew||0),area:v.source==='VGGM'?(Object.keys(AREAS).find(a=>(AREAS[a]||[]).includes(v.post))||''):'Extern',
            status:v.status||'Ingezet',startTime:v.startTime||nowInput(),sector:p.sector||'',
            commander:'',assignment:v.assignment||'',notes:`Gemigreerd uit ${p.name}`,reliefs:Array.isArray(v.reliefs)?v.reliefs:[]
          };
          state.units.push(unit);
          migrated++;
        }
        if(!p.unitIds.includes(unit.id))p.unitIds.push(unit.id);
      });
      delete p.vehicleUnits;
    }
  });
  if(migrated){
    save();
    addDiary(`${migrated} pelotonvoertuigen gemigreerd naar de centrale eenhedenregistratie.`,'Migratie');
  }
  pcSave();
}

function pcInit(){
  migrateOldEmbeddedVehicles();
  document.querySelectorAll('.logtab').forEach(b=>b.onclick=()=>switchLogTab(b.dataset.logtab));
  const ids=['newPlatoon','addAir','addRehab','addWater','addFoam','addEquipment','newRequest','newAction','newDecision'];
  ids.forEach(id=>{const el=document.getElementById(id);if(el)el.onclick=()=>openPcDialog(id);});
  document.getElementById('savePcDialog').onclick=savePcDialog;
  document.getElementById('refreshOperational').onclick=renderPcLog;
  document.getElementById('puSearch').oninput=renderAvailableUnits;
  renderPcLog();
}
document.addEventListener('DOMContentLoaded',pcInit);

function switchLogTab(name){
  document.querySelectorAll('.logtab').forEach(b=>b.classList.toggle('active',b.dataset.logtab===name));
  document.querySelectorAll('.logpane').forEach(p=>p.classList.toggle('active',p.id===`logpane-${name}`));
}

const DIALOGS={
  newPlatoon:{title:'Peloton',type:'platoon',fields:[
    ['name','Naam peloton','text','Peloton 1'],['platoonType','Soort peloton','select',Object.keys(PLATOON_TYPES).join('|')],
    ['status','Status','select','Geformeerd|Onderweg|Ingezet|Aflossing gepland|Afgelost|Beschikbaar'],
    ['startTime','Start inzet','datetime-local',''],['commander','Pelotonscommandant','text',''],
    ['extraPersonnel','Extra personeel buiten voertuigen','number','0'],
    ['air','Ademlucht %','number','100'],['water','Water %','number','100'],
    ['foam','Schuim %','number','100'],['food','Voeding','select','Nee|Geregeld|Onderweg'],
    ['rest','Rustlocatie','select','Nee|Geregeld|In gebruik'],['sector','Sector/inzetvak','select','Onverdeeld|Noord|Oost|Zuid|West']
  ]},
  addAir:{title:'Ademlucht',type:'air',fields:[
    ['unit','Eenheid/peloton','text',''],['available','Beschikbare cilinders','number','6'],
    ['used','Gebruikt','number','0'],['expected','Verwacht wisselmoment','datetime-local',''],
    ['exchange','Wisselpunt','text',''],['post','Post/locatie','text','']
  ]},
  addRehab:{title:'Rehab',type:'rehab',fields:[
    ['unit','Ploeg/peloton','text',''],['people','Aantal personen','number','6'],
    ['drink','Drinken','select','Niet nodig|Nodig|Geregeld'],['food','Voeding','select','Niet nodig|Nodig|Geregeld'],
    ['rest','Rust','select','Niet nodig|Nodig|In rust|Gereed'],['medical','Medische controle','select','Nee|Geadviseerd|Uitgevoerd'],
    ['location','Rehablocatie','text',''],['due','Volgende controle','datetime-local','']
  ]},
  addWater:{title:'Waterlogistiek',type:'water',fields:[
    ['unit','Voertuig/waterpunt','text',''],['kind','Type','select','Watertankwagen|Waterpunt|Dompelpomp|WTS|Overig'],
    ['status','Status','select',WATER_STATUSES.join('|')],['capacity','Capaciteit/voorraad %','number','100'],
    ['location','Locatie/post','text',''],['eta','Verwachte aankomst','datetime-local','']
  ]},
  addFoam:{title:'Schuimlogistiek',type:'foam',fields:[
    ['unit','Eenheid/voorraad','text',''],['kind','Type schuim','text',''],
    ['status','Status','select',FOAM_STATUSES.join('|')],['capacity','Voorraad %','number','100'],
    ['amount','Hoeveelheid','text',''],['location','Locatie/post','text','']
  ]},
  addEquipment:{title:'Materieel',type:'equipment',fields:[
    ['name','Materieel','text','Lichtmast'],['amount','Aantal','number','1'],
    ['status','Status','select',EQUIPMENT_STATUSES.join('|')],
    ['location','Locatie/post','text',''],['owner','Beheerder/eenheid','text','']
  ]},
  newRequest:{title:'Logistiek verzoek',type:'request',fields:[
    ['request','Verzoek','text',''],['requester','Aanvrager/OSC','text',''],
    ['priority','Prioriteit','select','Normaal|Hoog|Spoed'],['status','Status','select',REQUEST_STATUSES.join('|')],
    ['location','Bestemming','text',''],['assigned','Toegewezen aan','text',''],['eta','ETA','datetime-local','']
  ]},
  newAction:{title:'CoPI-actiepunt',type:'action',fields:[
    ['text','Actiepunt','text',''],['owner','Eigenaar','text',''],['due','Deadline','datetime-local',''],['status','Status','select','Open|Bezig|Gereed']
  ]},
  newDecision:{title:'CoPI-besluit',type:'decision',fields:[
    ['text','Besluit','text',''],['owner','Besluit door','text',''],['effect','Gevolg/uitwerking','text','']
  ]}
};
const COLLECTION_MAP={platoon:'platoons',air:'air',rehab:'rehab',water:'water',foam:'foam',equipment:'equipment',request:'requests',action:'actions',decision:'decisions'};
let dialogConfig=null,editContext=null;

function renderDialogFields(config,item={}){
  return config.fields.map(([id,label,type,def])=>{
    const value=item[id]??(type==='select'?def.split('|')[0]:def);
    if(type==='select')return `<label>${pcEsc(label)}<select id="pcf-${id}">${def.split('|').map(v=>`<option ${String(value)===v?'selected':''}>${pcEsc(v)}</option>`).join('')}</select></label>`;
    return `<label>${pcEsc(label)}<input id="pcf-${id}" type="${type}" value="${pcEsc(value)}"></label>`;
  }).join('');
}
function openPcDialog(buttonId,collection=null,id=null){
  dialogConfig=DIALOGS[buttonId];if(!dialogConfig)return;
  editContext=null;let item={};
  if(collection&&id){item=pcState[collection].find(x=>x.id===id)||{};editContext={collection,id,before:JSON.parse(JSON.stringify(item))};}
  document.getElementById('pcDialogTitle').textContent=(editContext?'Bewerken: ':'Nieuw: ')+dialogConfig.title;
  document.getElementById('pcDialogType').value=dialogConfig.type;
  document.getElementById('pcDialogFields').innerHTML=renderDialogFields(dialogConfig,item);
  document.getElementById('pcLogDialog').showModal();
}
function savePcDialog(){
  if(!dialogConfig)return;
  const values={};dialogConfig.fields.forEach(([id])=>values[id]=document.getElementById(`pcf-${id}`).value);
  const collection=editContext?editContext.collection:COLLECTION_MAP[dialogConfig.type];
  if(editContext){
    const item=pcState[collection].find(x=>x.id===editContext.id);if(!item)return;
    Object.assign(item,values,{updated:new Date().toISOString()});
    addDiary(`${dialogConfig.title} gewijzigd: ${item.name||item.unit||item.request||item.text||''}`,'Wijziging');
  }else{
    const item={id:pcId(),created:new Date().toISOString(),...values};
    if(collection==='platoons')item.unitIds=[];
    pcState[collection].push(item);
    addDiary(`${dialogConfig.title} toegevoegd: ${item.name||item.unit||item.request||item.text||''}`,dialogConfig.type);
  }
  pcSave();document.getElementById('pcLogDialog').close();renderPcLog();if(typeof render==='function')render();
}
window.pcEdit=(buttonId,collection,id)=>openPcDialog(buttonId,collection,id);

function renderPcLog(){
  renderOperation();renderPlatoons();renderAir();renderRehab();renderWater();renderFoam();renderEquipment();
  renderRequests();renderCopi();renderDiary();renderLogisticsMap();
}

function platoonUnits(p){return (p.unitIds||[]).map(id=>state.units.find(u=>u.id===id)).filter(Boolean);}
function platoonActiveUnits(p){return platoonUnits(p).filter(active);}
function platoonPersonnel(p){return platoonActiveUnits(p).reduce((s,u)=>s+Number(u.crew||0),0)+(ACTIVE_PLATOON_STATUSES.includes(p.status)?Number(p.extraPersonnel||0):0);}
function vehicleCategory(type=''){
  const t=type.toLowerCase();
  if(t.includes('tankautospuit')&&t.includes('natuur'))return 'natureTs';
  if(t.includes('tankautospuit'))return 'ts';
  if(/watertank|watertransport|wts|dompelpomp|bronpomp/.test(t))return 'water';
  if(/logistiek|verzorg|haakarm|brandstof|personeel\/materiaal/.test(t))return 'logistics';
  if(/gevaarlijke|ontsmet|ibgs|gaspak/.test(t))return 'ibgs';
  if(/hulpverlening|redding|waterongevallen|brandweervaartuig|hoogwerker/.test(t))return 'rescue';
  return 'other';
}
function compositionCheck(p){
  const counts={};platoonUnits(p).forEach(u=>{const c=vehicleCategory(u.type);counts[c]=(counts[c]||0)+1;});
  const def=PLATOON_TYPES[p.platoonType]||PLATOON_TYPES.Maatwerk;
  const missing=Object.entries(def.expect||{}).filter(([k,n])=>(counts[k]||0)<n).map(([k,n])=>`${k}: ${counts[k]||0}/${n}`);
  return {ok:missing.length===0,text:missing.length?`Samenstelling nog niet compleet: ${missing.join(', ')}`:`Samenstelling past bij ${p.platoonType}.`};
}

window.openPlatoonUnitDialog=platoonId=>{
  document.getElementById('puPlatoonId').value=platoonId;
  document.getElementById('puSearch').value='';
  renderAvailableUnits();
  document.getElementById('platoonUnitDialog').showModal();
};
function renderAvailableUnits(){
  const p=pcState.platoons.find(x=>x.id===document.getElementById('puPlatoonId').value);if(!p)return;
  const q=document.getElementById('puSearch').value.toLowerCase();
  const rows=state.units.filter(u=>JSON.stringify(u).toLowerCase().includes(q)).sort((a,b)=>unitLabel(a).localeCompare(unitLabel(b),'nl'));
  document.getElementById('platoonAvailableUnits').innerHTML=rows.map(u=>{
    const current=getPlatoonForUnit(u.id);
    const checked=(p.unitIds||[]).includes(u.id);
    const disabled=current&&current.id!==p.id;
    return `<label class="assign-row">
      <input type="checkbox" ${checked?'checked':''} ${disabled?'disabled':''} onchange="toggleUnitInPlatoon('${p.id}','${u.id}',this.checked)">
      <div><strong>${pcEsc(unitLabel(u))}</strong><div class="meta">${pcEsc(u.status)} · ${pcEsc(u.sector||'')} · ${u.crew||0} personen ${current?`· Peloton: ${pcEsc(current.name)}`:''}</div></div>
      <span>${disabled?'Al gekoppeld':checked?'Gekoppeld':'Vrij'}</span>
    </label>`;
  }).join('')||'<div class="listitem">Geen eenheden gevonden.</div>';
}
window.toggleUnitInPlatoon=(platoonId,unitId,checked)=>{
  const p=pcState.platoons.find(x=>x.id===platoonId);if(!p)return;
  p.unitIds=p.unitIds||[];
  if(checked){
    const current=getPlatoonForUnit(unitId);
    if(current&&current.id!==p.id){alert(`Deze eenheid zit al in ${current.name}.`);renderAvailableUnits();return;}
    if(!p.unitIds.includes(unitId))p.unitIds.push(unitId);
    const u=state.units.find(x=>x.id===unitId);addDiary(`${unitLabel(u)} gekoppeld aan ${p.name}`,'Peloton');
  }else{
    p.unitIds=p.unitIds.filter(id=>id!==unitId);
    const u=state.units.find(x=>x.id===unitId);addDiary(`${unitLabel(u)} losgekoppeld van ${p.name}`,'Peloton');
  }
  pcSave();renderAvailableUnits();renderPcLog();if(typeof render==='function')render();
};
window.unlinkUnitFromPlatoon=(platoonId,unitId)=>{
  const p=pcState.platoons.find(x=>x.id===platoonId);if(!p)return;
  p.unitIds=(p.unitIds||[]).filter(id=>id!==unitId);
  const u=state.units.find(x=>x.id===unitId);addDiary(`${unitLabel(u)} losgekoppeld van ${p.name}`,'Peloton');
  pcSave();renderPcLog();if(typeof render==='function')render();
};

function renderPlatoons(){
  const activePlatoons=pcState.platoons.filter(p=>ACTIVE_PLATOON_STATUSES.includes(p.status));
  document.getElementById('platoonActiveCount').textContent=activePlatoons.length;
  document.getElementById('platoonVehicleCount').textContent=activePlatoons.reduce((s,p)=>s+platoonActiveUnits(p).length,0);
  document.getElementById('platoonPersonnelCount').textContent=activePlatoons.reduce((s,p)=>s+platoonPersonnel(p),0);
  document.getElementById('platoonReliefCount').textContent=pcState.platoons.reduce((s,p)=>s+platoonUnits(p).reduce((n,u)=>n+(u.reliefs||[]).length,0),0);

  document.getElementById('platoonCards').innerHTML=pcState.platoons.map(p=>{
    const check=compositionCheck(p);
    const rows=platoonUnits(p).map(u=>`<div class="platoon-unit-row">
      <div><strong>${pcEsc(unitLabel(u))}</strong><span class="unit-platoon-badge">${pcEsc(p.name)}</span><div class="small">${pcEsc(u.assignment||'')} · ${(u.reliefs||[]).length} aflossing(en)</div></div>
      <div>${u.crew||0}<div class="small">personen</div></div>
      <div>${pcEsc(u.status)}</div>
      <div>${u.startTime?duration(hoursSince(u.startTime)):'-'}</div>
      <div class="actions"><button onclick="openRelief('${u.id}')">Aflossing</button><button class="edit-button" onclick="scrollToUnit('${u.id}')">Naar eenheid</button><button class="danger" onclick="unlinkUnitFromPlatoon('${p.id}','${u.id}')">Loskoppelen</button></div>
    </div>`).join('')||'<div class="platoon-empty">Nog geen eenheden gekoppeld.</div>';
    return `<article class="platoon-card">
      <div class="cardhead"><div><div class="platoon-headerline"><strong>${pcEsc(p.name)}</strong><span class="platoon-type-badge">${pcEsc(p.platoonType)}</span><span class="platoon-status-badge">${pcEsc(p.status)}</span></div><div class="small">${pcEsc(p.commander)} · ${pcEsc(p.sector)} · ${platoonPersonnel(p)} personen · ${platoonActiveUnits(p).length} actieve eenheden</div></div>
      <div class="pc-actions"><button onclick="openPlatoonUnitDialog('${p.id}')">Eenheden koppelen</button><button class="edit-button" onclick="pcEdit('newPlatoon','platoons','${p.id}')">Peloton bewerken</button><button class="danger" onclick="pcRemove('platoons','${p.id}')">Verwijder</button></div></div>
      <div class="composition-check ${check.ok?'':'warn'}">${pcEsc(PLATOON_TYPES[p.platoonType]?.description||'')}<br>${pcEsc(check.text)}</div>
      <div class="platoon-grid">
        <div class="metric"><strong>Personeel eenheden</strong>${platoonActiveUnits(p).reduce((s,u)=>s+Number(u.crew||0),0)}</div>
        <div class="metric"><strong>Extra personeel</strong>${stepper('platoons',p.id,'extraPersonnel',p.extraPersonnel,1)}</div>
        <div class="metric"><strong>Totaal ingezet</strong>${platoonPersonnel(p)}</div>
        <div class="metric"><strong>Actieve eenheden</strong>${platoonActiveUnits(p).length}</div>
        <div class="metric"><strong>Ademlucht</strong>${stepper('platoons',p.id,'air',p.air,10)}${pctBar(p.air)}</div>
        <div class="metric"><strong>Water</strong>${stepper('platoons',p.id,'water',p.water,10)}${pctBar(p.water)}</div>
        <div class="metric"><strong>Schuim</strong>${stepper('platoons',p.id,'foam',p.foam,10)}${pctBar(p.foam)}</div>
        <div class="metric"><strong>Sector</strong>${pcEsc(p.sector)}</div>
      </div>
      <div class="platoon-vehicles"><h4>Gekoppelde eenheden</h4>${rows}</div>
    </article>`;
  }).join('')||'<div class="listitem">Nog geen pelotons geregistreerd.</div>';
}
window.scrollToUnit=unitId=>{
  document.getElementById('overview')?.scrollIntoView({behavior:'smooth'});
  const q=document.getElementById('search');const u=state.units.find(x=>x.id===unitId);
  if(q&&u){q.value=u.callsign;renderCards();}
};

function renderOperation(){
  const activeUnits=state.units.filter(active);
  document.getElementById('opPlatoons').textContent=pcState.platoons.filter(p=>ACTIVE_PLATOON_STATUSES.includes(p.status)).length;
  document.getElementById('opRequests').textContent=pcState.requests.filter(r=>!['Uitgevoerd','Geannuleerd'].includes(r.status)).length;
  const airVals=pcState.platoons.map(p=>Number(p.air||100)).concat(pcState.air.map(a=>{const av=Number(a.available||0),used=Number(a.used||0);return av+used?Math.round(av/(av+used)*100):100;}));
  document.getElementById('opAir').textContent=(airVals.length?Math.round(airVals.reduce((a,b)=>a+b,0)/airVals.length):100)+'%';
  document.getElementById('opRehab').textContent=pcState.rehab.filter(r=>r.drink==='Nodig'||r.food==='Nodig'||r.rest==='Nodig'||r.medical==='Geadviseerd').length;
  document.getElementById('opWater').textContent=pcState.water.filter(w=>Number(w.capacity)<30||w.status==='Uitgeput').length;
  document.getElementById('opFoam').textContent=pcState.foam.filter(w=>Number(w.capacity)<30||w.status==='Uitgeput').length;
  renderAlerts(activeUnits);renderScenario(activeUnits);renderCoverage();renderReliefAdvice(activeUnits);
}
function renderAlerts(activeUnits){
  const alerts=[];
  activeUnits.forEach(u=>{
    const h=hoursSince(u.startTime),p=getPlatoonForUnit(u.id);
    const prefix=p?`${p.name} / `:'';
    if(h>=4)alerts.push({level:'danger',text:`${prefix}${unitLabel(u)} is ${duration(h)} ingezet: aflossing noodzakelijk.`});
    else if(h>=3&&!((u.reliefs||[]).length))alerts.push({level:'',text:`${prefix}${unitLabel(u)} heeft na ${duration(h)} nog geen aflossing.`});
  });
  pcState.requests.filter(r=>r.priority==='Spoed'&&!['Uitgevoerd','Geannuleerd'].includes(r.status)).forEach(r=>alerts.push({level:'danger',text:`Spoedverzoek open: ${r.request}`}));
  pcState.water.filter(w=>Number(w.capacity)<30||w.status==='Uitgeput').forEach(w=>alerts.push({level:'info',text:`Water kritisch: ${w.unit} (${w.capacity}%, ${w.status}).`}));
  pcState.foam.filter(w=>Number(w.capacity)<30||w.status==='Uitgeput').forEach(w=>alerts.push({level:'info',text:`Schuim kritisch: ${w.unit} (${w.capacity}%, ${w.status}).`}));
  pcState.platoons.filter(p=>Number(p.air)<20).forEach(p=>alerts.push({level:'danger',text:`Ademlucht ${p.name} onder 20%.`}));
  document.getElementById('autoAlerts').innerHTML=alerts.length?alerts.map(a=>`<div class="alertitem ${a.level}">${pcEsc(a.text)}</div>`).join(''):'<div class="listitem">Geen automatische waarschuwingen.</div>';
}
function renderScenario(activeUnits){
  const personnel=activeUnits.reduce((s,u)=>s+Number(u.crew||0),0)+getExtraPlatoonPersonnel();
  const planned=activeUnits.filter(u=>(u.reliefs||[]).length).length;
  const fields=[['Incident',pcState.scenario.incident],['GRIP',pcState.scenario.grip],['Fase',pcState.scenario.phase],['Pelotons',pcState.platoons.length],['Personeel',personnel],['Voertuigen',activeUnits.length],['Aflossingen gepland',planned],['Aflossingen ontbreken',activeUnits.length-planned],['Open verzoeken',pcState.requests.filter(r=>!['Uitgevoerd','Geannuleerd'].includes(r.status)).length]];
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
function distancePosts(a,b){const A=POST_COORDS[a],B=POST_COORDS[b];return(!A||!B)?999:Math.hypot(A[0]-B[0],A[1]-B[1]);}
function renderReliefAdvice(activeUnits){
  const used=new Set(activeUnits.map(u=>u.callsign));
  const advice=activeUnits.filter(u=>hoursSince(u.startTime)>=2.5).slice(0,8).map(u=>{
    const p=getPlatoonForUnit(u.id),prefix=p?`${p.name} / `:'';
    if(u.source!=='VGGM')return `<div class="advice-card"><strong>${pcEsc(prefix+unitLabel(u))}</strong>Externe eenheid: aflossing handmatig coördineren.</div>`;
    const wanted=(u.type||'').toLowerCase(),candidates=[];
    Object.entries(VEHICLES).forEach(([post,list])=>list.forEach(v=>{
      if(!used.has(v.number)&&((wanted.includes('tankautospuit')&&v.type.toLowerCase().includes('tankautospuit'))||v.type.toLowerCase()===wanted)){
        const d=distancePosts(u.post,post);candidates.push({post,...v,d,minutes:Math.max(8,Math.round(d*1.6))});
      }
    }));
    candidates.sort((a,b)=>a.d-b.d);
    const list=candidates.slice(0,3).map((c,i)=>`${i+1}. ${c.number} • ${c.post} • indicatief ${c.minutes} min`).join('<br>');
    return `<div class="advice-card"><strong>${pcEsc(prefix+unitLabel(u))} · ${duration(hoursSince(u.startTime))}</strong>${list||'Geen passende vrije eenheid gevonden.'}<div class="small">Indicatief; controleer restdekking en werkelijke reistijd.</div></div>`;
  });
  document.getElementById('reliefAdvice').innerHTML=advice.length?advice.join(''):'<div class="listitem">Nog geen aflossingsadvies nodig.</div>';
}

function pctBar(value){const n=Math.max(0,Math.min(100,Number(value||0))),cls=n<30?'danger':n<60?'warn':'';return `<div class="progress ${cls}"><span style="width:${n}%"></span></div>`;}
function stepper(collection,id,field,value,step=10){return `<span class="value-stepper"><button onclick="pcAdjust('${collection}','${id}','${field}',-${step})">−</button><b>${pcEsc(value)}${field.match(/air|water|foam|capacity/)?'%':''}</b><button onclick="pcAdjust('${collection}','${id}','${field}',${step})">+</button></span>`;}
window.pcAdjust=(collection,id,field,delta)=>{const item=pcState[collection].find(x=>x.id===id);if(!item)return;const old=Number(item[field]||0),max=field==='available'||field==='used'?999:100;item[field]=String(Math.max(0,Math.min(max,old+delta)));addDiary(`${item.name||item.unit||collection}: ${field} ${old} → ${item[field]}`,'Wijziging');pcSave();renderPcLog();};
window.pcSetStatus=(collection,id,value)=>{const item=pcState[collection].find(x=>x.id===id);if(!item)return;const old=item.status;item.status=value;addDiary(`${item.name||item.unit||item.request}: status ${old} → ${value}`,'Status');pcSave();renderPcLog();};
window.pcSetField=(collection,id,field,value)=>{const item=pcState[collection].find(x=>x.id===id);if(!item)return;const old=item[field];item[field]=value;addDiary(`${item.name||item.unit||collection}: ${field} ${old} → ${value}`,'Wijziging');pcSave();renderPcLog();};
function statusSelect(collection,item,statuses){return `<select class="status-select" onchange="pcSetStatus('${collection}','${item.id}',this.value)">${statuses.map(s=>`<option ${item.status===s?'selected':''}>${pcEsc(s)}</option>`).join('')}</select>`;}
function tableHtml(headers,rows){return `<table class="data-table"><thead><tr>${headers.map(h=>`<th>${pcEsc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;}
function stateSelect(collection,item,field,values){return `<select onchange="pcSetField('${collection}','${item.id}','${field}',this.value)">${values.map(v=>`<option ${item[field]===v?'selected':''}>${v}</option>`).join('')}</select>`;}

function renderAir(){document.getElementById('airTable').innerHTML=tableHtml(['Eenheid','Beschikbaar','Gebruikt','Wisselmoment','Wisselpunt','Acties'],pcState.air.map(a=>`<tr><td>${pcEsc(a.unit)}</td><td>${stepper('air',a.id,'available',a.available,1)}</td><td>${stepper('air',a.id,'used',a.used,1)}</td><td>${a.expected?new Date(a.expected).toLocaleString('nl-NL'):'-'}</td><td>${pcEsc(a.exchange)}</td><td class="pc-actions"><button class="edit-button" onclick="pcEdit('addAir','air','${a.id}')">Bewerken</button><button class="danger" onclick="pcRemove('air','${a.id}')">×</button></td></tr>`));}
function renderRehab(){document.getElementById('rehabTable').innerHTML=tableHtml(['Ploeg','Personen','Drinken','Voeding','Rust','Medisch','Locatie','Acties'],pcState.rehab.map(a=>`<tr><td>${pcEsc(a.unit)}</td><td>${stepper('rehab',a.id,'people',a.people,1)}</td><td>${stateSelect('rehab',a,'drink',REHAB_STATES.drink)}</td><td>${stateSelect('rehab',a,'food',REHAB_STATES.food)}</td><td>${stateSelect('rehab',a,'rest',REHAB_STATES.rest)}</td><td>${stateSelect('rehab',a,'medical',REHAB_STATES.medical)}</td><td>${pcEsc(a.location)}</td><td class="pc-actions"><button class="edit-button" onclick="pcEdit('addRehab','rehab','${a.id}')">Bewerken</button><button class="danger" onclick="pcRemove('rehab','${a.id}')">×</button></td></tr>`));}
function renderWater(){document.getElementById('waterTable').innerHTML=tableHtml(['Eenheid','Type','Status','Capaciteit','Locatie','ETA','Acties'],pcState.water.map(a=>`<tr><td>${pcEsc(a.unit)}</td><td>${pcEsc(a.kind)}</td><td>${statusSelect('water',a,WATER_STATUSES)}</td><td>${stepper('water',a.id,'capacity',a.capacity,10)}${pctBar(a.capacity)}</td><td>${pcEsc(a.location)}</td><td>${a.eta?new Date(a.eta).toLocaleString('nl-NL'):'-'}</td><td class="pc-actions"><button class="edit-button" onclick="pcEdit('addWater','water','${a.id}')">Bewerken</button><button class="danger" onclick="pcRemove('water','${a.id}')">×</button></td></tr>`));}
function renderFoam(){document.getElementById('foamTable').innerHTML=tableHtml(['Eenheid','Type','Status','Voorraad','Hoeveelheid','Locatie','Acties'],pcState.foam.map(a=>`<tr><td>${pcEsc(a.unit)}</td><td>${pcEsc(a.kind)}</td><td>${statusSelect('foam',a,FOAM_STATUSES)}</td><td>${stepper('foam',a.id,'capacity',a.capacity,10)}${pctBar(a.capacity)}</td><td>${pcEsc(a.amount)}</td><td>${pcEsc(a.location)}</td><td class="pc-actions"><button class="edit-button" onclick="pcEdit('addFoam','foam','${a.id}')">Bewerken</button><button class="danger" onclick="pcRemove('foam','${a.id}')">×</button></td></tr>`));}
function renderEquipment(){document.getElementById('equipmentTable').innerHTML=tableHtml(['Materieel','Aantal','Status','Locatie','Beheerder','Acties'],pcState.equipment.map(a=>`<tr><td>${pcEsc(a.name)}</td><td>${stepper('equipment',a.id,'amount',a.amount,1)}</td><td>${statusSelect('equipment',a,EQUIPMENT_STATUSES)}</td><td>${pcEsc(a.location)}</td><td>${pcEsc(a.owner)}</td><td class="pc-actions"><button class="edit-button" onclick="pcEdit('addEquipment','equipment','${a.id}')">Bewerken</button><button class="danger" onclick="pcRemove('equipment','${a.id}')">×</button></td></tr>`));}
window.pcRemove=(collection,id)=>{const item=pcState[collection].find(x=>x.id===id);if(!item||!confirm('Item verwijderen?'))return;if(collection==='platoons')item.unitIds=[];pcState[collection]=pcState[collection].filter(x=>x.id!==id);addDiary(`Verwijderd uit ${collection}: ${item.name||item.unit||item.request||item.text||''}`,'Wijziging');pcSave();renderPcLog();if(typeof render==='function')render();};

function requestColumn(status,id){const rows=pcState.requests.filter(r=>r.status===status).map(r=>`<div class="kancard"><strong>${pcEsc(r.request)}</strong><br>${pcEsc(r.requester)} · ${pcEsc(r.priority)}<br><span class="small">${pcEsc(r.location)} ${r.eta?'· '+new Date(r.eta).toLocaleString('nl-NL'):''}</span><div class="inline-controls">${statusSelect('requests',r,REQUEST_STATUSES)}<button class="edit-button" onclick="pcEdit('newRequest','requests','${r.id}')">Bewerken</button><button class="danger" onclick="pcRemove('requests','${r.id}')">×</button></div></div>`).join('');document.getElementById(id).innerHTML=rows||'<div class="small">Geen verzoeken.</div>';}
function renderRequests(){requestColumn('Nieuw','kan-new');requestColumn('Geaccepteerd','kan-accepted');requestColumn('Onderweg','kan-transit');requestColumn('Ter plaatse','kan-arrived');requestColumn('Uitgevoerd','kan-done');requestColumn('Geannuleerd','kan-cancelled');}
function renderCopi(){document.getElementById('copiActions').innerHTML=pcState.actions.map(a=>`<div class="listitem"><strong>${pcEsc(a.text)}</strong><br>${pcEsc(a.owner)} · ${pcEsc(a.status)} ${a.due?'· '+new Date(a.due).toLocaleString('nl-NL'):''}<div class="pc-actions"><button onclick="cyclePcStatus('actions','${a.id}')">Status</button><button class="edit-button" onclick="pcEdit('newAction','actions','${a.id}')">Bewerken</button><button class="danger" onclick="pcRemove('actions','${a.id}')">×</button></div></div>`).join('')||'<div class="small">Geen actiepunten.</div>';document.getElementById('copiDecisions').innerHTML=pcState.decisions.map(a=>`<div class="listitem"><strong>${pcEsc(a.text)}</strong><br>${pcEsc(a.owner)} · ${pcEsc(a.effect)}<div class="pc-actions"><button class="edit-button" onclick="pcEdit('newDecision','decisions','${a.id}')">Bewerken</button><button class="danger" onclick="pcRemove('decisions','${a.id}')">×</button></div></div>`).join('')||'<div class="small">Geen besluiten.</div>';}
window.cyclePcStatus=(col,id)=>{const a=pcState[col].find(x=>x.id===id);if(!a)return;const st=['Open','Bezig','Gereed'],old=a.status;a.status=st[(st.indexOf(a.status)+1)%3];addDiary(`${a.text}: status ${old} → ${a.status}`,'CoPI');pcSave();renderPcLog();};
function renderDiary(){const combined=pcState.diary.concat(state.log.map(x=>({time:x.time,category:'Eenheden',text:x.text}))).sort((a,b)=>new Date(b.time)-new Date(a.time));document.getElementById('pcDiary').innerHTML=combined.slice(0,300).map(d=>`<div class="diaryitem"><strong>${new Date(d.time).toLocaleString('nl-NL')} · ${pcEsc(d.category)}</strong><br>${pcEsc(d.text)}</div>`).join('')||'Nog geen dagboekregels.';}
function logisticsPoint(item,type){const post=item.location||item.post,coord=POST_COORDS[post];if(!coord)return '';return `<button class="lm ${type}" style="left:${coord[0]}%;top:${coord[1]}%" title="${pcEsc(item.unit||item.name||type)}"></button>`;}
function renderLogisticsMap(){document.getElementById('logisticsMarkers').innerHTML=pcState.water.map(x=>logisticsPoint(x,'water')).concat(pcState.foam.map(x=>logisticsPoint(x,'foam')),pcState.rehab.map(x=>logisticsPoint(x,'rehab')),pcState.air.map(x=>logisticsPoint(x,'air')),pcState.equipment.map(x=>logisticsPoint(x,'equipment'))).join('');}
