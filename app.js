
'use strict';

const $ = id => document.getElementById(id);
const state = {
  units: JSON.parse(localStorage.getItem('cp_units') || '[]'),
  log: JSON.parse(localStorage.getItem('cp_log') || '[]'),
  selectedPost: ''
};
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2));

function save(){
  localStorage.setItem('cp_units', JSON.stringify(state.units));
  localStorage.setItem('cp_log', JSON.stringify(state.log.slice(0,200)));
}
function addLog(text){
  state.log.unshift({time:new Date().toISOString(),text});
  if(window.PCLOG && typeof window.PCLOG.addDiary==='function') window.PCLOG.addDiary(text,'Automatisch');
  save();
}
function nowInput(){
  const d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
  return d.toISOString().slice(0,16);
}
function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function source(){
  return document.querySelector('input[name="source"]:checked')?.value || 'VGGM';
}
function vehicleLabel(post,number,type){
  return [number,post,type].filter(Boolean).join(' • ');
}
function unitLabel(u){
  return u.source==='VGGM' ? vehicleLabel(u.post,u.callsign,u.type) :
    [u.sourceCode,u.callsign,u.post,u.description||u.type].filter(Boolean).join(' • ');
}
function active(u){return ['Onderweg','Ingezet','Aflossing gepland'].includes(u.status);}
function hoursSince(s){return s?Math.max(0,(Date.now()-new Date(s))/3600000):0;}
function duration(h){const m=Math.floor(h*60);return `${Math.floor(m/60)}u ${m%60}m`;}

const APP_VERSION='31.0.0';

function initRoleMode(){
  const saved=localStorage.getItem('cp_role_mode')||'ALL';
  const select=$('roleMode');
  if(select){select.value=saved;select.onchange=()=>applyRoleMode(select.value);}
  applyRoleMode(saved);
  const label=$('versionLabel');if(label)label.textContent='v'+APP_VERSION;
}
function applyRoleMode(role){
  localStorage.setItem('cp_role_mode',role);
  document.querySelectorAll('[data-roles]').forEach(el=>{
    const roles=(el.dataset.roles||'ALL').split(' ');
    el.classList.toggle('role-hidden',role!=='ALL'&&!roles.includes(role));
  });
}
function initUpdateCheck(){
  const btn=$('checkUpdate');
  if(!btn)return;
  btn.onclick=async()=>{
    btn.textContent='Controleren…';
    try{
      if('serviceWorker' in navigator){
        const reg=await navigator.serviceWorker.getRegistration();
        if(reg)await reg.update();
      }
      const res=await fetch('./version.json?ts='+Date.now(),{cache:'no-store'});
      const info=await res.json();
      if(info.version!==APP_VERSION){
        if(confirm(`Nieuwe versie ${info.version} beschikbaar. Nu vernieuwen?`)){
          if('caches' in window){const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)));}
          location.reload();
        }
      }else alert('Je gebruikt de nieuwste versie: '+APP_VERSION);
    }catch(e){alert('Updatecontrole kon niet worden uitgevoerd. Vernieuw de pagina handmatig.');}
    btn.textContent='Controleer update';
  };
}

function init(){
  try{
    if($('startTime')) $('startTime').value=nowInput();
    initRoleMode();
    initUpdateCheck();
    fillAreas();
    fillRegions();
    fillAllPosts();
    initDeploymentPlatoonChoices();
    bind();
    render();
    setInterval(()=>{ if($('clock')) $('clock').textContent=new Date().toLocaleString('nl-NL'); render(); },60000);
    if($('clock')) $('clock').textContent=new Date().toLocaleString('nl-NL');
  }catch(error){
    console.error('Opstartfout Command Platform:',error);
    emergencyPopulateForm();
    const box=document.createElement('div');
    box.className='startup-error';
    box.innerHTML='<strong>Een onderdeel kon niet volledig starten.</strong><br>De keuzelijsten zijn met een noodroutine gevuld. Gebruik “Herstel/vernieuw app” als onderdelen ontbreken.';
    document.body.prepend(box);
  }
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js?v=29.2.0',{updateViaCache:'none'}).then(r=>r.update()).catch(console.warn));
  }
}

