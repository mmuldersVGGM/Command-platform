
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

function init(){
  $('startTime').value=nowInput();
  fillAreas();
  fillRegions();
  fillAllPosts();
  bind();
  render();
  setInterval(()=>{ $('clock').textContent=new Date().toLocaleString('nl-NL'); render(); },60000);
  $('clock').textContent=new Date().toLocaleString('nl-NL');
  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}

function bind(){
  document.querySelectorAll('.quicknav button').forEach(b=>b.onclick=()=>$(b.dataset.target).scrollIntoView({behavior:'smooth'}));
  document.querySelectorAll('.step').forEach(b=>b.onclick=()=>goStep(Number(b.dataset.step)));
  document.querySelectorAll('.next').forEach(b=>b.onclick=()=>{const n=Number(b.dataset.next); if(validateStep(n-1)) goStep(n);});
  document.querySelectorAll('.prev').forEach(b=>b.onclick=()=>goStep(Number(b.dataset.prev)));
  document.querySelectorAll('input[name="source"]').forEach(r=>r.onchange=toggleSource);
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
  $('addRelief').onclick=addRelief;
}

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
  const rows=[['Herkomst',i.sourceCode],['Eenheid',unitLabel(i)],['Bezetting',i.crew],['Status',$('status').value],['Start',$('startTime').value?new Date($('startTime').value).toLocaleString('nl-NL'):''],['Inzetvak',$('sector').value],['Opdracht',$('assignment').value],['Aflossing',r?`${r.unit||'Extern'} om ${new Date(r.time).toLocaleString('nl-NL')}`:'Nog niet gepland']];
  $('review').innerHTML=rows.map(([a,b])=>`<div><strong>${esc(a)}</strong>${esc(b)}</div>`).join('');
}
function submitUnit(e){
  e.preventDefault();
  if(!validateStep(1)||!validateStep(2)||!validateStep(3)) return;
  const i=identity();
  const u={id:uid(),...i,status:$('status').value,startTime:$('startTime').value,sector:$('sector').value,commander:$('commander').value,assignment:$('assignment').value,notes:$('notes').value,reliefs:firstRelief()};
  state.units.push(u); addLog(`Eenheid geregistreerd: ${unitLabel(u)}`); save(); resetForm(); render(); goStep(1);
}
function resetForm(){
  $('unitForm').reset(); $('startTime').value=nowInput(); toggleSource(); fillPosts(); toggle($('reliefFields'),false); $('stationCode').value='';
}

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

function renderDashboard(){
  const a=state.units.filter(active), now=Date.now();
  $('statActive').textContent=a.length;
  $('statStaff').textContent=a.reduce((s,u)=>s+Number(u.crew||0),0);
  let r60=0,unplanned=0;
  a.forEach(u=>{
    const next=(u.reliefs||[]).slice().sort((x,y)=>new Date(x.time)-new Date(y.time))[0];
    if(next){const d=new Date(next.time)-now;if(d>=0&&d<=3600000)r60++;}
    else if(hoursSince(u.startTime)>=3)unplanned++;
  });
  $('statRelief60').textContent=r60; $('statUnplanned').textContent=unplanned;
}
function renderTimeline(){
  const start=Date.now()-6*3600000,end=Date.now()+12*3600000,total=end-start;
  const rows=state.units.filter(active).map(u=>{
    const rel=(u.reliefs||[]).slice().sort((a,b)=>new Date(a.time)-new Date(b.time));
    const first=rel[0]?new Date(rel[0].time).getTime():Date.now();
    const l=Math.max(0,(new Date(u.startTime).getTime()-start)/total*100),w=Math.max(.8,(Math.min(first,end)-Math.max(new Date(u.startTime).getTime(),start))/total*100);
    const seg=rel.map((r,i)=>{const rs=new Date(r.time).getTime(),re=i+1<rel.length?new Date(rel[i+1].time).getTime():end;return `<div class="bar relief" style="left:${Math.max(0,(rs-start)/total*100)}%;width:${Math.max(.8,(Math.min(re,end)-Math.max(rs,start))/total*100)}%">${esc(r.unit||'Extern')} · ${esc(r.kind)}</div>`}).join('');
    return `<div class="tlrow"><div class="tllabel"><strong>${esc(unitLabel(u))}</strong><br>${esc(u.status)}</div><div class="tltrack"><div class="now" style="left:${(Date.now()-start)/total*100}%"></div><div class="bar" style="left:${l}%;width:${w}%">${esc(u.callsign)}</div>${seg}</div></div>`;
  }).join('');
  $('timelineRows').className='timeline'; $('timelineRows').innerHTML=rows||'<div class="postinfo">Nog geen actieve eenheden.</div>';
}
function renderCards(){
  const q=$('search').value.toLowerCase();
  const arr=state.units.filter(u=>JSON.stringify(u).toLowerCase().includes(q));
  $('cards').innerHTML=arr.map(u=>`<article class="card"><div class="cardhead"><div><span class="badge ${u.source==='VGGM'?'vggm':u.source==='VR'?'vr':'other'}">${esc(u.sourceCode)}</span><br><strong>${esc(unitLabel(u))}</strong></div><span class="badge status">${esc(u.status)}</span></div><div class="cardgrid"><div><strong>Inzetduur</strong>${duration(hoursSince(u.startTime))}</div><div><strong>Bezetting</strong>${u.crew}</div><div><strong>Inzetvak</strong>${esc(u.sector)}</div><div><strong>Aflossingen</strong>${(u.reliefs||[]).length}</div><div><strong>Opdracht</strong>${esc(u.assignment)}</div><div><strong>Contact</strong>${esc(u.commander)}</div></div><div class="cardactions"><button class="secondary" onclick="openRelief('${u.id}')">Aflossing</button><button class="secondary" onclick="cycleStatus('${u.id}')">Status</button><button class="danger" onclick="removeUnit('${u.id}')">Verwijder</button></div></article>`).join('')||'<div class="postinfo">Nog geen eenheden geregistreerd.</div>';
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
  renderDashboard();renderMarkers();renderPostInfo();renderTimeline();renderCards();renderLog();
  if(typeof renderPcLog==='function') renderPcLog();
}

document.addEventListener('DOMContentLoaded',init);