function emergencyPopulateForm(){
  try{
    const area=$('area');
    if(area && area.options.length<2){
      area.innerHTML='<option value="">Kies gebied</option>'+Object.keys(AREAS||{}).map(a=>`<option>${a}</option>`).join('');
      area.onchange=fillPosts;
    }
    const type=$('deploymentPlatoonType');
    if(type && type.options.length<2){
      type.innerHTML=platoonTypesForDeployment().map(t=>`<option>${t}</option>`).join('');
    }
    const number=$('deploymentPlatoonNumber');
    if(number && number.options.length<2){
      number.innerHTML='<option value="">Kies pelotonnummer</option>'+[100,200,300,400,500,600,700,800,900].map(n=>`<option value="${n}">Peloton ${n}</option>`).join('');
    }
  }catch(e){console.error('Noodroutine mislukt:',e);}
}

function bind(){
  document.querySelectorAll('.quicknav button').forEach(b=>b.onclick=()=>$(b.dataset.target).scrollIntoView({behavior:'smooth'}));
  document.querySelectorAll('.step').forEach(b=>b.onclick=()=>goStep(Number(b.dataset.step)));
  document.querySelectorAll('.next').forEach(b=>b.onclick=()=>{const n=Number(b.dataset.next); if(validateStep(n-1)) goStep(n);});
  document.querySelectorAll('.prev').forEach(b=>b.onclick=()=>goStep(Number(b.dataset.prev)));
  document.querySelectorAll('input[name="source"]').forEach(r=>r.onchange=toggleSource);
  document.querySelectorAll('input[name="deploymentMode"]').forEach(r=>r.onchange=toggleDeploymentMode);
  if($('deploymentPlatoonNumber')) $('deploymentPlatoonNumber').onchange=syncDeploymentPlatoonType;
  if($('deploymentPlatoonType')) $('deploymentPlatoonType').onchange=updateDeploymentPlatoonInfo;
  $('area').onchange=fillPosts;
  $('post').onchange=()=>{fillVehicles();fillTasks();selectPost($('post').value);};
  $('vehicle').onchange=applyVehicle;
  $('planRelief').onchange=()=>toggle($('reliefFields'),$('planRelief').checked);
  $('reliefSource').onchange=refreshReliefControls;
  $('reliefPost').onchange=fillReliefVehicles;
  $('chainSource').onchange=refreshChainControls;
  $('chainPost').onchange=fillChainVehicles;
  $('unitForm').onsubmit=submitUnit;
  $('search').oninput=renderCards;
  $('exportCsv').onclick=exportCsv;
  $('clearAll').onclick=clearAll;
  $('clearMap').onclick=()=>{state.selectedPost='';$('post').value='';renderMarkers();renderPostInfo();};
  document.querySelectorAll('.coverage-filter').forEach(btn=>btn.onclick=()=>setCoverageFilter(btn.dataset.coverageFilter));
  document.querySelectorAll('.coverage-region').forEach(region=>{
    region.onclick=()=>openCoverageArea(region.dataset.area);
    region.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openCoverageArea(region.dataset.area);}};
  });
  $('addRelief').onclick=addRelief;
}


function deploymentMode(){
  return document.querySelector('input[name="deploymentMode"]:checked')?.value || 'LOOSE';
}
function platoonTypesForDeployment(){
  return ['Basispeloton','Natuurbrandpeloton','Watertransportpeloton','Logistiek peloton','IBGS-peloton','Redding/waterongevallenpeloton','Maatwerk'];
}
function initDeploymentPlatoonChoices(){
  const typeSelect=$('deploymentPlatoonType');
  if(typeSelect){
    typeSelect.innerHTML=platoonTypesForDeployment().map(t=>`<option>${t}</option>`).join('');
  }
  if(window.PCLOG && typeof window.PCLOG.populateDeploymentPlatoons==='function'){
    window.PCLOG.populateDeploymentPlatoons();
  }else{
    const select=$('deploymentPlatoonNumber');
    if(select){
      select.innerHTML='<option value="">Kies pelotonnummer</option>'+[100,200,300,400,500,600,700,800,900].map(n=>`<option value="${n}">Peloton ${n}</option>`).join('');
    }
  }
  toggleDeploymentMode();
}
function toggleDeploymentMode(){
  const show=deploymentMode()==='PLATOON';
  const fields=$('deploymentPlatoonFields');
  if(fields) fields.classList.toggle('hidden',!show);
  if(show && window.PCLOG && typeof window.PCLOG.populateDeploymentPlatoons==='function'){
    window.PCLOG.populateDeploymentPlatoons();
  }
  updateDeploymentPlatoonInfo();
}
function syncDeploymentPlatoonType(){
  const number=$('deploymentPlatoonNumber')?.value||'';
  const typeEl=$('deploymentPlatoonType');
  if(!typeEl)return;
  const p=(window.PCLOG && typeof window.PCLOG.getPlatoonByNumber==='function')
    ? window.PCLOG.getPlatoonByNumber(number)
    : null;
  if(p){
    typeEl.value=p.platoonType;
    typeEl.disabled=true;
  }else{
    typeEl.disabled=false;
    if(!typeEl.value)typeEl.value='Basispeloton';
  }
  updateDeploymentPlatoonInfo();
}
function updateDeploymentPlatoonInfo(){
  const info=$('deploymentPlatoonInfo');
  if(!info)return;
  const number=$('deploymentPlatoonNumber')?.value||'';
  if(!number){
    info.textContent='Kies een pelotonnummer.';
    return;
  }
  const p=(window.PCLOG && typeof window.PCLOG.getPlatoonByNumber==='function')
    ? window.PCLOG.getPlatoonByNumber(number)
    : null;
  info.textContent=p
    ? `De eenheid wordt gekoppeld aan Peloton ${number} • ${p.platoonType}.`
    : `Peloton ${number} bestaat nog niet. Het wordt als ${$('deploymentPlatoonType')?.value||'Basispeloton'} aangemaakt en de eenheid wordt direct gekoppeld.`;
}
window.toggleDeploymentMode=toggleDeploymentMode;
window.syncDeploymentPlatoonType=syncDeploymentPlatoonType;

function fillAreas(){
  $('area').innerHTML='<option value="">Kies gebied</option>'+Object.keys(AREAS).map(a=>`<option>${a}</option>`).join('');
}
function fillPosts(){
  const a=$('area').value;
  $('post').innerHTML='<option value="">Kies post</option>'+(AREAS[a]||[]).map(p=>`<option>${p}</option>`).join('');
  $('vehicle').innerHTML='<option value="">Kies eerst een post</option>';
  $('task').innerHTML='<option value="">Kies eerst een post</option>';
}
function fillAllPosts(){
  const posts=Object.values(AREAS).flat();
  const opts='<option value="">Kies post</option>'+posts.sort((a,b)=>a.localeCompare(b,'nl')).map(p=>`<option>${p}</option>`).join('');
  $('reliefPost').innerHTML=opts;
  $('chainPost').innerHTML=opts;
}
function fillRegions(){
  $('vrCode').innerHTML='<option value="">Kies veiligheidsregio</option>'+SAFETY_REGIONS.filter(r=>r.code!=='VGGM').map(r=>`<option value="${r.code}">${r.code} • ${r.name}</option>`).join('');
}
function fillVehicles(){
  const p=$('post').value;
  $('vehicle').innerHTML='<option value="">Kies voertuig</option>'+(VEHICLES[p]||[]).map(v=>`<option value="${v.number}" data-type="${esc(v.type)}">${esc(vehicleLabel(p,v.number,v.type))}</option>`).join('');
  $('stationCode').value=STATION_CODES[p]||'';
}
function fillTasks(){
  const p=$('post').value;
  $('task').innerHTML='<option value="">Kies taak</option>'+(TASKS[p]||[]).map(t=>`<option>${esc(t)}</option>`).join('');
}
function applyVehicle(){
  const opt=$('vehicle').selectedOptions[0];
  $('vehicleType').value=opt?.dataset.type||'';
}
function fillReliefVehicles(){
  const p=$('reliefPost').value;
  $('reliefVehicle').innerHTML='<option value="">Kies voertuig</option>'+(VEHICLES[p]||[]).map(v=>`<option value="${v.number}">${esc(vehicleLabel(p,v.number,v.type))}</option>`).join('');
}
function fillChainVehicles(){
  const p=$('chainPost').value;
  const own=(VEHICLES[p]||[]).map(v=>`<option value="${v.number}">${esc(vehicleLabel(p,v.number,v.type))}</option>`).join('');
  const activeExternal=state.units.filter(u=>active(u)&&u.source!=='VGGM').map(u=>`<option value="ACTIVE:${u.id}">Actief • ${esc(unitLabel(u))}</option>`).join('');
  $('chainVehicle').innerHTML='<option value="">Kies voertuig</option>'+own+activeExternal;
}
function toggle(el,show){el.classList.toggle('hidden',!show);}
function toggleSource(){
  toggle($('vggmFields'),source()==='VGGM');
  toggle($('vrFields'),source()==='VR');
  toggle($('otherFields'),source()==='OTHER');
}
function refreshReliefControls(){
  const external=$('reliefSource').value!=='VGGM';
  $('reliefPost').disabled=external;
  $('reliefVehicle').disabled=external;
  $('reliefExternal').disabled=!external;
}
function refreshChainControls(){
  const external=$('chainSource').value!=='VGGM';
  $('chainPost').disabled=external;
  $('chainVehicle').disabled=external;
  $('chainExternal').disabled=!external;
}

function goStep(n){
  document.querySelectorAll('.step').forEach((b,i)=>b.classList.toggle('active',i===n-1));
  document.querySelectorAll('.stepPane').forEach((p,i)=>p.classList.toggle('active',i===n-1));
  if(n===4) renderReview();
}
function validateStep(n){
  if(n===1){
    if(deploymentMode()==='PLATOON'){
      if(!$('deploymentPlatoonNumber')?.value){alert('Kies een pelotonnummer.');return false;}
      if(!$('deploymentPlatoonType')?.value){alert('Kies het soort peloton.');return false;}
    }
    if(source()==='VGGM' && (!$('post').value||!$('vehicle').value)){alert('Kies een post en voertuig.');return false;}
    if(source()==='VR' && (!$('vrCode').value||!$('vrPost').value||!$('vrCallsign').value)){alert('Vul veiligheidsregio, post en roepnummer in.');return false;}
    if(source()==='OTHER' && (!$('otherOrg').value||!$('otherCallsign').value)){alert('Vul organisatie en eenheidsnaam in.');return false;}
  }
  if(n===2 && (!$('sector').value||!$('assignment').value)){alert('Vul inzetvak/locatie en opdracht in.');return false;}
  if(n===3 && $('planRelief').checked && !$('reliefTime').value){alert('Vul een aflossingsmoment in.');return false;}
  return true;
}
function identity(){
  if(source()==='VGGM'){
    const opt=$('vehicle').selectedOptions[0];
    return {source:'VGGM',sourceCode:'VGGM',post:$('post').value,callsign:$('vehicle').value,type:opt?.dataset.type||$('vehicleType').value,description:$('task').value,crew:Number($('crew').value||0),area:$('area').value};
  }
  if(source()==='VR'){
    return {source:'VR',sourceCode:$('vrCode').value,post:$('vrPost').value,callsign:$('vrCallsign').value,type:$('vrType').value,description:$('vrDescription').value,crew:Number($('vrCrew').value||0),area:'Extern'};
  }
  return {source:'OTHER',sourceCode:$('otherOrg').value,post:$('otherPost').value,callsign:$('otherCallsign').value,type:$('otherType').value,description:$('otherDescription').value,crew:Number($('otherCrew').value||0),area:'Overig'};
}
function firstRelief(){
  if(!$('planRelief').checked) return [];
  const external=$('reliefSource').value!=='VGGM';
  return [{id:uid(),source:$('reliefSource').value,post:external?'':$('reliefPost').value,unit:external?$('reliefExternal').value:$('reliefVehicle').value,time:$('reliefTime').value,kind:$('reliefKind').value,crew:Number($('reliefCrew').value||0)}];
}
function renderReview(){
  const i=identity(); const r=firstRelief()[0];
  const platoonText=deploymentMode()==='PLATOON'
    ? `Peloton ${$('deploymentPlatoonNumber')?.value||'-'} • ${$('deploymentPlatoonType')?.value||'-'}`
    : 'Losse eenheid';
  const rows=[['Registratie',platoonText],['Herkomst',i.sourceCode],['Eenheid',unitLabel(i)],['Bezetting',i.crew],['Status',$('status').value],['Start',$('startTime').value?new Date($('startTime').value).toLocaleString('nl-NL'):''],['Inzetvak',$('sector').value],['Opdracht',$('assignment').value],['Aflossing',r?`${r.unit||'Extern'} om ${new Date(r.time).toLocaleString('nl-NL')}`:'Nog niet gepland']];
  $('review').innerHTML=rows.map(([a,b])=>`<div><strong>${esc(a)}</strong>${esc(b)}</div>`).join('');
}
function submitUnit(e){
  e.preventDefault();
  if(!validateStep(1)||!validateStep(2)||!validateStep(3)) return;
  const i=identity();
  const u={id:uid(),...i,status:$('status').value,startTime:$('startTime').value,sector:$('sector').value,commander:$('commander').value,assignment:$('assignment').value,notes:$('notes').value,reliefs:firstRelief()};
  state.units.push(u);
  if(deploymentMode()==='PLATOON' && window.PCLOG && typeof window.PCLOG.assignUnitToPlatoonNumber==='function'){
    const result=window.PCLOG.assignUnitToPlatoonNumber(
      u.id,
      $('deploymentPlatoonNumber').value,
      $('deploymentPlatoonType').value
    );
    if(!result.ok){
      state.units=state.units.filter(x=>x.id!==u.id);
      alert(result.message||'Koppelen aan peloton is niet gelukt.');
      return;
    }
  }
  addLog(`Eenheid geregistreerd: ${unitLabel(u)}`); save(); resetForm(); render(); goStep(1);
}
function resetForm(){
  $('unitForm').reset(); $('startTime').value=nowInput(); toggleSource(); fillPosts(); toggle($('reliefFields'),false); $('stationCode').value='';
  const loose=document.querySelector('input[name="deploymentMode"][value="LOOSE"]');if(loose)loose.checked=true;
  toggleDeploymentMode();
}


let coverageFilter='ALL';

function setCoverageFilter(filter){
  coverageFilter=filter;
  document.querySelectorAll('.coverage-filter').forEach(b=>b.classList.toggle('active',b.dataset.coverageFilter===filter));
  renderCoverageRegions();
}
function coverageCategory(type=''){
  const t=type.toLowerCase();
  if(t.includes('tankautospuit'))return 'TS';
  if(/hoogwerker|redvoertuig|ladder/.test(t))return 'HEIGHT';
  if(/watertank|watertransport|dompelpomp|bronpomp|slangen|wts/.test(t))return 'WATER';
  if(/hulpverlening|brandweervaartuig|oppervlaktewater|gevaarlijke|ontsmet|rietdak|schuim|commando|verkenning/.test(t))return 'SPECIAL';
  return 'OTHER';
}
function areaFleet(area){
  const posts=AREAS[area]||[];
  const all=[];
  posts.forEach(post=>(VEHICLES[post]||[]).forEach(v=>all.push({post,number:v.number,type:v.type,category:coverageCategory(v.type)})));
  return all;
}
function activeByCallsign(){
  const map=new Map();
  state.units.forEach(u=>{if(active(u))map.set(u.callsign,u);});
  return map;
}
function filteredFleet(area){
  const fleet=areaFleet(area);
  if(coverageFilter==='ALL')return fleet.filter(v=>['TS','HEIGHT','WATER','SPECIAL'].includes(v.category));
  return fleet.filter(v=>v.category===coverageFilter);
}
function coverageScore(area){
  const fleet=filteredFleet(area);
  const activeMap=activeByCallsign();
  const available=fleet.filter(v=>!activeMap.has(v.number));
  const total=fleet.length;
  const free=available.length;
  const ratio=total?free/total:1;

  let minimum=1;
  if(coverageFilter==='TS')minimum=2;
  if(coverageFilter==='ALL')minimum=4;

  let status='good';
  if(free<minimum)status='flash';
  else if(ratio<0.35)status='critical';
  else if(ratio<0.65)status='limited';

  return {area,fleet,available,total,free,ratio,status,activeMap};
}
function renderCoverageRegions(){
  ['Noord','Midden','Zuidoost','Zuidwest'].forEach(area=>{
    const data=coverageScore(area);
    const btn=document.querySelector(`.coverage-region[data-area="${area}"]`);
    if(!btn)return;
    btn.classList.remove('status-good','status-limited','status-critical','status-flash');
    btn.classList.add(`status-${data.status}`);
    const label=document.querySelector(`[data-label-area="${area}"]`);
    if(label)label.textContent=area;
    btn.setAttribute('aria-label',`${area}, ${data.free} van ${data.total} beschikbaar`);
    btn.setAttribute('tabindex','0');
    btn.setAttribute('role','button');
  });
}
function coverageVehicleCard(v,unit=null){
  const status=unit?unit.status:'Beschikbaar';
  const assignment=unit?.assignment||'';
  return `<div class="coverage-unit-card"><strong>${esc(v.number)} • ${esc(v.post)}</strong>${esc(v.type)}<br><span class="small">${esc(status)}${assignment?' · '+esc(assignment):''}</span>${unit?`<button onclick="jumpToCoverageUnit('${unit.id}')">Open eenheid</button>`:''}</div>`;
}
function openCoverageArea(area){
  const data=coverageScore(area);
  const dialog=$('coverageDialog');
  $('coverageDialogTitle').textContent=area;
  const filterLabels={ALL:'alle operationele slagkracht',TS:'tankautospuiten',HEIGHT:'hoogteredding',WATER:'waterlogistiek',SPECIAL:'specialismen'};
  $('coverageDialogSubtitle').textContent=`Restdekking voor ${filterLabels[coverageFilter]}.`;
  const badge=$('coverageDialogStatus');
  badge.className=`coverage-status-badge ${data.status}`;
  badge.textContent={good:'Voldoende',limited:'Beperkt',critical:'Kritiek',flash:'Onder minimum'}[data.status];

  const activeMap=data.activeMap;
  const deployed=data.fleet.filter(v=>activeMap.has(v.number));
  const activeUnits=deployed.map(v=>({vehicle:v,unit:activeMap.get(v.number)}));

  const categories=['TS','HEIGHT','WATER','SPECIAL'];
  const categoryLabels={TS:'TS',HEIGHT:'Hoogte',WATER:'Water',SPECIAL:'Specialismen'};
  $('coverageSummaryCards').innerHTML=categories.map(cat=>{
    const all=areaFleet(area).filter(v=>v.category===cat);
    const free=all.filter(v=>!activeMap.has(v.number)).length;
    return `<div><span>${categoryLabels[cat]}</span><strong>${free}</strong><div class="small">van ${all.length} vrij</div></div>`;
  }).join('');

  $('coverageAvailable').innerHTML=data.available.length
    ? data.available.map(v=>coverageVehicleCard(v)).join('')
    : '<div class="coverage-unit-card">Geen voertuigen beschikbaar binnen dit filter.</div>';

  $('coverageDeployed').innerHTML=activeUnits.length
    ? activeUnits.map(x=>coverageVehicleCard(x.vehicle,x.unit)).join('')
    : '<div class="coverage-unit-card">Geen ingezette of onderweg zijnde voertuigen.</div>';

  let platoons=[];
  if(window.PCLOG && typeof window.PCLOG.getPlatoonsForArea==='function'){
    platoons=window.PCLOG.getPlatoonsForArea(area);
  }
  $('coveragePlatoons').innerHTML=platoons.length
    ? platoons.map(p=>`<div class="coverage-unit-card"><strong>${esc(p.name)} • ${esc(p.platoonType)}</strong>${p.units} eenheden uit ${esc(area)}<br><span class="small">${esc(p.status)} · ${esc(p.sector||'')}</span></div>`).join('')
    : '<div class="coverage-unit-card">Geen gekoppelde pelotons met eenheden uit dit gebied.</div>';

  dialog.showModal();
}
window.jumpToCoverageUnit=unitId=>{
  $('coverageDialog').close();
  $('overview')?.scrollIntoView({behavior:'smooth'});
  const unit=state.units.find(u=>u.id===unitId);
  if(unit){$('search').value=unit.callsign;renderCards();}
};
window.openCoverageArea=openCoverageArea;

function postStatus(post){
  const units=state.units.filter(u=>u.source==='VGGM'&&u.post===post&&active(u));
  let level=''; const now=Date.now();
  units.forEach(u=>{
    const h=hoursSince(u.startTime);
    if(h>=4) level='danger'; else if(h>=3&&level!=='danger') level='warn'; else if(!level) level='active';
  });
  return {units,level};
}
function selectPost(p){
  state.selectedPost=p; renderMarkers(); renderPostInfo();
  const area=Object.keys(AREAS).find(a=>AREAS[a].includes(p));
  if(area){$('area').value=area;fillPosts();$('post').value=p;fillVehicles();fillTasks();}
}
function renderMarkers(){
  $('markers').innerHTML=Object.entries(POST_COORDS).map(([p,[x,y]])=>{
    const s=postStatus(p); const cls=['marker',s.level,state.selectedPost===p?'selected':'',s.units.length?'hascount':''].join(' ');
    return `<button class="${cls}" style="left:${x}%;top:${y}%" data-count="${s.units.length}" title="${esc(p)}" onclick="selectPost('${esc(p)}')"></button>`;
  }).join('');
}
window.selectPost=selectPost;
function renderPostInfo(){
  const p=state.selectedPost;
  if(!p){$('selectedPostInfo').textContent='Geen post geselecteerd.';return;}
  const veh=VEHICLES[p]||[], task=TASKS[p]||[], activeUnits=postStatus(p).units;
  $('selectedPostInfo').innerHTML=`<strong>${esc(p)} • ${veh.length} voertuigen</strong><div>Actief: ${activeUnits.length}</div><div class="chips">${task.map(t=>`<span class="chip">${esc(t)}</span>`).join('')}</div>`;
}


function platoonForUnit(unitId){
  if(!window.PCLOG || typeof window.PCLOG.getPlatoonForUnit!=='function') return null;
  return window.PCLOG.getPlatoonForUnit(unitId);
}
function unitPlatoonBadge(unitId){
  const p=platoonForUnit(unitId);
  return p ? `<span class="unit-platoon-badge">${esc(p.name)}</span>` : '';
}
function renderDashboard(){
  const activeUnits=state.units.filter(active);
  const platoonExtra=(window.PCLOG && typeof window.PCLOG.getExtraPlatoonPersonnel==='function')
    ? window.PCLOG.getExtraPlatoonPersonnel()
    : 0;
  $('statActive').textContent=activeUnits.length;
  $('statStaff').textContent=activeUnits.reduce((s,u)=>s+Number(u.crew||0),0)+Number(platoonExtra||0);

  const now=Date.now();
  let r60=0,unplanned=0;
  activeUnits.forEach(u=>{
    const next=(u.reliefs||[]).slice().sort((x,y)=>new Date(x.time)-new Date(y.time))[0];
    if(next){const d=new Date(next.time)-now;if(d>=0&&d<=3600000)r60++;}
    else if(hoursSince(u.startTime)>=3)unplanned++;
  });
  $('statRelief60').textContent=r60;
  $('statUnplanned').textContent=unplanned;
}
function renderTimeline(){
  const start=Date.now()-6*3600000,end=Date.now()+12*3600000,total=end-start;
  const rows=state.units.filter(active).map(u=>{
    const rel=(u.reliefs||[]).slice().sort((a,b)=>new Date(a.time)-new Date(b.time));
    const first=rel[0]?new Date(rel[0].time).getTime():Date.now();
    const l=Math.max(0,(new Date(u.startTime).getTime()-start)/total*100),w=Math.max(.8,(Math.min(first,end)-Math.max(new Date(u.startTime).getTime(),start))/total*100);
    const seg=rel.map((r,i)=>{const rs=new Date(r.time).getTime(),re=i+1<rel.length?new Date(rel[i+1].time).getTime():end;return `<div class="bar relief" style="left:${Math.max(0,(rs-start)/total*100)}%;width:${Math.max(.8,(Math.min(re,end)-Math.max(rs,start))/total*100)}%">${esc(r.unit||'Extern')} · ${esc(r.kind)}</div>`}).join('');
    return `<div class="tlrow"><div class="tllabel"><strong>${esc(unitLabel(u))}</strong>${unitPlatoonBadge(u.id)}<br>${esc(u.status)}</div><div class="tltrack"><div class="now" style="left:${(Date.now()-start)/total*100}%"></div><div class="bar" style="left:${l}%;width:${w}%">${esc(u.callsign)}</div>${seg}</div></div>`;
  }).join('');
  $('timelineRows').className='timeline'; $('timelineRows').innerHTML=rows||'<div class="postinfo">Nog geen actieve eenheden.</div>';
}
function renderCards(){
  const q=$('search').value.toLowerCase();
  const arr=state.units.filter(u=>JSON.stringify(u).toLowerCase().includes(q));
  $('cards').innerHTML=arr.map(u=>`<article class="card"><div class="cardhead"><div><span class="badge ${u.source==='VGGM'?'vggm':u.source==='VR'?'vr':'other'}">${esc(u.sourceCode)}</span><br><strong>${esc(unitLabel(u))}</strong>${unitPlatoonBadge(u.id)}</div><span class="badge status">${esc(u.status)}</span></div><div class="cardgrid"><div><strong>Inzetduur</strong>${duration(hoursSince(u.startTime))}</div><div><strong>Bezetting</strong>${u.crew}</div><div><strong>Inzetvak</strong>${esc(u.sector)}</div><div><strong>Aflossingen</strong>${(u.reliefs||[]).length}</div><div><strong>Opdracht</strong>${esc(u.assignment)}</div><div><strong>Contact</strong>${esc(u.commander)}</div></div><div class="cardactions"><button class="secondary" onclick="openRelief('${u.id}')">Aflossing</button><button class="secondary" onclick="cycleStatus('${u.id}')">Status</button><button class="danger" onclick="removeUnit('${u.id}')">Verwijder</button></div></article>`).join('')||'<div class="postinfo">Nog geen eenheden geregistreerd.</div>';
}
window.openRelief=id=>{
  const u=state.units.find(x=>x.id===id); if(!u)return;
  $('reliefUnitId').value=id; renderReliefChain(u); fillChainVehicles(); $('chainTime').value=nowInput(); $('reliefDialog').showModal();
};
window.cycleStatus=id=>{
  const order=['Onderweg','Ingezet','Aflossing gepland','Afgelost','Beschikbaar']; const u=state.units.find(x=>x.id===id);if(!u)return;
  u.status=order[(order.indexOf(u.status)+1)%order.length];addLog(`Status gewijzigd: ${unitLabel(u)} → ${u.status}`);save();render();
};
window.removeUnit=id=>{
  const u=state.units.find(x=>x.id===id);if(!u||!confirm('Eenheid verwijderen?'))return;
  state.units=state.units.filter(x=>x.id!==id);addLog(`Eenheid verwijderd: ${unitLabel(u)}`);save();render();
};
function renderReliefChain(u){
  $('reliefChain').innerHTML=(u.reliefs||[]).map((r,i)=>`<div class="reliefitem"><span>${i+1}. ${esc(r.unit||'Extern')} • ${new Date(r.time).toLocaleString('nl-NL')} • ${esc(r.kind)}</span><button type="button" class="danger" onclick="removeRelief('${u.id}','${r.id}')">×</button></div>`).join('')||'<div class="postinfo">Nog geen aflossingen.</div>';
}
window.removeRelief=(uidd,rid)=>{
  const u=state.units.find(x=>x.id===uidd);if(!u)return;u.reliefs=(u.reliefs||[]).filter(r=>r.id!==rid);addLog(`Aflossing verwijderd bij ${unitLabel(u)}`);save();renderReliefChain(u);render();
};
function addRelief(){
  const u=state.units.find(x=>x.id===$('reliefUnitId').value);if(!u)return;
  const external=$('chainSource').value!=='VGGM';
  let unit=external?$('chainExternal').value:$('chainVehicle').value;
  if(unit.startsWith('ACTIVE:')){const linked=state.units.find(x=>x.id===unit.split(':')[1]);if(linked)unit=linked.callsign;}
  if(!$('chainTime').value){alert('Vul een tijd in.');return;}
  u.reliefs=u.reliefs||[];u.reliefs.push({id:uid(),source:$('chainSource').value,post:external?'':$('chainPost').value,unit,time:$('chainTime').value,kind:$('chainKind').value,crew:Number($('chainCrew').value||0)});
  u.status='Aflossing gepland';addLog(`Aflossing toegevoegd bij ${unitLabel(u)}`);save();renderReliefChain(u);render();
}
function renderLog(){
  $('log').innerHTML=state.log.map(l=>`<div class="logitem"><strong>${new Date(l.time).toLocaleString('nl-NL')}</strong><br>${esc(l.text)}</div>`).join('')||'Nog geen wijzigingen.';
}
function exportCsv(){
  const rows=[['Herkomst','Regio/organisatie','Roepnummer','Post','Type','Status','Start','Inzetvak','Opdracht','Bezetting','Aflossingen']];
  state.units.forEach(u=>rows.push([u.source,u.sourceCode,u.callsign,u.post,u.type,u.status,u.startTime,u.sector,u.assignment,u.crew,JSON.stringify(u.reliefs||[])]));
  const csv=rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'}));a.download='command-platform-export.csv';a.click();
}
function clearAll(){
  if(!confirm('Alle inzetgegevens en het logboek wissen?'))return;state.units=[];state.log=[];save();render();
}
function render(){
  renderDashboard();renderCoverageRegions();renderMarkers();renderPostInfo();renderTimeline();renderCards();renderLog();
  if(typeof renderPcLog==='function') renderPcLog();
}

document.addEventListener('DOMContentLoaded',init);
