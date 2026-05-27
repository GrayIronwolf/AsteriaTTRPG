const RESOURCE_BASE = 10;
const resourceLinks = {hp:'constitution', sp:'endurance', mp:'wisdom'};
const statLabels = {strength:'STR', dexterity:'DEX', agility:'AGI', constitution:'CON', endurance:'END', intelligence:'INT', wisdom:'WIS', charisma:'CHA', luck:'LCK'};
function ensureCharacterData(){
  Object.values(chars).forEach(c=>{
    c.characteristics = c.characteristics || {strength:14,dexterity:20,agility:18,constitution:16,endurance:15,intelligence:14,wisdom:14,charisma:12,luck:10};
    c.resourceMods = c.resourceMods || {
      hp: Math.max(0,(c.hp?.[1]||RESOURCE_BASE) - RESOURCE_BASE - (c.characteristics.constitution||0)),
      sp: Math.max(0,(c.sp?.[1]||RESOURCE_BASE) - RESOURCE_BASE - (c.characteristics.endurance||0)),
      mp: Math.max(0,(c.mp?.[1]||RESOURCE_BASE) - RESOURCE_BASE - (c.characteristics.wisdom||0))
    };
    recalcResourceMax(c, false);
  });
}
function tierOf(v){return v>=80?'T5':v>=60?'T4':v>=40?'T3':v>=20?'T2':'T1'}
function calcMax(c,key){const stat=resourceLinks[key]; return RESOURCE_BASE + (c.characteristics?.[stat]||0) + (c.resourceMods?.[key]||0)}
function recalcResourceMax(c, clamp=true){['hp','sp','mp'].forEach(key=>{ const oldCur=c[key]?.[0]??RESOURCE_BASE; const max=calcMax(c,key); c[key]=[clamp?Math.min(oldCur,max):oldCur,max]; }); }
function resourceBreakdownHtml(c,key){const stat=resourceLinks[key], statLabel=statLabels[stat]||stat.toUpperCase(), statVal=c.characteristics?.[stat]||0, other=c.resourceMods?.[key]||0; return '<div class="break-row"><span>Base</span><b>'+RESOURCE_BASE+'</b></div><div class="break-row"><span>'+statLabel+'</span><b>+'+statVal+'</b></div><div class="break-row"><span>Other modifiers</span><b>+'+other+'</b></div><div class="break-row total"><span>Max '+key.toUpperCase()+'</span><b>'+calcMax(c,key)+'</b></div>'; }
function renderBreakdowns(prefix,c){['hp','sp','mp'].forEach(key=>{ const id=prefix+key.toUpperCase()+'Breakdown'; if($(id)) $(id).innerHTML=resourceBreakdownHtml(c,key); }); }
function currentPlayerId(){return session.role==='player' ? session.character : selected}
function syncAfterResourceChange(id){ if($('player')?.classList.contains('show')) loadPlayer(currentPlayerId()); if($('gm')?.classList.contains('show')) renderGM(); if($('gmPlayer')?.classList.contains('show')) renderGMPlayer(); }
function adjustCharacterResource(id,key,amount){ const c=chars[id]; if(!c) return; if(key==='xp'){ c.xp=Math.max(0,c.xp+amount); } else { c[key][0]=Math.max(0,Math.min(c[key][1],c[key][0]+amount)); } syncAfterResourceChange(id); toast(c.name+' '+key.toUpperCase()+' '+(amount>0?'+':'')+amount); }
function adjustPlayerResource(key,amount){ adjustCharacterResource(currentPlayerId(),key,amount); }
function customPlayerResource(sign){ const key=$('playerResourceKey')?.value||'hp'; const amount=Math.abs(+$('playerResourceAmount')?.value||0); if(amount) adjustPlayerResource(key, sign*amount); }
function customGMResource(sign){ const key=$('gmResourceKey')?.value||'hp'; const amount=Math.abs(+$('gmResourceAmount')?.value||0); if(amount) adjustCharacterResource(selected,key,sign*amount); }
function recalculatePlayerResources(){ const c=chars[currentPlayerId()]; recalcResourceMax(c,true); syncAfterResourceChange(currentPlayerId()); toast('HP / SP / MP recalculated from Base 10 + Characteristics + Modifiers.'); }
function recalculateGMPlayerResources(){ const c=chars[selected]; recalcResourceMax(c,true); syncAfterResourceChange(selected); toast('Player max resources recalculated.'); }

function $(id){return document.getElementById(id)}
function setTextSafe(id,value){const el=$(id); if(el) el.textContent=value}
function pct(a,b){return Math.max(0,Math.min(100,(a/b)*100))}
function toast(msg){const t=$('toast'); if(!t) return; t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3400)}
function updateRoleLocks(){const role=session?.role||'guest';document.querySelectorAll('.player-only,.gm-only,.auth-only').forEach(x=>x.classList.add('locked'));if(['player','account','gm'].includes(role))document.querySelectorAll('.player-only,.auth-only').forEach(x=>x.classList.remove('locked'));if(role==='gm')document.querySelectorAll('.gm-only').forEach(x=>x.classList.remove('locked'))}
function setView(id){
  if(id === 'home' && window.AsteriaRouter?.home && !window.__asteriaRoutingHome){
    return window.AsteriaRouter.home();
  }
  const requestedView = id;
  const role = session?.role || 'guest';
  if(id === 'player' && !['player', 'gm', 'account'].includes(role)){
    toast('Player system locked. Please log in.');
    id = 'home';
  }
  if(id === 'playerHome' && !['player', 'account', 'gm'].includes(role)){
    toast('Please log in to create or open characters.');
    id = 'home';
  }
  if(['gm', 'campaigns', 'gmPlayer'].includes(id) && !['gm', 'account'].includes(role)){
    toast('Campaign tools locked. Please log in first.');
    id = 'home';
  }
  if(id === 'home') window.AsteriaRouter?.restoreMainViews?.();
  document.querySelectorAll('.view').forEach(v => v.classList.remove('show'));
  const view = $(id);
  if(view) view.classList.add('show');
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === id));
  if(id === 'home') renderAccountHome?.();
  if(id === 'gm') renderGM?.();
  if(id === 'campaigns') renderCampaigns?.();
  if(id === 'gmPlayer') renderGMPlayer?.();
  if(id === 'player') loadPlayer?.(role === 'player' || role === 'account' ? session.character : selected);
  if(id === 'playerHome') renderPlayerHome?.();
  if(id === 'quests') renderQuests?.();
  if(id === 'library') renderRuleLibrary?.($('ruleSearch')?.value || '');
  window.AsteriaViewHooks?.runView(id, { requestedView, role });
}
function quickLogin(){toast('Demo logins have been removed. Please use Firebase login.')}
function attemptLogin(){if(typeof window.firebaseLoginFromPage==='function')return window.firebaseLoginFromPage();if(typeof window.firebaseLogin==='function')return window.firebaseLogin();toast('Firebase Authentication is still loading.')}
function logout(){session={role:'guest',character:null,account:null,uid:null,email:null};document.body.dataset.role='guest';$('accessSummary').textContent='Guest access. Log in to unlock your workspace dashboard.';updateRoleLocks();setView('home');toast('Logged out.')}
function openSettings(){$('settingsPanel').classList.add('open');$('shade').classList.add('open')}function closeSettings(){$('settingsPanel').classList.remove('open');$('shade').classList.remove('open')}

function loadPlayer(id){const c=chars[id];if(!c)return;window.AsteriaViewHooks?.runBeforePlayerLoad(id,{character:c});recalcResourceMax(c,true);$('pInitial').textContent=c.initial;$('pName').textContent=c.name;$('pRace').textContent=c.race;$('pClass').textContent=c.klass;$('pLevel').textContent='Level '+c.level;$('pHP').textContent=`${c.hp[0]} / ${c.hp[1]}`;$('pSP').textContent=`${c.sp[0]} / ${c.sp[1]}`;$('pMP').textContent=`${c.mp[0]} / ${c.mp[1]}`;$('pHpBar').style.width=pct(c.hp[0],c.hp[1])+'%';$('pSpBar').style.width=pct(c.sp[0],c.sp[1])+'%';$('pMpBar').style.width=pct(c.mp[0],c.mp[1])+'%';$('pXpBar').style.width=pct(c.xp,c.xpMax)+'%';$('pXpLine').textContent=`${c.xp.toLocaleString()} / ${c.xpMax.toLocaleString()} XP`;$('pCampaign').textContent=campaigns[activeCampaign].name;$('pSession').textContent=c.session;if($('pStats'))$('pStats').innerHTML=Object.entries(c.characteristics).map(([k,v])=>`<div><span>${statLabels[k]||k.slice(0,3).toUpperCase()}</span><b>${v}</b><small>${tierOf(v)}</small></div>`).join('');renderBreakdowns('p',c);if($('playerQuestList'))$('playerQuestList').innerHTML=quests.map(q=>`<div class="quest-row"><div><b>${q.name}</b><small>${q.detail}</small></div><span>${q.status}</span></div>`).join('');window.AsteriaViewHooks?.runPlayerLoad(id,{character:c});}

function renderCampaigns(){if(!$('campaignList'))return;$('campaignList').innerHTML='';campaigns.forEach((c,i)=>{let b=document.createElement('button');b.className='campaign-card'+(i===activeCampaign?' active':'');b.innerHTML=`<b>${c.name}</b><small>Party ${c.party.length}/${c.partySize}</small>`;b.onclick=()=>selectCampaign(i);$('campaignList').appendChild(b)});selectCampaign(activeCampaign,false)}
function selectCampaign(i,go=true){activeCampaign=i;let c=campaigns[i];$('campaignNameInput').value=c.name;$('partySizeInput').value=c.partySize;$('loginSetup').innerHTML='<p class="muted">Campaign access now uses Firebase accounts and invite links.</p>';$('campaignAccess').innerHTML=Object.keys(c.access).map(k=>`<label><input type="checkbox" ${c.access[k]?'checked':''}> ${k}</label>`).join('');if(go)toast('Active campaign set to '+c.name)}
function createCampaign(){campaigns.push({name:'New Campaign',party:['kael'],partySize:1,access:{dashboard:true,inventory:true,spells:true,journal:true,quests:true,notes:false}});activeCampaign=campaigns.length-1;renderCampaigns();toast('New campaign added.')}
function deleteCampaign(){if(campaigns.length<=1){toast('At least one campaign is required.');return}campaigns.splice(activeCampaign,1);activeCampaign=0;renderCampaigns();toast('Campaign deleted.')}
function saveCampaignSettings(){campaigns[activeCampaign].name=$('campaignNameInput').value||'Untitled Campaign';campaigns[activeCampaign].partySize=+$('partySizeInput').value||campaigns[activeCampaign].party.length;renderCampaigns();toast('Campaign settings saved.')}
function line(label,val,max,cls){return `<div class="resource-line"><b>${label}</b><div class="mini-meter ${cls}"><i style="width:${pct(val,max)}%"></i></div><span>${val}/${max}</span></div>`}
function renderGM(){const c=campaigns[activeCampaign];setTextSafe('gmCampaignTitle',c.name);setTextSafe('partyCampaignLabel',c.name+' party.');setTextSafe('topPlayers',c.party.length);setTextSafe('topEncounters',enemies.length);setTextSafe('topCreatures',Object.keys(creatures).length);if($('partyRoster'))$('partyRoster').innerHTML='';c.party.forEach(id=>{const ch=chars[id];let b=document.createElement('button');b.className='roster-btn'+(id===selected?' active':'');b.innerHTML=`<b>${ch.name}</b><small>${ch.klass} • Level ${ch.level}</small><div class="resource-stack">${line('HP',ch.hp[0],ch.hp[1],'hp')}${line('SP',ch.sp[0],ch.sp[1],'sp')}${line('MP',ch.mp[0],ch.mp[1],'mp')}${line('XP',ch.xp,ch.xpMax,'xp')}</div>`;b.onclick=()=>{selected=id;renderGM()};b.ondblclick=()=>openGMPlayer(id);$('partyRoster')?.appendChild(b)});renderInitiative();renderEnemies();renderCreatureSelect()}
function renderInitiative(){$('initCount').textContent=initiative.length;$('initiativeRows').innerHTML=initiative.map((x,i)=>`<div class="init-row ${i===turnIndex?'active':''}"><b>${i+1}. ${x.name}</b><input type="number" value="${x.roll}" onchange="initiative[${i}].roll=+this.value"><button onclick="initiative.splice(${i},1);renderInitiative()">×</button></div>`).join('')}
function addInitiative(){if(!$('initName').value||!$('initRoll').value)return toast('Add a name and initiative roll.');initiative.push({name:$('initName').value,roll:+$('initRoll').value,type:'enemy'});$('initName').value='';$('initRoll').value='';renderInitiative()}
function sortInitiative(){initiative.sort((a,b)=>b.roll-a.roll);turnIndex=0;renderInitiative();toast('Initiative sorted.')}function nextTurn(){turnIndex=(turnIndex+1)%initiative.length;renderInitiative();toast('Turn: '+initiative[turnIndex].name)}
function renderEnemies(){$('enemyCount').textContent=enemies.length;$('enemyRows').innerHTML=enemies.map((e,i)=>`<div class="enemy-row"><button onclick="openCreature('${e.id}')"><b>${e.name}</b></button><span>${e.hp}/${e.max} HP</span><span>${e.status}</span><button onclick="enemyHP(${i},-5)">-5</button><button onclick="enemyHP(${i},5)">+5</button><button onclick="enemies.splice(${i},1);renderEnemies()">×</button></div>`).join('')}
function renderCreatureSelect(){$('creatureSelect').innerHTML=Object.entries(creatures).map(([id,c])=>`<option value="${id}">${c.name} — ${c.tier}</option>`).join('')}
function addEnemy(){enemies.push({id:'custom',name:'New Enemy',hp:50,max:50,status:'None'});renderEnemies();toast('Blank enemy added.')}function enemyHP(i,a){enemies[i].hp=Math.max(0,Math.min(enemies[i].max,enemies[i].hp+a));renderEnemies()}
function addEnemyFromCreature(id=$('creatureSelect').value){const c=creatures[id];if(!c)return;enemies.push({id,name:c.name,hp:c.hp,max:c.hp,status:c.status});initiative.push({name:c.name,roll:c.initiative,type:'enemy'});renderEnemies();renderInitiative();toast(c.name+' added from Creature Database.')}
function addViewedCreatureToEncounter(){addEnemyFromCreature(viewedCreature);setView('gm')}
function openCreature(id){viewedCreature=id;const c=creatures[id];if(!c)return;$('creatureName').textContent=c.name;$('creatureMeta').textContent=`${c.type} • ${c.tier}`;$('creatureStats').textContent=`HP ${c.hp} • SP ${c.sp} • MP ${c.mp} • AC ${c.ac} • Initiative ${c.initiative}`;$('creatureNotes').textContent=c.notes;$('creatureAttacks').innerHTML=c.attacks.map(a=>`<div class="attack-row"><b>${a[0]}</b><button onclick="rollDice('${a[0]} Attack','${a[1]}')">Attack ${a[1]}</button><button onclick="rollDice('${a[0]} Damage','${a[2]}')">Damage ${a[2]}</button></div>`).join('');setView('creature')}
function renderQuests(){const html=quests.map(q=>`<div class="quest-row"><div><b>${q.name}</b><small>${q.detail}</small></div><span>${q.status}</span></div>`).join('');$('questList').innerHTML=html}
function addQuest(){quests.push({name:'New Quest',status:'Draft',detail:'Add quest details here.'});renderQuests();toast('Quest added.')}
function createPlayerCharacter(){const nm=$('newCharName')?.value||'New Character';toast('Character draft created: '+nm);}
function openGMPlayer(id){selected=id;setView('gmPlayer')}
function renderGMPlayer(){const c=chars[selected];recalcResourceMax(c,true);$('gpName').textContent=c.name;$('gpLine').textContent=c.race+' • '+c.klass;$('gpHPTxt').textContent=`${c.hp[0]} / ${c.hp[1]}`;$('gpSPTxt').textContent=`${c.sp[0]} / ${c.sp[1]}`;$('gpMPTxt').textContent=`${c.mp[0]} / ${c.mp[1]}`;$('gpXPTxt').textContent=c.xp+' XP';$('gpHpBar').style.width=pct(c.hp[0],c.hp[1])+'%';$('gpSpBar').style.width=pct(c.sp[0],c.sp[1])+'%';$('gpMpBar').style.width=pct(c.mp[0],c.mp[1])+'%';renderBreakdowns('gp',c);$('conditionsList').innerHTML=(c.conditions||[]).map((x,i)=>`<p><b>${x.name}</b> — ${x.rounds} rounds <button onclick="chars[selected].conditions.splice(${i},1);renderGMPlayer()">remove</button></p>`).join('')||'<p class="muted">No active conditions.</p>'}

function addCondition(){if(!$('conditionName').value)return;chars[selected].conditions.push({name:$('conditionName').value,rounds:$('conditionRounds').value||1});$('conditionName').value='';$('conditionRounds').value='';renderGMPlayer();toast('Condition added.')}
function adjustStat(key,amount,stay=false){adjustCharacterResource(selected,key,amount)}


function parseDice(f){let m=f.match(/(\d*)d(\d+)([+-]\d+)?/i);if(!m)return{total:0,rolls:[]};let n=+(m[1]||1),s=+m[2],mod=+(m[3]||0),rolls=[];for(let i=0;i<n;i++)rolls.push(Math.floor(Math.random()*s)+1);return{rolls,total:rolls.reduce((a,b)=>a+b,0)+mod,mod}}
function rollDice(label,formula){const r=parseDice(formula);toast(`${label}: ${formula} = ${r.total} (${r.rolls.join(', ')}${r.mod?`, mod ${r.mod}`:''})`)}
function heal(label,amount){toast(`${label}: ${amount>100?'full recovery':'restored '+amount}`)}function saveNotes(){toast('GM notes saved locally for test build.')}
function escapeHtml(s){return (s||'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function inlineMd(s){return escapeHtml(s).replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\*(.*?)\*/g,'<em>$1</em>').replace(/`([^`]+)`/g,'<code>$1</code>')}
function mdToHtml(md){const lines=(md||'').split(/\r?\n/);let html='',inList=false,inQuote=false,table=[];const closeList=()=>{if(inList){html+='</ul>';inList=false}};const closeQuote=()=>{if(inQuote){html+='</blockquote>';inQuote=false}};const flushTable=()=>{if(!table.length)return;html+='<div class="table-wrap"><table>';let body=false;table.forEach((row,i)=>{if(/^\s*\|?\s*:?-+:?/.test(row))return;let cells=row.split('|').map(x=>x.trim()).filter((x,idx,arr)=>!(idx===0&&x==='')&&!(idx===arr.length-1&&x===''));if(i===0){html+='<thead><tr>';cells.forEach(c=>html+='<th>'+inlineMd(c)+'</th>');html+='</tr></thead><tbody>';body=true}else{html+='<tr>';cells.forEach(c=>html+='<td>'+inlineMd(c)+'</td>');html+='</tr>'}});html+=(body?'</tbody>':'')+'</table></div>';table=[]};for(let raw of lines){let line=raw.trim();if(!line){closeList();closeQuote();flushTable();continue}if(line.includes('|')&&!line.startsWith('>')&&!line.startsWith('-')){closeList();closeQuote();table.push(line);continue}else{flushTable()}if(line.startsWith('>')){closeList();if(!inQuote){html+='<blockquote>';inQuote=true}html+='<p>'+inlineMd(line.replace(/^>\s*/,''))+'</p>';continue}else closeQuote();let h=line.match(/^(#{1,4})\s+(.*)$/);if(h){closeList();html+=`<h${h[1].length+1}>${inlineMd(h[2])}</h${h[1].length+1}>`;continue}if(/^[-*]\s+/.test(line)){if(!inList){html+='<ul>';inList=true}html+='<li>'+inlineMd(line.replace(/^[-*]\s+/,''))+'</li>';continue}closeList();html+='<p>'+inlineMd(line)+'</p>'}closeList();closeQuote();flushTable();return html}
function cleanDisplayName(name){return String(name||"").replace(/^DND\\s*-\\s*SYSTEMS\\s*-\\s*MECHANICS$/i,"Asteria Handbook").replace(/^\\d+\\.\\s*/,"").replace(/^NPC\\s*-\\s*STAT\\s*BLOCKS$/i,"NPCs").replace(/^Creatures$/i,"Creatures & Encounters").trim()}
function cleanCategory(cat){return String(cat||"").split("/").map(cleanDisplayName).join(" / ")}
function buildDynamicSystemsMenu(){const root=$('dynamicSystemsMenu');if(!root)return;const tree={};function branch(parts){let node=tree,last=null;parts.filter(Boolean).forEach(part=>{node[part]=node[part]||{_pages:[],_children:{}};last=node[part];node=last._children});return last}rulePages.forEach(p=>{let parts=(p.category||'Uncategorised').split('/').filter(Boolean);if(cleanDisplayName(parts[0])!=='Asteria Handbook')return;parts=parts.slice(1);if(!parts.length)parts=['Core Pages'];branch(parts)._pages.push(p)});function renderNode(obj,depth=0){return Object.entries(obj).sort((a,b)=>cleanDisplayName(a[0]).localeCompare(cleanDisplayName(b[0]))).map(([name,val])=>{const pages=(val._pages||[]).sort((a,b)=>a.title.localeCompare(b.title)).map(p=>`<button class="page-link" onclick="openRulePage('${p.slug}')">${cleanDisplayName(p.title)}</button>`).join('');return `<details ${depth<1?'open':''}><summary>${cleanDisplayName(name)}</summary>${pages}${renderNode(val._children,depth+1)}</details>`}).join('')}root.innerHTML=renderNode(tree)||'<p class="muted">No handbook pages found.</p>'}
function ruleCats(){return [...new Set(rulePages.map(p=>p.category))]}
function renderRuleLibrary(q='',cat=null){if(cat&&window.AsteriaWorkspace?.openCategory)window.AsteriaWorkspace.openCategory(cat)}
function openRuleCategory(cat){if(window.AsteriaWorkspace?.openCategory){window.AsteriaWorkspace.openCategory(cat);return}toast('Workspace is still loading.')}
function openRulePage(slug){if(window.AsteriaWorkspace?.openEntryBySlug?.(slug))return;toast('Workspace note not found: '+slug)}

document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  $('loginToggle').onclick=()=>$('loginPanel').classList.toggle('open');
  $('settingsToggle').onclick=openSettings;$('settingsClose').onclick=closeSettings;$('shade').onclick=closeSettings;
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');document.querySelectorAll('.tabpane').forEach(p=>p.classList.remove('show'));$(b.dataset.tab).classList.add('show')});
  buildDynamicSystemsMenu();
  ensureCharacterData();updateRoleLocks();loadPlayer('kael');renderCampaigns();renderGM();renderCreatureSelect();renderRuleLibrary();renderQuests();
});

/* =========================
   v1.2.1 Condition System
   ========================= */
const conditionLibrary={
  Poisoned:{icon:'☠',effect:'Takes 2 HP damage when their turn becomes active.',tick:{hp:-2},skip:false},
  Burning:{icon:'🔥',effect:'Takes 3 HP damage when their turn becomes active.',tick:{hp:-3},skip:false},
  Bleeding:{icon:'🩸',effect:'Takes 1 HP damage when their turn becomes active.',tick:{hp:-1},skip:false},
  Stunned:{icon:'💫',effect:'Skips their active turn.',tick:{},skip:true}
};
function conditionIcon(name){return (conditionLibrary[name]?.icon)||'◇'}
function ensureConditions(){Object.values(chars).forEach(c=>c.conditions=c.conditions||[]);enemies.forEach(e=>e.conditions=e.conditions||[])}
function conditionChips(list=[]){return list.length?`<div class="condition-chips">${list.map(c=>`<span title="${conditionLibrary[c.name]?.effect||c.effect||''}">${conditionIcon(c.name)} ${c.name} (${c.rounds})</span>`).join('')}</div>`:''}
function playerIdByName(name){return Object.keys(chars).find(id=>chars[id].name===name||chars[id].name.split(' ')[0]===name)}
function enemyByName(name){return enemies.find(e=>e.name===name)}
function applyConditionTick(entity,isPlayer=true){if(!entity||!entity.conditions?.length)return;let notes=[];entity.conditions.forEach(c=>{const def=conditionLibrary[c.name]||{};if(def.tick?.hp){ if(isPlayer){entity.hp[0]=Math.max(0,entity.hp[0]+def.tick.hp);} else {entity.hp=Math.max(0,entity.hp+def.tick.hp);} notes.push(`${conditionIcon(c.name)} ${c.name} ${def.tick.hp} HP`);} if(def.skip)notes.push(`${conditionIcon(c.name)} ${c.name}: skip turn`);c.rounds=Number(c.rounds||1)-1;});entity.conditions=entity.conditions.filter(c=>Number(c.rounds)>0);if(notes.length)toast(notes.join(' • '));}
function applyTurnConditions(active){const pid=playerIdByName(active.name);if(pid){applyConditionTick(chars[pid],true);return}const enemy=enemyByName(active.name);if(enemy)applyConditionTick(enemy,false)}

// Override turn flow so conditions tick as turns advance.
nextTurn=function(){
  if(!initiative.length)return toast('No initiative entries.');
  turnIndex=(turnIndex+1)%initiative.length;
  if(turnIndex===0){const r=$('roundNo'); if(r) r.textContent=(+r.textContent||1)+1;}
  const active=initiative[turnIndex];
  applyTurnConditions(active);
  renderInitiative();renderEnemies();renderGM();
  toast('Turn: '+active.name);
};

renderInitiative=function(){
  ensureConditions();
  $('initCount').textContent=initiative.length;
  $('initiativeRows').innerHTML=initiative.map((x,i)=>{
    const pid=playerIdByName(x.name); const ent=pid?chars[pid]:enemyByName(x.name); const chips=ent?conditionChips(ent.conditions):'';
    return `<div class="init-row ${i===turnIndex?'active':''}"><div><b>${i+1}. ${x.name}</b>${chips}</div><input type="number" value="${x.roll}" onchange="initiative[${i}].roll=+this.value"><button onclick="initiative.splice(${i},1);renderInitiative()">×</button></div>`
  }).join('');
};

renderEnemies=function(){
  ensureConditions();
  $('enemyCount').textContent=enemies.length;
  $('enemyRows').innerHTML=enemies.map((e,i)=>`<div class="enemy-row condition-enemy-row"><button onclick="openCreature('${e.id}')"><b>${e.name}</b>${conditionChips(e.conditions)}</button><span>${e.hp}/${e.max} HP</span><span>${e.status||'None'}</span><button onclick="enemyHP(${i},-5)">-5</button><button onclick="enemyHP(${i},5)">+5</button><button onclick="enemies.splice(${i},1);renderEnemies();renderInitiative()">×</button><div class="enemy-condition-controls"><select id="enemyCond${i}"><option>Poisoned</option><option>Burning</option><option>Bleeding</option><option>Stunned</option></select><input id="enemyCondRounds${i}" type="number" value="3" min="1"><button onclick="addEnemyCondition(${i})">Add Condition</button></div></div>`).join('');
};
function addEnemyCondition(i){const name=$(`enemyCond${i}`).value;const rounds=+$(`enemyCondRounds${i}`).value||1;enemies[i].conditions=enemies[i].conditions||[];enemies[i].conditions.push({name,rounds});renderEnemies();renderInitiative();toast(`${name} applied to ${enemies[i].name}.`)}

renderGM=function(){
  ensureConditions();
  const c=campaigns[activeCampaign];setTextSafe('gmCampaignTitle',c.name);setTextSafe('partyCampaignLabel',c.name+' party.');setTextSafe('topPlayers',c.party.length);setTextSafe('topEncounters',enemies.length);setTextSafe('topCreatures',Object.keys(creatures).length);if($('partyRoster'))$('partyRoster').innerHTML='';
  c.party.forEach(id=>{const ch=chars[id];let b=document.createElement('button');b.className='roster-btn'+(id===selected?' active':'');b.innerHTML=`<b>${ch.name}</b><small>${ch.klass} • Level ${ch.level}</small>${conditionChips(ch.conditions)}<div class="resource-stack">${line('HP',ch.hp[0],ch.hp[1],'hp')}${line('SP',ch.sp[0],ch.sp[1],'sp')}${line('MP',ch.mp[0],ch.mp[1],'mp')}${line('XP',ch.xp,ch.xpMax,'xp')}</div>`;b.onclick=()=>{selected=id;renderGM()};b.ondblclick=()=>openGMPlayer(id);$('partyRoster')?.appendChild(b)});
  renderInitiative();renderEnemies();renderCreatureSelect();
  window.AsteriaViewHooks?.runGMRender({campaign:c});
};

window.AsteriaViewHooks?.afterPlayerLoad('legacy-player-condition-box', id => {const c=chars[id];const target=document.querySelector('#player .leftcol .resources');if(target){let box=document.getElementById('playerConditionsBox');if(!box){box=document.createElement('div');box.id='playerConditionsBox';box.className='player-conditions';target.appendChild(box)}box.innerHTML=`<h4>Active Conditions</h4>${conditionChips(c.conditions)||'<p class="muted smallnote">No active conditions.</p>'}`;}});

renderGMPlayer=function(){
  ensureConditions();
  const c=chars[selected];window.AsteriaViewHooks?.runBeforeGMPlayerRender(selected,{character:c});recalcResourceMax(c,true);$('gpName').textContent=c.name;$('gpLine').textContent=c.race+' • '+c.klass;$('gpHPTxt').textContent=`${c.hp[0]} / ${c.hp[1]}`;$('gpSPTxt').textContent=`${c.sp[0]} / ${c.sp[1]}`;$('gpMPTxt').textContent=`${c.mp[0]} / ${c.mp[1]}`;$('gpXPTxt').textContent=c.xp+' XP';$('gpHpBar').style.width=pct(c.hp[0],c.hp[1])+'%';$('gpSpBar').style.width=pct(c.sp[0],c.sp[1])+'%';$('gpMpBar').style.width=pct(c.mp[0],c.mp[1])+'%';renderBreakdowns('gp',c);
  $('conditionsList').innerHTML=(c.conditions||[]).map((x,i)=>`<div class="condition-row"><span>${conditionIcon(x.name)} <b>${x.name}</b></span><small>${x.rounds} rounds</small><em>${conditionLibrary[x.name]?.effect||''}</em><button onclick="chars[selected].conditions.splice(${i},1);renderGMPlayer();renderGM();">remove</button></div>`).join('')||'<p class="muted">No active conditions.</p>';
  window.AsteriaViewHooks?.runGMPlayerRender(selected,{character:c});
};
addCondition=function(){const name=$('conditionName').value;if(!name)return;chars[selected].conditions=chars[selected].conditions||[];chars[selected].conditions.push({name,rounds:+($('conditionRounds').value||1)});renderGMPlayer();renderGM();toast(name+' added to '+chars[selected].name+'.')}
function quickAddCondition(name){chars[selected].conditions=chars[selected].conditions||[];chars[selected].conditions.push({name,rounds:3});renderGMPlayer();renderGM();toast(name+' added to '+chars[selected].name+'.')}

const oldAddEnemy=addEnemy;
addEnemy=function(){enemies.push({id:'custom',name:'New Enemy',hp:50,max:50,status:'None',conditions:[]});renderEnemies();toast('Blank enemy added.')}
const oldAddEnemyFromCreature=addEnemyFromCreature;
addEnemyFromCreature=function(id=$('creatureSelect').value){const c=creatures[id];if(!c)return;enemies.push({id,name:c.name,hp:c.hp,max:c.hp,status:c.status,conditions:[]});initiative.push({name:c.name,roll:c.initiative,type:'enemy'});renderEnemies();renderInitiative();toast(c.name+' added from Creature Database.')}

/* =========================
   v1.2.2 Roll System
   Digital dice + physical dice entry + animated result + history
   ========================= */
let asteriaRollHistory=[];
let rollPanelCollapsed=false;
function rollerName(){ if(session.role==='player' && chars[session.character]) return chars[session.character].name; if(session.role==='gm') return 'GM'; return 'Guest'; }
function parseDiceFormula(formula){ const text=String(formula||'1d20').replace(/\s+/g,''); const m=text.match(/^(\d*)d(\d+)([+-]\d+)?$/i); if(!m) return {valid:false,formula:text,rolls:[],sides:20,count:1,mod:0,total:0}; const count=Math.max(1,Math.min(50,Number(m[1]||1))); const sides=Math.max(2,Math.min(1000,Number(m[2]||20))); const mod=Number(m[3]||0); const rolls=[]; for(let i=0;i<count;i++) rolls.push(Math.floor(Math.random()*sides)+1); const rawTotal=rolls.reduce((a,b)=>a+b,0); return {valid:true,formula:text,count,sides,mod,rolls,rawTotal,total:rawTotal+mod,natural:count===1?rolls[0]:null}; }
function rollStatus(parsed){ if(!parsed.valid) return {label:'Invalid',cls:'normal'}; if(parsed.count===1 && parsed.sides===20 && parsed.natural===20) return {label:'CRITICAL HIT',cls:'crit'}; if(parsed.count===1 && parsed.sides===20 && parsed.natural===1) return {label:'CRITICAL FAIL',cls:'fail'}; if(parsed.count===1 && parsed.sides===100 && parsed.natural===100) return {label:'EXCEPTIONAL SUCCESS',cls:'crit'}; if(parsed.count===1 && parsed.sides===100 && parsed.natural===1) return {label:'SEVERE FAILURE',cls:'fail'}; return {label:'Result',cls:'normal'}; }
function addRollHistory(entry){ asteriaRollHistory.unshift({...entry,time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}); asteriaRollHistory=asteriaRollHistory.slice(0,30); renderRollHistory(); }
function renderRollHistory(){ const box=$('rollHistory'); if(!box) return; box.innerHTML=asteriaRollHistory.length?asteriaRollHistory.map(r=>`<div class="roll-entry ${r.cls||''}"><div><b>${r.label}</b><small>${r.mode} • ${r.roller} • ${r.time}</small></div><strong>${r.total}</strong><span>${r.detail}</span></div>`).join(''):'<p class="muted smallnote">No rolls yet.</p>'; }
function animateDice(finalValue,cls='normal'){ const cube=$('diceCube'), title=$('rollResultTitle'), line=$('rollResultLine'); if(!cube||!title||!line) return Promise.resolve(); cube.className='dice-cube rolling'; cube.textContent='✦'; title.textContent='Rolling...'; line.textContent='Dice are in motion.'; return new Promise(resolve=>setTimeout(()=>{cube.className='dice-cube '+cls; cube.textContent=String(finalValue); resolve();},650)); }
function showRollResult(entry){ const title=$('rollResultTitle'), line=$('rollResultLine'); if(title) title.textContent=(entry.statusLabel==='Result'?entry.label:entry.statusLabel+'!'); if(line) line.textContent=`${entry.roller}: ${entry.detail}`; toast(`${entry.label}: ${entry.total}`); }
async function rollDice(label='Roll', formula='1d20+0'){ const parsed=parseDiceFormula(formula); if(!parsed.valid){toast('Invalid dice formula. Use 1d20+5 or 1d100+10.');return 0;} const status=rollStatus(parsed); await animateDice(parsed.total,status.cls); const detail=`${parsed.formula} → [${parsed.rolls.join(', ')}]${parsed.mod?` ${parsed.mod>0?'+':''}${parsed.mod}`:''} = ${parsed.total}`; const entry={mode:'Digital',roller:rollerName(),label,total:parsed.total,detail,cls:status.cls,statusLabel:status.label}; addRollHistory(entry); showRollResult(entry); return parsed.total; }
function quickDigitalFormula(formula){$('digitalRollFormula').value=formula;}
function quickDigitalRoll(){rollDice($('digitalRollLabel')?.value||'Quick Roll',$('digitalRollFormula')?.value||'1d20+0');}
function submitPhysicalRoll(){ const label=$('physicalRollLabel')?.value||'Physical Roll'; const sides=Number($('physicalDie')?.value||20); let raw=Number($('physicalRaw')?.value||0); const mod=Number($('physicalMod')?.value||0); if(raw<1||raw>sides){toast(`Physical result must be between 1 and ${sides}.`);return;} const total=raw+mod; const parsed={valid:true,count:1,sides,natural:raw,total,mod,rolls:[raw],formula:`1d${sides}${mod?`${mod>0?'+':''}${mod}`:''}`}; const status=rollStatus(parsed); animateDice(total,status.cls).then(()=>{ const detail=`Physical d${sides} → ${raw}${mod?` ${mod>0?'+':''}${mod}`:''} = ${total}`; const entry={mode:'Physical',roller:rollerName(),label,total,detail,cls:status.cls,statusLabel:status.label}; addRollHistory(entry); showRollResult(entry); }); }
function setRollMode(mode){ $('digitalRollBox')?.classList.toggle('show',mode==='digital'); $('physicalRollBox')?.classList.toggle('show',mode==='physical'); $('digitalModeBtn')?.classList.toggle('active',mode==='digital'); $('physicalModeBtn')?.classList.toggle('active',mode==='physical'); }
function toggleRollPanel(){ rollPanelCollapsed=!rollPanelCollapsed; $('rollPanel')?.classList.toggle('collapsed',rollPanelCollapsed); }
function clearRollHistory(){asteriaRollHistory=[];renderRollHistory();toast('Roll history cleared.');}
document.addEventListener('DOMContentLoaded',()=>{renderRollHistory();});

/* =========================
   v1.2.4 Inventory Interaction
   Use consumables + equip / unequip gear
   ========================= */
const itemDatabase={
  'minor-health-potion':{name:'Minor Health Potion',type:'Consumable',slot:null,qty:3,effect:{resource:'hp',amount:20},desc:'Restores 20 HP when used.'},
  'stamina-draught':{name:'Stamina Draught',type:'Consumable',slot:null,qty:2,effect:{resource:'sp',amount:15},desc:'Restores 15 SP when used.'},
  'mana-vial':{name:'Mana Vial',type:'Consumable',slot:null,qty:2,effect:{resource:'mp',amount:15},desc:'Restores 15 MP when used.'},
  'umbral-daggers':{name:'Daggers of Umbral',type:'Weapon',slot:'Main Hand',qty:1,effect:null,desc:'Paired shadow-forged daggers. Attack 1d20+8, Damage 1d6+5.'},
  'shadowcloak':{name:'Shadowcloak',type:'Armour',slot:'Back',qty:1,effect:null,desc:'A cloak that bends dim light around the wearer.'},
  'ring-agility':{name:'Ring of Agility',type:'Accessory',slot:'Ring',qty:1,effect:null,desc:'A ring linked to movement, balance, and reflexes.'}
};
function ensureInventory(){
  Object.values(chars).forEach(c=>{
    if(!c.inventory){
      c.inventory=['minor-health-potion','stamina-draught','mana-vial','umbral-daggers','shadowcloak','ring-agility'].map(id=>({...itemDatabase[id],id,equipped:['umbral-daggers','shadowcloak','ring-agility'].includes(id)}));
    }
  });
}
function renderInventory(){
  ensureInventory();
  const id=currentPlayerId(); const c=chars[id]; if(!c)return;
  const inv=$('inventoryList'), eq=$('equippedList'); if(!inv||!eq)return;
  inv.innerHTML=c.inventory.map((it,i)=>`<div class="inventory-item" id="inv-${it.id}"><header><div><b>${it.name}</b><p class="muted smallnote">${it.desc||''}</p></div><span class="item-chip">x${it.qty}</span></header><div class="item-meta"><span class="item-chip">${it.type}</span>${it.slot?`<span class="item-chip">${it.slot}</span>`:''}${it.equipped?'<span class="item-chip">Equipped</span>':''}</div><div class="item-actions">${it.type==='Consumable'?`<button onclick="useInventoryItem('${it.id}')">Use</button>`:''}${it.slot?`<button onclick="toggleEquipItem('${it.id}')">${it.equipped?'Unequip':'Equip'}</button>`:''}<button onclick="toast('Opened item page: ${it.name}')">Open Page</button></div></div>`).join('');
  const equipped=c.inventory.filter(x=>x.equipped);
  eq.innerHTML=equipped.length?equipped.map(it=>`<div class="equipped-item"><header><b>${it.slot}</b><span class="item-chip">${it.type}</span></header><div>${it.name}</div><div class="item-actions"><button onclick="toggleEquipItem('${it.id}')">Unequip</button><button onclick="toast('Opened item page: ${it.name}')">Open Page</button></div></div>`).join(''):'<div class="empty-slot">No equipped items.</div>';
}
function useInventoryItem(itemId){
  ensureInventory(); const c=chars[currentPlayerId()]; if(!c)return; const it=c.inventory.find(x=>x.id===itemId);
  if(!it||it.qty<=0){toast('No item available.');return}
  if(it.type!=='Consumable'||!it.effect){toast(it.name+' is not usable yet.');return}
  const key=it.effect.resource, amount=it.effect.amount;
  c[key][0]=Math.max(0,Math.min(c[key][1],c[key][0]+amount));
  it.qty-=1;
  if(typeof addRollHistory==='function') addRollHistory({mode:'Item',roller:c.name,label:it.name,total:'+'+amount,detail:`${it.name}: +${amount} ${key.toUpperCase()}`,cls:'normal'});
  syncAfterResourceChange(currentPlayerId()); renderInventory();
  const el=$('inv-'+itemId); if(el) el.classList.add('inventory-change');
  toast(`${it.name}: +${amount} ${key.toUpperCase()}`);
}
function toggleEquipItem(itemId){
  ensureInventory(); const c=chars[currentPlayerId()]; if(!c)return; const it=c.inventory.find(x=>x.id===itemId); if(!it||!it.slot)return;
  if(!it.equipped){ c.inventory.forEach(x=>{ if(x.slot===it.slot) x.equipped=false; }); it.equipped=true; toast(it.name+' equipped.'); }
  else { it.equipped=false; toast(it.name+' unequipped.'); }
  renderInventory();
}
window.AsteriaViewHooks?.afterPlayerLoad('legacy-inventory-render', () => renderInventory());
ensureInventory();

/* =========================
   v1.2.7 Polish & Stability
   Adds level notifications, combat log, clearer feedback, active turn/target polish
   ========================= */
let asteriaCombatLog=[];
function addCombatLog(message,type='normal'){asteriaCombatLog.unshift({message,type,time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})});asteriaCombatLog=asteriaCombatLog.slice(0,80);renderCombatLog();}
function renderCombatLog(){const box=$('combatLogRows');if(!box)return;box.innerHTML=asteriaCombatLog.length?asteriaCombatLog.map(x=>`<div class="combat-log-entry ${x.type==='important'?'important':''}"><b>${x.message}</b><small>${x.time}</small></div>`).join(''):'<p class="muted smallnote">No combat events yet.</p>';}
function clearCombatLog(){asteriaCombatLog=[];renderCombatLog();feedback('Combat log cleared.');}
function feedback(msg,type='normal'){const stack=$('feedbackStack');if(!stack)return;const el=document.createElement('div');el.className='float-feedback '+type;el.textContent=msg;stack.appendChild(el);setTimeout(()=>el.remove(),1700);}
function flashResource(key){const ids={hp:['pHpBar','gpHpBar'],sp:['pSpBar','gpSpBar'],mp:['pMpBar','gpMpBar'],xp:['pXpBar']};(ids[key]||[]).forEach(id=>{const el=$(id);if(el){el.classList.remove('resource-flash');void el.offsetWidth;el.classList.add('resource-flash');}});}
function showLevelModal(c,details){if(!$('levelModal'))return;$('levelModalTitle').textContent=`Level Up! ${c.name} is now Level ${c.level}`;$('levelModalBody').innerHTML=`<p>${c.name} has grown in power.</p><div><span class="reward-chip">+3 CP</span><span class="reward-chip">+3 TP</span>${details.bonusTP?'<span class="reward-chip">+10 Milestone TP</span>':''}${details.skillChoice?'<span class="reward-chip">Skill Development Choice</span>':''}</div><ul>${details.messages.map(m=>`<li>${m}</li>`).join('')}</ul>`;$('levelModal').classList.add('show');}
function closeLevelModal(){$('levelModal')?.classList.remove('show');}
adjustCharacterResource=function(id,key,amount){const c=chars[id];if(!c)return;const old=key==='xp'?c.xp:c[key][0];if(key==='xp'){c.xp=Math.max(0,c.xp+amount);checkLevelUp(id);}else{c[key][0]=Math.max(0,Math.min(c[key][1],c[key][0]+amount));}const now=key==='xp'?c.xp:c[key][0];syncAfterResourceChange(id);flashResource(key);const diff=now-old;const sign=diff>0?'+':'';const type=diff>=0?'good':'bad';feedback(`${c.name} ${key.toUpperCase()} ${sign}${diff}`,type);addCombatLog(`${c.name} ${key.toUpperCase()} ${old} → ${now}`);toast(`${c.name} ${key.toUpperCase()} ${sign}${diff}`);};
adjustStat=function(key,amount,stay=false){adjustCharacterResource(selected,key,amount);};
window.AsteriaViewHooks?.beforePlayerLoad('ensure-progression-data', () => ensureProgressionData(), {defer:false});
window.AsteriaViewHooks?.afterPlayerLoad('progression-condition-summary', id => {const c=chars[id];if($('pProgressionLine'))$('pProgressionLine').innerHTML=`CP: <b>${c.cp}</b> - TP: <b>${c.tp}</b> - Skill choices: <b>${c.pendingSkillChoices||0}</b>`;let existing=document.querySelector('.player-conditions');if(existing)existing.remove();const res=document.querySelector('.character-card .resources');if(res){const wrap=document.createElement('div');wrap.className='player-conditions';wrap.innerHTML='<h4>Conditions</h4>'+((c.conditions||[]).length?(c.conditions||[]).map(x=>`<span class="condition-chip">${conditionIcon(x.name)} ${x.name} (${x.rounds})</span>`).join(' '):'<p class="muted smallnote">No active conditions.</p>');res.appendChild(wrap);}});
window.AsteriaViewHooks?.beforeGMPlayerRender('ensure-gm-player-progression-data', () => ensureProgressionData(), {defer:false});
window.AsteriaViewHooks?.afterGMPlayerRender('gm-player-progression-summary', id => {const c=chars[id];const host=document.querySelector('#gmPlayer .gm-player-grid section:first-child');if(host&&!host.querySelector('.progression-summary')){const div=document.createElement('div');div.className='progression-summary';host.appendChild(div);}const div=host?.querySelector('.progression-summary');if(div)div.innerHTML=`<h3>Progression</h3><p>Level ${c.level} • CP <b>${c.cp}</b> • TP <b>${c.tp}</b> • Skill Choices <b>${c.pendingSkillChoices||0}</b></p><button onclick="adjustCharacterResource(selected,'xp',1000)">+1000 XP</button><button onclick="showMilestoneChoice(selected)">Milestone Choice</button>`;});
renderInitiative=function(){if(!$('initiativeRows'))return;$('initCount').textContent=initiative.length;$('initiativeRows').innerHTML=initiative.map((x,i)=>{const pcId=Object.keys(chars).find(id=>chars[id].name===x.name);const enemy=enemies.find(e=>e.name===x.name);const conds=pcId?(chars[pcId].conditions||[]):(enemy?.conditions||[]);return `<div class="init-row ${i===turnIndex?'active':''}"><div><b>${i+1}. ${x.name}</b>${i===turnIndex?'<small>Current Turn</small>':''}<div class="condition-chips">${conds.map(c=>`<span>${conditionIcon(c.name)} ${c.rounds}</span>`).join('')}</div></div><input type="number" value="${x.roll}" onchange="initiative[${i}].roll=+this.value"><button onclick="initiative.splice(${i},1);renderInitiative();addCombatLog('Removed initiative entry.')">×</button></div>`;}).join('');};
let selectedEnemyIndex=0;renderEnemies=function(){if(!$('enemyRows'))return;$('enemyCount').textContent=enemies.length;$('enemyRows').innerHTML=enemies.map((e,i)=>`<div class="enemy-row ${i===selectedEnemyIndex?'selected-target':''}"><button onclick="selectedEnemyIndex=${i};renderEnemies();feedback('Target: ${e.name}')"><b>${e.name}</b><small>select target</small></button><span>${e.hp}/${e.max} HP</span><span>${e.status}</span><button onclick="enemyHP(${i},-5)">-5</button><button onclick="enemyHP(${i},5)">+5</button><button onclick="enemies.splice(${i},1);renderEnemies();addCombatLog('Enemy removed.')">×</button><div class="condition-chips">${(e.conditions||[]).map(c=>`<span>${conditionIcon(c.name)} ${c.name} (${c.rounds})</span>`).join('')}</div><div class="enemy-condition-controls"><select id="enemyCond${i}"><option>Poisoned</option><option>Burning</option><option>Bleeding</option><option>Stunned</option></select><input id="enemyCondRounds${i}" type="number" value="3"><button onclick="addEnemyCondition(${i})">Add Condition</button></div></div>`).join('');};
enemyHP=function(i,a){const e=enemies[i];if(!e)return;const old=e.hp;e.hp=Math.max(0,Math.min(e.max,e.hp+a));renderEnemies();feedback(`${e.name} HP ${a>0?'+':''}${e.hp-old}`,a>=0?'good':'bad');addCombatLog(`${e.name} HP ${old} → ${e.hp}`);};
const asteriaNextTurn=nextTurn;nextTurn=function(){if(!initiative.length)return toast('No initiative entries.');asteriaNextTurn();const active=initiative[turnIndex];addCombatLog(`Current turn: ${active.name}`,'important');feedback(`Turn: ${active.name}`);};
const asteriaRollDice=rollDice;rollDice=async function(label='Roll',formula='1d20+0'){const total=await asteriaRollDice(label,formula);addCombatLog(`${rollerName()} rolled ${label}: ${total}`);return total;};
const asteriaUseInventoryItem=useInventoryItem;useInventoryItem=function(itemId){const c=chars[currentPlayerId()];const item=c?.inventory?.find(x=>x.id===itemId);asteriaUseInventoryItem(itemId);if(item)addCombatLog(`${c.name} used ${item.name}.`);};
function buildVersionBadge(){const hero=document.querySelector('.home-hero');if(hero&&!hero.querySelector('.version-badge')){const b=document.createElement('div');b.className='version-badge';b.textContent='v1.2.9 • Player Dashboard Rework';hero.prepend(b);}}
ensureProgressionData();document.addEventListener('DOMContentLoaded',()=>{ensureProgressionData();renderCombatLog();buildVersionBadge();});

/* =========================
   v1.2.9 Player Dashboard Layout Sync
   ========================= */
const playerAges={kael:32,lyra:128,tharrnak:42,mako:29};
const campaignNotes={
  'Shadows of Elarion':'A dark fantasy campaign focused on cursed woods, fading souls, and the hidden costs of old bargains.',
  'Secrets of the Void':'A mystery campaign following eldritch ruins, planar cracks, and forbidden research.'
};
const playerAC={kael:17,lyra:12,tharrnak:18,mako:15};
const playerInitiative={kael:+7,lyra:+4,tharrnak:+1,mako:+3};
function splitSessionLine(line){
  const m=String(line||'Session 1: Untitled Session').match(/(Session\s*\d+)\s*:?\s*(.*)/i);
  return {no:m?m[1]:'Session 1', title:m?(m[2]||'Untitled Session'):'Untitled Session'};
}
function renderPlayerExtras(id){
  const c=chars[id]; if(!c) return;
  const sessionInfo=splitSessionLine(c.session);
  if($('pAge')) $('pAge').textContent=playerAges[id]||'—';
  if($('pCampaignNote')) $('pCampaignNote').textContent=campaignNotes[c.campaign]||'Campaign notes will appear here when the GM starts the session.';
  if($('pSessionNo')) $('pSessionNo').textContent=sessionInfo.no;
  if($('pSession')) $('pSession').textContent=sessionInfo.title;
  if($('pInitiativeBox')) $('pInitiativeBox').textContent=(playerInitiative[id]>=0?'+':'')+(playerInitiative[id]||0);
  if($('pArmorClassShield')) $('pArmorClassShield').textContent=playerAC[id]||10;
  if($('pStatsLarge')) $('pStatsLarge').innerHTML=Object.entries(c.characteristics||{}).map(([k,v])=>`<div class="stat-card"><small>${tierOf(v)}</small><span>${statLabels[k]||k}</span><br><b>${v}</b><p class="muted">${k[0].toUpperCase()+k.slice(1)}</p></div>`).join('');
  if($('playerConditionsInline')) $('playerConditionsInline').innerHTML=(c.conditions||[]).length?(c.conditions||[]).map(x=>`<span class="condition-chip">${(typeof conditionIcon==='function')?conditionIcon(x.name):''} ${x.name} (${x.rounds})</span>`).join(''):'<p class="muted smallnote">No active conditions.</p>';
}
window.AsteriaViewHooks?.afterPlayerLoad('player-dashboard-extras', id => renderPlayerExtras(id));
function performAttack(){
  if(typeof actionAttack==='function') return actionAttack();
  if(typeof rollDice==='function') return rollDice('Attack','1d20+5');
  toast('Attack roll triggered.');
}
function castSpell(){
  if(typeof actionSpell==='function') return actionSpell();
  const id=currentPlayerId();
  if(chars[id]) adjustCharacterResource(id,'mp',-10);
  if(typeof rollDice==='function') rollDice('Spell Attack','1d20+4');
  toast('Spell cast: MP -10');
}
function startSession(){ toast('Session started. Logs are now being collected.'); }
function endSession(){
  const stamp=new Date().toLocaleString();
  toast('Session ended. Session note generated for GM logs.');
  if(typeof addCombatLog==='function')addCombatLog('Session ended: logs saved into GM session note • '+stamp,'important');
}

/* =========================
   v1.2.9 Quick Action Roll + Dashboard Combat Log
   ========================= */
function focusQuickRoll(){
  const box=document.getElementById('quickRollStation');
  if(box){ box.scrollIntoView({behavior:'smooth',block:'center'}); box.classList.add('pulse-panel'); setTimeout(()=>box.classList.remove('pulse-panel'),900); }
  if(typeof setRollMode==='function') setRollMode('digital');
}
const oldBuildVersionBadge_v129=typeof buildVersionBadge==='function'?buildVersionBadge:function(){};
buildVersionBadge=function(){oldBuildVersionBadge_v129();const b=document.querySelector('.version-badge');if(b)b.textContent='v1.2.9 • Dashboard Roll + Combat Log';}

/* =========================
   v1.2.10 Navigation, Resource Input, Dice Modal, CP/TP Placement
   ========================= */
function openDiceModal(){
  const modal=document.getElementById('diceModal');
  if(modal){ modal.classList.add('show'); if(typeof setRollMode==='function') setRollMode('digital'); }
}
function closeDiceModal(){ document.getElementById('diceModal')?.classList.remove('show'); }
function playerResourceDelta(key,sign){
  const map={hp:'pHPAmount',sp:'pSPAmount',mp:'pMPAmount'};
  const amount=Math.abs(Number(document.getElementById(map[key])?.value||0));
  if(!amount) return toast('Enter an amount first.');
  adjustPlayerResource(key, sign*amount);
}
focusQuickRoll=function(){ openDiceModal(); };

const asteria1210BuildVersionBadge=typeof buildVersionBadge==='function'?buildVersionBadge:function(){};
buildVersionBadge=function(){asteria1210BuildVersionBadge();const b=document.querySelector('.version-badge');if(b)b.textContent='v1.2.10 • Player Dashboard + CP/TP Sync';}

/* =========================
   v1.2.11 GM XP Sync + New Character Reset
   ========================= */
function xpSummaryForCampaign(){
  const camp=campaigns[activeCampaign];
  if(!camp) return '';
  return camp.party.map(id=>{
    const c=chars[id];
    return `<div class="xp-split-row"><span>${c.name}</span><b>Level ${c.level}</b><small>${(c.xp||0).toLocaleString()} / ${(c.xpMax||xpToNextLevel(c.level)).toLocaleString()} XP</small></div>`;
  }).join('');
}
function updateXPSplitPreview(){
  const amount=Math.max(0,Number($('campaignXPAmount')?.value||0));
  const camp=campaigns[activeCampaign];
  const count=camp?.party?.length||0;
  const share=count?Math.floor(amount/count):0;
  const rem=count?amount%count:0;
  if($('campaignXPSplitPreview')) $('campaignXPSplitPreview').textContent=count?`Split: ${share.toLocaleString()} XP each${rem?` + ${rem} remainder distributed from top of roster`:''}.`:'No players in campaign.';
}
function distributeCampaignXP(){
  ensureProgressionData();
  const amount=Math.max(0,Number($('campaignXPAmount')?.value||0));
  const camp=campaigns[activeCampaign];
  if(!amount || !camp || !camp.party.length){toast('Enter an XP amount to split.');return;}
  const share=Math.floor(amount/camp.party.length);
  let remainder=amount%camp.party.length;
  const results=[];
  camp.party.forEach(id=>{
    const bonus=remainder>0?1:0; if(remainder>0) remainder--;
    const add=share+bonus;
    if(add>0){
      const beforeLevel=chars[id].level;
      adjustCharacterResource(id,'xp',add);
      results.push(`${chars[id].name} +${add.toLocaleString()} XP${chars[id].level>beforeLevel?` → Level ${chars[id].level}`:''}`);
    }
  });
  if(typeof addCombatLog==='function') addCombatLog(`GM split ${amount.toLocaleString()} XP across ${camp.name}: ${results.join('; ')}`,'important');
  if(typeof feedback==='function') feedback(`Campaign XP split: ${amount.toLocaleString()}`,'level');
  toast(`XP split across ${camp.party.length} players.`);
  syncAfterResourceChange(selected);
  renderXPSplitPanel();
}
function renderXPSplitPanel(){
  if($('xpSplitPartyList')) $('xpSplitPartyList').innerHTML=xpSummaryForCampaign();
  updateXPSplitPreview();
}
window.AsteriaViewHooks?.afterGMRender('xp-split-panel', () => renderXPSplitPanel());
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent='v1.2.11 • GM XP Sync + New Character Reset';}
document.addEventListener('DOMContentLoaded',()=>{ensureProgressionData();renderXPSplitPanel();});

/* =========================
   v1.2.12 Class Talent Trees + Strong GM/Player Sync
   ========================= */
const ASTERIA_STATE_KEY='asteria-v1-2-12-state';
function cloneAsteria(obj){return JSON.parse(JSON.stringify(obj));}
function saveAsteriaState(){
  try{
    localStorage.setItem(ASTERIA_STATE_KEY, JSON.stringify({chars, campaigns, activeCampaign, enemies, initiative, savedAt:Date.now()}));
    localStorage.setItem('asteria-sync-ping', String(Date.now()));
  }catch(e){console.warn('Save failed',e);}
}
function loadAsteriaState(){
  try{
    const raw=localStorage.getItem(ASTERIA_STATE_KEY);
    if(!raw) return;
    const state=JSON.parse(raw);
    if(state.chars) Object.keys(state.chars).forEach(id=>{ chars[id]=Object.assign(chars[id]||{}, state.chars[id]); });
    if(Array.isArray(state.campaigns)) campaigns=state.campaigns;
    if(typeof state.activeCampaign==='number') activeCampaign=state.activeCampaign;
    if(Array.isArray(state.enemies)) enemies=state.enemies;
    if(Array.isArray(state.initiative)) initiative=state.initiative;
  }catch(e){console.warn('Load failed',e);}
}
function refreshSyncedViews(){
  ensureCharacterData();
  ensureProgressionData();
  const current=currentPlayerId();
  if(document.getElementById('player')?.classList.contains('show')) loadPlayer(current);
  if(document.getElementById('gm')?.classList.contains('show')) renderGM();
  if(document.getElementById('gmPlayer')?.classList.contains('show')) renderGMPlayer();
  renderXPSplitPanel();
  renderTalentTreeUI(current);
}
window.addEventListener('storage',e=>{ if(e.key===ASTERIA_STATE_KEY || e.key==='asteria-sync-ping'){ loadAsteriaState(); refreshSyncedViews(); toast('Asteria data synced.'); }});

const asteria1212OldAdjustCharacterResource=adjustCharacterResource;
adjustCharacterResource=function(id,key,amount){
  asteria1212OldAdjustCharacterResource(id,key,amount);
  saveAsteriaState();
  refreshSyncedViews();
};
const asteria1212OldApplyCharacteristicCP=applyCharacteristicCP;
applyCharacteristicCP=function(){ asteria1212OldApplyCharacteristicCP(); saveAsteriaState(); refreshSyncedViews(); };

const asteria1212OldDistributeXP=distributeCampaignXP;
distributeCampaignXP=function(){ asteria1212OldDistributeXP(); saveAsteriaState(); refreshSyncedViews(); };
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent='v1.2.12 • Class Talent Trees + Fixed GM/Player Sync';}
document.addEventListener('DOMContentLoaded',()=>{ loadAsteriaState(); refreshSyncedViews(); buildVersionBadge(); });

/* =========================
   v1.3 Account Login + Character Hub + Campaign Character Assignment
   ========================= */
const ASTERIA_ACCOUNT_KEY='asteria-v1-3-accounts';
var accountUsers={};
function loadAccountState(){
  try{
    const raw=localStorage.getItem(ASTERIA_ACCOUNT_KEY);
    if(raw){
      const data=JSON.parse(raw);
      if(data.accountUsers) accountUsers=data.accountUsers;
      Object.keys(accountUsers).forEach(key=>{ if(accountUsers[key]?.password==='test' && !accountUsers[key]?.uid) delete accountUsers[key]; });
    }
  }catch(e){console.warn('Account load failed',e)}
}
function saveAccountState(){
  try{ localStorage.setItem(ASTERIA_ACCOUNT_KEY, JSON.stringify({accountUsers})); }catch(e){console.warn('Account save failed',e)}
}
function characterInitial(name){return String(name||'?').trim().charAt(0).toUpperCase()||'?'}
function normaliseId(name){
  let base=String(name||'character').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'character';
  let id=base, n=1; while(chars[id]){id=base+'-'+(++n)} return id;
}
const asteria13OldCurrentPlayerId=currentPlayerId;
currentPlayerId=function(){
  if(['player','account'].includes(session.role)) return session.character || (accountUsers[session.account||session.uid||session.user]?.characters?.[0]) || selected;
  return selected;
}
function renderPlayerHome(){
  loadAccountState();
  const account=session.account||session.user;
  const rec=accountUsers[account];
  if(!rec){ if($('accountCharacterCards')) $('accountCharacterCards').innerHTML='<p class="muted">No player account loaded.</p>'; return; }
  if($('accountWelcome')) $('accountWelcome').textContent=`${account}'s Characters`;
  const ids=(rec.characters||[]).filter(id=>chars[id]);
  const host=$('accountCharacterCards'); if(!host) return;
  host.innerHTML=ids.length?ids.map(id=>{
    const c=chars[id];
    return `<button class="account-character-card" onclick="openAccountCharacter('${id}')"><div class="big-initial">${c.initial||characterInitial(c.name)}</div><h3>${c.name}</h3><p class="muted">${c.race||'Unselected Race'} • ${c.klass||'Unselected Class'}</p><div class="resource-stack">${line('HP',c.hp[0],c.hp[1],'hp')}${line('SP',c.sp[0],c.sp[1],'sp')}${line('MP',c.mp[0],c.mp[1],'mp')}${line('XP',c.xp,c.xpMax,'xp')}</div><span class="pill">Open Dashboard</span></button>`;
  }).join(''):'<p class="muted">No characters yet. Create your first character to begin.</p>';
}
function openAccountCharacter(id){
  if(!chars[id]) return toast('Character not found.');
  session.character=id; selected=id; loadPlayer(id); saveAsteriaState(); setView('player'); toast('Opened '+chars[id].name+'.');
}
function toggleCharacterCreator(){ $('characterCreator')?.classList.toggle('show'); }
function createCharacterForAccount(){
  const account=session.account||session.user;
  if(!accountUsers[account]) return toast('Log in to a player account first.');
  const name=($('newCharName')?.value||'New Character').trim();
  const id=normaliseId(name);
  const race=($('newCharRace')?.value||'Unselected').trim();
  const klass=($('newCharClass')?.value||'New Character').trim();
  chars[id]={initial:characterInitial(name),name,race,klass,age:($('newCharAge')?.value||''),level:0,hp:[10,10],sp:[10,10],mp:[10,10],xp:0,xpMax:5000,campaign:'Unassigned',session:'No active session',conditions:[],cp:0,tp:0,resourceMods:{hp:0,sp:0,mp:0},characteristics:{strength:0,dexterity:0,agility:0,constitution:0,endurance:0,intelligence:0,wisdom:0,charisma:0,luck:0},inventory:[]};
  accountUsers[account].characters=accountUsers[account].characters||[];
  accountUsers[account].characters.push(id);
  saveAccountState(); saveAsteriaState(); renderPlayerHome(); toast('Character created: '+name);
}
function createAccount(){
  window.setView?.('accountCreate');
  toast('Accounts are created through Firebase.');
}
quickLogin=function(){toast('Demo logins have been removed. Please use Firebase login.')}
attemptLogin=function(){
  if(typeof window.firebaseLoginFromPage==='function')return window.firebaseLoginFromPage();
  if(typeof window.firebaseLogin==='function')return window.firebaseLogin();
  toast('Firebase Authentication is still loading.');
}
const asteria13OldLogout=logout;
logout=function(){ session={role:'guest',character:null,account:null,uid:null,email:null}; document.body.dataset.role='guest'; updateRoleLocks(); window.AsteriaAuthBridge?.updateTopButtons?.(); setView('home'); toast('Logged out.'); }
window.AsteriaViewHooks?.afterView('player-home-render', 'playerHome', () => renderPlayerHome());
function allCharacterIds(){return Object.keys(chars).sort((a,b)=>chars[a].name.localeCompare(chars[b].name));}
function ownerOfCharacter(id){
  for(const [account,rec] of Object.entries(accountUsers)){ if((rec.characters||[]).includes(id)) return account; }
  return 'Unassigned';
}
const asteria13OldSelectCampaign=selectCampaign;
selectCampaign=function(i,go=true){
  activeCampaign=i; const c=campaigns[i];
  if($('campaignNameInput')) $('campaignNameInput').value=c.name;
  if($('partySizeInput')) $('partySizeInput').value=c.partySize;
  if($('loginSetup')) $('loginSetup').innerHTML='<p class="muted">Campaign members are invited with campaign links. Account passwords are managed by Firebase.</p>';
  if($('campaignAccess')) $('campaignAccess').innerHTML=Object.keys(c.access||{}).map(k=>`<label><input type="checkbox" ${c.access[k]?'checked':''}> ${k}</label>`).join('');
  let picker=document.getElementById('campaignCharacterPicker');
  if(!picker && $('campaignAccess')){
    picker=document.createElement('div'); picker.id='campaignCharacterPicker'; picker.className='campaign-character-picker';
    const heading=document.createElement('h4'); heading.textContent='Characters In Campaign';
    $('campaignAccess').parentNode.insertBefore(heading,$('campaignAccess'));
    $('campaignAccess').parentNode.insertBefore(picker,$('campaignAccess'));
  }
  if(picker) picker.innerHTML=allCharacterIds().map(id=>`<label><input type="checkbox" value="${id}" ${c.party.includes(id)?'checked':''}> <b>${chars[id].name}</b> <small>${chars[id].klass||'Class'} • Account: ${ownerOfCharacter(id)}</small></label>`).join('');
  if(go) toast('Active campaign set to '+c.name);
}
saveCampaignSettings=function(){
  const c=campaigns[activeCampaign];
  c.name=$('campaignNameInput')?.value||'Untitled Campaign';
  const picked=[...document.querySelectorAll('#campaignCharacterPicker input:checked')].map(x=>x.value);
  c.party=picked; c.partySize=+$('partySizeInput')?.value||picked.length||1;
  picked.forEach(id=>{ if(chars[id]) chars[id].campaign=c.name; });
  saveAsteriaState(); renderCampaigns(); if($('gm')?.classList.contains('show')) renderGM(); toast('Campaign settings saved. Characters assigned.');
}
createCampaign=function(){
  campaigns.push({name:'New Campaign',party:[],partySize:4,access:{dashboard:true,inventory:true,spells:true,journal:true,quests:true,notes:false}});
  activeCampaign=campaigns.length-1; saveAsteriaState(); renderCampaigns(); toast('New campaign added. Assign characters in settings.');
}
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent='v1.3 • Account Login + Character Hub';}
document.addEventListener('DOMContentLoaded',()=>{loadAccountState(); buildVersionBadge();});

/* =========================================================
   v1.3.1 Visual Talent Tree + Multi-Class Layout
   ========================================================= */
const asteria131ClassIcons={ranger:'🏹',druid:'🌿',artificer:'⚙️',bloodhunter:'🩸',cleric:'✦',paladin:'🛡️'};
const asteriaClassIcons=asteria131ClassIcons;
let activeTalentFocus='multi';
let selectedTalentNode=null;
function talentClassFromText(text=''){
  const k=String(text).toLowerCase();
  const out=[];
  if(k.includes('ranger'))out.push('ranger');
  if(k.includes('druid'))out.push('druid');
  if(k.includes('artificer'))out.push('artificer');
  if(k.includes('blood'))out.push('bloodhunter');
  if(k.includes('cleric'))out.push('cleric');
  if(k.includes('paladin'))out.push('paladin');
  return [...new Set(out)];
}
function getCharacterTalentClasses(c){
  const fromClass=talentClassFromText(c?.klass||'');
  const saved=c?.talentClasses||[];
  const single=c?.talentClass?[c.talentClass]:[];
  const list=[...saved,...fromClass,...single].filter(Boolean).filter(k=>asteriaClassTalentTrees[k]);
  return [...new Set(list.length?list:['ranger'])];
}
function setTalentFocus(focus){ activeTalentFocus=focus; renderTalentTreeUI(currentPlayerId()); }
function sanitizeTalentId(s){return String(s).replace(/[^a-z0-9]/gi,'_');}
function treeIconForTalent(name,type){
  const s=(name+' '+type).toLowerCase();
  if(s.includes('blood'))return '🩸'; if(s.includes('divine')||s.includes('sacred')||s.includes('holy')||s.includes('faith'))return '✦';
  if(s.includes('nature')||s.includes('wild')||s.includes('storm')||s.includes('root')||s.includes('verdant'))return '🌿';
  if(s.includes('construct')||s.includes('smith')||s.includes('gadget')||s.includes('blueprint'))return '⚙️';
  if(s.includes('mark')||s.includes('shot')||s.includes('hunt')||s.includes('arrow')||s.includes('stalk'))return '🏹';
  if(s.includes('aura')||s.includes('guardian')||s.includes('protection')||s.includes('oath'))return '🛡️';
  if(s.includes('active'))return '✦'; if(s.includes('react'))return '↯'; return '•';
}
function visualPositions(tree){
  const tiers=tree.tiers||[]; const positions=[];
  const xVals=tiers.length===2?[33,67]:tiers.length===3?[25,50,75]:[18,39,61,82];
  tiers.forEach((tier,ti)=>{
    const talents=tier.talents||[]; const count=talents.length; const spread=Math.min(62, Math.max(36,count*9)); const start=52-spread/2;
    talents.forEach((talent,i)=>{
      const y=count===1?52:start+(spread/(count-1||1))*i;
      positions.push({tierIndex:ti,talentIndex:i,tier,talent,x:xVals[ti]||50,y});
    });
  });
  return positions;
}
function renderClassTreeCanvas(id,classKey,compact=false){
  const c=chars[id]; ensureTalentData(id); const tree=asteriaClassTalentTrees[classKey]||asteriaClassTalentTrees.ranger;
  const positions=visualPositions(tree); const byTier={}; positions.forEach(p=>(byTier[p.tierIndex]=byTier[p.tierIndex]||[]).push(p));
  const tierLabels=(tree.tiers||[]).map((tier,i)=>`<div class="tree-tier-label" style="left:${positions.find(p=>p.tierIndex===i)?.x||50}%">${tier.name.replace('Tier ','T')}</div>`).join('');
  let lines='';
  for(let i=0;i<(tree.tiers||[]).length-1;i++){
    (byTier[i]||[]).forEach(a=>{(byTier[i+1]||[]).forEach(b=>{
      const an=a.talent[0], bn=b.talent[0]; const ar=c.talents?.[an]?.rank||0; const active=ar>0 && c.level>=b.tier.unlock;
      lines+=`<line class="${active?'active':''}" x1="${a.x}%" y1="${a.y}%" x2="${b.x}%" y2="${b.y}%"></line>`;
    });});
  }
  const nodes=positions.map(p=>{
    const [name,type,max,desc]=p.talent; const cur=c.talents?.[name]?.rank||0; const staged=talentDrafts[id]?.[name]||0; const rank=cur+staged; const locked=c.level<p.tier.unlock; const progress=Math.min(100,(rank/max)*100);
    const cls=['tree-node',locked?'locked':'',rank>0?'ranked':'',p.tier.capstone?'capstone':''].join(' ');
    return `<button class="${cls}" style="left:${p.x}%;top:${p.y}%;--progress:${progress}" onclick="selectVisualTalent('${classKey}','${name.replace(/'/g,"\\'")}')" title="${name} — ${type}"><span class="rank-ring"></span><span class="node-icon">${treeIconForTalent(name,type)}</span><span class="rank-label">${rank}/${max}</span></button>`;
  }).join('');
  return `<div class="tree-canvas" data-class="${classKey}"><div class="tree-title"><h3>${asteriaClassTalentTrees[classKey].label}</h3><small>${tree.tiers.length} branches • ${positions.length} talents</small></div><svg class="tree-svg" preserveAspectRatio="none">${lines}</svg>${tierLabels}<div class="tree-center-orb">${asteriaClassIcons[classKey]||'✦'}<br><small>${compact?'Class':'Core'}</small></div>${nodes}</div>`;
}
function selectVisualTalent(classKey,name){
  selectedTalentNode={classKey,name}; renderTalentDetail(currentPlayerId());
}
function findTalentByName(classKey,name){
  const tree=asteriaClassTalentTrees[classKey]; if(!tree)return null;
  for(const tier of tree.tiers){ for(const t of tier.talents){ if(t[0]===name) return {tier,talent:t}; } }
  return null;
}
function renderTalentDetail(id){
  const host=document.getElementById('visualTalentDetail'); if(!host)return;
  const classes=getCharacterTalentClasses(chars[id]); const fallbackClass=classes[0];
  if(!selectedTalentNode) selectedTalentNode={classKey:fallbackClass,name:asteriaClassTalentTrees[fallbackClass].tiers[0].talents[0][0]};
  const found=findTalentByName(selectedTalentNode.classKey,selectedTalentNode.name)||findTalentByName(fallbackClass,asteriaClassTalentTrees[fallbackClass].tiers[0].talents[0][0]);
  const [name,type,max,desc]=found.talent; const c=chars[id]; const cur=c.talents?.[name]?.rank||0; const staged=talentDrafts[id]?.[name]||0; const locked=c.level<found.tier.unlock;
  host.innerHTML=`<div><h4>${name}</h4><p><b>${type}</b> • ${found.tier.name} • ${locked?'Unlocks at Level '+found.tier.unlock:'Unlocked'}</p><p>${desc}</p></div><div class="talent-rank-controls"><button ${locked?'disabled':''} onclick="stageTalent('${name.replace(/'/g,"\\'")}',${max},-1);renderTalentDetail(currentPlayerId())">−</button><span>${cur+staged}/${max}</span><button ${locked?'disabled':''} onclick="stageTalent('${name.replace(/'/g,"\\'")}',${max},1);renderTalentDetail(currentPlayerId())">+</button></div>`;
}
const asteria131OldStageTalent=stageTalent;
stageTalent=function(talent,max,delta){ asteria131OldStageTalent(talent,max,delta); setTimeout(()=>renderTalentDetail(currentPlayerId()),0); };
renderTalentTreeUI=function(id=currentPlayerId()){
  const host=document.querySelector('#talents .talent-tree-page'); if(!host) return;
  const c=chars[id]; if(!c) return; ensureTalentData(id); ensureProgressionData();
  c.talentClasses=getCharacterTalentClasses(c);
  if(!c.talentClass)c.talentClass=c.talentClasses[0];
  const classes=c.talentClasses; const cost=stagedTalentCost(id);
  const focusOptions=['multi',...classes]; if(!focusOptions.includes(activeTalentFocus)) activeTalentFocus=classes.length>1?'multi':classes[0];
  const shown=activeTalentFocus==='multi'?classes:[activeTalentFocus];
  host.innerHTML=`<div class="section-head"><div><h3>Visual Class Talent Trees</h3><p class="muted">Nodes show talent ranks and connect across tiers. Multi-class characters can view trees together or inspect one class at a time.</p></div><div class="tp-box">Available TP <b id="tpAvailable">${c.tp||0}</b><small>Staged cost: ${cost}</small></div></div>
    <div class="talent-toolbar"><label>Add / Focus Class <select id="talentClassSelect" onchange="changeTalentClass()">${Object.entries(asteriaClassTalentTrees).map(([k,v])=>`<option value="${k}" ${k===c.talentClass?'selected':''}>${v.label}</option>`).join('')}</select></label><button class="primary" onclick="applyTalentRanks()">Apply Talent Changes</button></div>
    <div class="visual-tree-shell"><div class="talent-view-tabs">${focusOptions.map(k=>`<button class="${activeTalentFocus===k?'active':''}" onclick="setTalentFocus('${k}')">${k==='multi'?'Multi-Class View':asteriaClassTalentTrees[k].label}</button>`).join('')}</div>
    ${classes.length>1?`<div class="multi-class-note">Multi-class layout detected from <b>${c.klass}</b>. Talent points are shared across all class trees.</div>`:''}
    <div class="tree-legend"><span><i class="legend-unlocked"></i>Ranked / active path</span><span><i class="legend-locked"></i>Locked node</span><span><i class="legend-capstone"></i>Capstone / Tier IV</span></div>
    <div class="visual-tree-board ${shown.length>1?'dual':''}">${shown.map(k=>renderClassTreeCanvas(id,k,shown.length>1)).join('')}</div><div id="visualTalentDetail" class="talent-detail-panel"></div></div>`;
  renderTalentDetail(id);
};
changeTalentClass=function(){
  const id=currentPlayerId(); const c=chars[id]; const picked=document.getElementById('talentClassSelect').value;
  c.talentClasses=getCharacterTalentClasses(c); if(!c.talentClasses.includes(picked)) c.talentClasses.push(picked);
  c.talentClass=picked; activeTalentFocus=picked; talentDrafts[id]={}; saveAsteriaState(); renderTalentTreeUI(id);
};
function buildVersionBadge(){const b=document.querySelector('.version-badge');if(b)b.textContent='v1.3.1 • Visual Talent Trees + Multi-Class Layout';}
window.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{buildVersionBadge(); renderTalentTreeUI(currentPlayerId());},50));

/* =========================================================
   v1.3.1.1 Player Dashboard Open Fix
   - Fixes account character cards not reliably opening the player dashboard.
   - Bypasses older view-routing conflicts introduced across v1.2/v1.3 patches.
   ========================================================= */
function forceOpenPlayerDashboard(id){
  if(!chars[id]){ toast('Character not found.'); return; }
  session.character=id;
  selected=id;
  try{ ensureCharacterData(); ensureProgressionData(); ensureTalentData(id); }catch(e){ console.warn('prep failed', e); }
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('show'));
  const playerView=document.getElementById('player');
  if(playerView) playerView.classList.add('show');
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active', b.dataset.view==='player'));
  try{ loadPlayer(id); }catch(e){ console.error('Player dashboard load failed', e); toast('Dashboard load error: '+e.message); }
  try{ saveAsteriaState(); }catch(e){}
  toast('Opened '+chars[id].name+' dashboard.');
}
openAccountCharacter=function(id){ forceOpenPlayerDashboard(id); };
const asteria1311OldRenderPlayerHome=renderPlayerHome;
renderPlayerHome=function(){
  loadAccountState();
  const account=session.account||session.user;
  const rec=accountUsers[account];
  if(!rec){ if($('accountCharacterCards')) $('accountCharacterCards').innerHTML='<p class="muted">No player account loaded.</p>'; return; }
  if($('accountWelcome')) $('accountWelcome').textContent=`${account}'s Characters`;
  const ids=(rec.characters||[]).filter(id=>chars[id]);
  const host=$('accountCharacterCards'); if(!host) return;
  host.innerHTML=ids.length?ids.map(id=>{
    const c=chars[id];
    return `<article class="account-character-card" role="button" tabindex="0" onclick="forceOpenPlayerDashboard('${id}')" onkeydown="if(event.key==='Enter')forceOpenPlayerDashboard('${id}')"><div class="big-initial">${c.initial||characterInitial(c.name)}</div><h3>${c.name}</h3><p class="muted">${c.race||'Unselected Race'} • ${c.klass||'Unselected Class'}</p><div class="resource-stack">${line('HP',c.hp[0],c.hp[1],'hp')}${line('SP',c.sp[0],c.sp[1],'sp')}${line('MP',c.mp[0],c.mp[1],'mp')}${line('XP',c.xp,c.xpMax,'xp')}</div><button class="primary small" type="button" onclick="event.stopPropagation();forceOpenPlayerDashboard('${id}')">Open Dashboard</button></article>`;
  }).join(''):'<p class="muted">No characters yet. Create your first character to begin.</p>';
};
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent='v1.3.1.1 • Player Dashboard Open Fix';}
window.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{buildVersionBadge(); if(session.role==='player') renderPlayerHome();},80));

/* =========================================================
   v1.3.2 Bloodhunter Talent Rank Buildout
   ========================================================= */
const bloodhunterRankDetails={
'Blood Rite':{summary:'Empower weapons through Sangramancy at a health cost. Each rank strengthens damage, stability, and bleed pressure.',ranks:['Rank 1: Cost 10 HP, 5 rounds, +1d6 Blood damage. 10% backlash for 1d4 self Blood damage. Critical hits apply Minor Bleed for 2 rounds.','Rank 2: +1d6+1 Blood damage. Backlash 8%. Critical Bleed lasts 3 rounds.','Rank 3: +1d8 Blood damage. Blood Control synergy reduces Rite drain by 5%.','Rank 4: +1d8+2 Blood damage. Backlash 5%. On kill, regain 1d4 HP or gain 5 BHP.','Rank 5: +1d10 Blood damage. Critical hits apply Moderate Bleed. Once per short rest ignore one Rite backlash.']},
'Blood Control':{summary:'Control the Blood Homanen frenzy and redirect blood power before it consumes the hunter.',ranks:['Rank 1: Base Frenzy Control 25. Frenzy check 1d20 + Wisdom + Proficiency. Controlled frenzy grants +1d4 melee attack rolls, +10% blood/homanen damage, -5% HP drain from Blood Rites.','Rank 2: Base Frenzy Control 35. Gain +1 defensive reaction against one melee hit per round while controlled.','Rank 3: Base Frenzy Control 45. On success, choose one ally ignored by frenzy instincts.','Rank 4: Base Frenzy Control 60. Rite HP drain reduced by another 5%; critical failure frenzy reduced by 1 round.','Rank 5: Base Frenzy Control 75. Once per long rest, convert failed Frenzy Control into partial success with GM complication.']},
'Blood Scent':{summary:'Awaken predatory senses to detect blood, wounds, corruption, and injured creatures.',ranks:['Rank 1: 10 MP + 10 SP. For 5 minutes, smell fresh blood within 10m; blood within 5m glows faint crimson.','Rank 2: Detection 20m. Identify broad creature type from blood scent. Advantage to track a recently detected wounded target.','Rank 3: Choose pathway: Wound Seeker or Corruption Scent.'],pathways:{'Wound Seeker':'Injured creatures leave stronger blood trails; once per scene mark a bleeding target without line of sight if in range.','Corruption Scent':'Identify tainted blood by type; receive warning when hidden corrupted creatures are near.'}},
'Hunter’s Bane':{summary:'A rite-scar that makes the hunter better at pursuing favoured prey, at the cost of mortal warmth.',ranks:['Rank 1: Advantage on Wisdom (Survival) and Perception to track/sense fey, fiends, undead. Gain +10 BHP when facing fey, fiends, undead, or aberrations; social drawback with non-corrupted mortals.','Rank 2: Add aberrations and blood-corrupted creatures. First successful hit against tracked bane target deals +1d4 Blood damage.','Rank 3: Choose pathway: Bane of the Courts, Bane of the Grave, or Bane of the Void.'],pathways:{'Bane of the Courts':'Specialise against fae and oath-bound tricksters.','Bane of the Grave':'Specialise against undead and death-bound entities.','Bane of the Void':'Specialise against aberrations, eldritch corruption, and void-touched beings.'}},
'Veinlock':{summary:'Disrupt enemy movement, timing, or reactions by seizing blood rhythm.',ranks:['Rank 1: Reactive. Spend HP/MP to impose minor movement penalty on bleeding or marked target for 1 round.','Rank 2: Target has reduced reaction timing; GM may impose disadvantage on one reaction.','Rank 3: Affect one additional nearby bleeding target at reduced effect.','Rank 4: Interrupt movement once per short rest if target is marked or bleeding.','Rank 5: Once per long rest, contested save or delay target turn by 1 step.']},
'Mark of the Quarry':{summary:'Bind the hunt to a target through Sangramancy.',ranks:['Rank 1: Mark one visible creature. Gain tracking clarity and +1 damage on first blood-based hit each round.','Rank 2: Mark persists through light cover and short separation; +1 to pursue quarry.','Rank 3: When quarry becomes Bloodied, gain 5 BHP and refresh one minor Bloodhunter effect.','Rank 4: Quarry cannot easily hide its blood trail; magical concealment requires contest.','Rank 5: Once per long rest, force a final pursuit check if quarry would escape.']},
'Blood Reprisal':{summary:'Turn injury into retaliation, counterattacking through pain and blood memory.',ranks:['Rank 1: When struck, 15 MP + 10 HP to counterattack for 50% received damage +1d6 Blood damage. Gain +10 BHP. Killing attacker restores 5 HP.','Rank 2: Counterattack 60% received damage +1d6 Blood damage. Critical adds one Bleed stack.','Rank 3: Counterattack 75% received damage +1d8 Blood damage. Below 25% HP, +1d4 to reprisal attack.','Rank 4: Counterattack 100% received damage +1d8 Blood damage. Once per short rest ignore below-10% HP failure.']},
'Bloody Reprisal':{alias:'Blood Reprisal'},
'Hardened Soul':{summary:'The Audel has tempered the hunter against fear, charm, despair, and mental backlash.',ranks:['Rank 1: Advantage on saves against frightened. Once per day reroll failed Wisdom save.','Rank 2: Also resist charm and despair. Reroll becomes once per long rest.','Rank 3: On successful save against fear/charm/despair, gain 5 BHP or restore 1d4 SP.','Rank 4: Once per long rest convert failed mental save into success with lingering narrative cost.']},
'Clotted Resolve':{summary:'Suppress bleeding, wound escalation, and physical condition spirals.',ranks:['Rank 1: Reduce one Bleed by 1 die step or 1 round.','Rank 2: Advantage to resist worsening wounds or blood loss.','Rank 3: Once per short rest end Minor Bleed or reduce Moderate Bleed to Minor.','Rank 4: First Bleed each combat automatically reduced one severity.']},
'Blood Tithe':{summary:'Recover minor resources when marked prey falls.',ranks:['Rank 1: When marked target dies, regain 1d4 HP or 1d4 SP.','Rank 2: Also gain 5 BHP or reduce one Bloodhunter cooldown by 1 round.','Rank 3: Once per encounter, marked elite/boss death restores 1d8 HP, SP, or MP.']},
'Blood Remembers':{summary:'The hunter’s blood records prey, wounds, and past battles.',ranks:['Rank 1: +1 to recall a creature type you previously wounded.','Rank 2: After being damaged, +1 to next Bloodhunter action against that creature.','Rank 3: Against recurring enemy, advantage on one tracking/insight/survival check per session.','Rank 4: Once per long rest ask GM one memory-fragment question about blood you tasted/spilled.']},
'Scarred Flesh':{summary:'Repeated wounds become armour, lessons, and proof of survival.',ranks:['Rank 1: Minor resistance against repeated damage from same enemy in a scene.','Rank 2: After taking damage, +1 protection against next hit from that source this round.','Rank 3: Once per short rest reduce incoming physical damage by Bloodhunter tier bonus + rank.','Rank 4: Below 25% HP, gain temporary resilience until next turn.']},
'Blood Rage':{summary:'Enter a volatile state of blood-fuelled violence.',ranks:['Rank 1: 10 MP + 20 HP. 5 rounds. +10% melee damage, +10% movement, +15% fear/charm resistance. Lose 2% max HP per round; crit restores 1% HP.','Rank 2: +15% damage, +15% movement, +20% fear/charm resistance.','Rank 3: +20% damage. Critical hits restore 2% HP. Below 15% HP roll Frenzy Control.','Rank 4: +25% damage. Once per long rest remain conscious 1 round at 0 HP, then suffer severe exhaustion/GM consequence.']},
'Crimson Ritual':{summary:'Create a Crimson Circle through blood sacrifice.',ranks:['Rank 1: 15 MP + 10 HP. Create 10 ft Crimson Circle. Weapons/items inside gain +1d4 Blood damage; allies recover 1d4 HP/turn while concentration holds; enemies suffer Hemorrhage for 2 turns.','Rank 2: Radius 15 ft. Choose mode: Empower, Heal, Seal, or Corrupt.','Rank 3: Duration 2 minutes. Concentration costs less SP/MP; allies gain minor condition resistance.','Rank 4: Once per long rest, anchor circle into terrain for a scene with lasting omen/consequence.']},
'Pulse Sever':{summary:'Disrupt circulation, casting, concentration, and biological rhythm.',ranks:['Rank 1: Disrupt bleeding target concentration or reaction timing.','Rank 2: Also impose minor spell/technique control penalty for 1 round.','Rank 3: Affect non-humanoids with blood/equivalent fluid at reduced effect.','Rank 4: Once per long rest force severe concentration break or stagger against marked bleeding target.']},
'Bleeding Future':{summary:'Borrow vitality from your future self with deferred cost.',ranks:['Rank 1: Gain short burst of HP/SP/MP or bonus damage now; after scene suffer fatigue or delayed damage.','Rank 2: Increase borrowed effect and choose debt type: HP, SP, MP, or exhaustion.','Rank 3: Once per long rest survive a fatal mistake; GM assigns lasting scar, debt, or future consequence.']},
'Crimson Survivor':{summary:'Resist death and keep acting while dying through blood instinct.',ranks:['Rank 1: Advantage on one death-related save/stabilisation per long rest.','Rank 2: At 0 HP, take one final defensive or movement action before falling, once per long rest.','Rank 3: Once per campaign arc or GM-approved climax, remain active 1 round while dying.']},
'Avatar of the Crimson Path':{summary:'Capstone. Fully embrace Sangramancy with extreme cost.',ranks:['Rank 1: Once per major narrative moment, enter Avatar state. Bloodhunter talents surge to peak effect briefly, triggering major backlash, transformation risk, or mutation pressure.']},
'Blood Pact':{summary:'Bind your blood to a supernatural force.',ranks:['Rank 1: On kill, activate within 1 round. Offer blood to linked Eldritch Lord: +5 Strength checks/melee damage, +8 Frenzy Control, +5 temp HP stacking to 15. Every third activation Wisdom Save DC 15 or Eldritch Corruption.','Rank 2: Temp HP cap 25 and Strength/melee bonus +7. Eldritch Mark becomes more visible.','Rank 3: Choose pathway: Eldritch Lord Bond or Crimson Covenant.'],pathways:{'Eldritch Lord Bond':'Stronger bonuses, stronger influence, more dangerous corruption checks.','Crimson Covenant':'Weaker raw surge, better control, heavier oath consequences.'}},
'Crimson Debt':{summary:'Accumulated Sangramancy cost becomes scars, curses, and debts.',ranks:['Rank 1: Track one visible/spiritual mark; grants recognition/intimidation among blood-aware beings, but creates social risk.','Rank 2: Convert one backlash per long rest into a Crimson Debt mark instead of immediate damage.','Rank 3: Once per major scene invoke a debt mark for power; GM may call that debt later.']},
'Blood Homanen':{summary:'Legendary Bloodhunter class skill tracking BHP, frenzy control, mutation, and corruption.',ranks:['Emergence: 0–49 BHP. Minor abilities awaken; whispers begin. Control DC 10.','Mutation: 50–99 BHP. Blood reshapes the body; hunger escalates. Control DC 30.','Evolution: 100–199 BHP. Humanity fades; crimson aura appears. Control DC 50.','Ascension: 200+ BHP. Mortal shell risks collapse into a bloodborn entity. Control DC 80.']}
};
function getBloodhunterDetail(name){const d=bloodhunterRankDetails[name];return d?.alias?bloodhunterRankDetails[d.alias]:d;}
if(asteriaClassTalentTrees?.bloodhunter){asteriaClassTalentTrees.bloodhunter.label='Bloodhunter';asteriaClassTalentTrees.bloodhunter.systems=[{name:'Blood Homanen',type:'Legendary Class Skill',desc:'Tracks BHP, frenzy control, mutation, and corruption consequences.'}];asteriaClassTalentTrees.bloodhunter.tiers=[{name:'Tier I — Initiate Talents',unlock:1,talents:[['Blood Rite','Active',5,'Empower weapons through Sangramancy at a health cost.'],['Blood Control','Reactive',5,'Control frenzy and redirect blood power.'],['Blood Scent','Active / Sense',3,'Detect blood, wounds, corruption, and injured creatures.'],['Hunter’s Bane','Passive',3,'Track favoured prey and corrupted beings.'],['Veinlock','Reactive',5,'Disrupt movement, timing, or reactions.'],['Mark of the Quarry','Active / Passive',5,'Bind your hunt to a chosen target.']]},{name:'Tier II — Adept Talents',unlock:15,talents:[['Blood Reprisal','Reactive',4,'Counterattack when damaged, inflicting blood damage and BHP gain.'],['Hardened Soul','Passive',4,'Resist fear, charm, and mental backlash.'],['Clotted Resolve','Passive',4,'Suppress bleeding and condition escalation.'],['Blood Tithe','Passive',3,'Recover minor resources on marked kills.'],['Blood Remembers','Passive',4,'Gain recall and bonuses against past prey.'],['Scarred Flesh','Passive',4,'Build resilience through repeated wounds.']]},{name:'Tier III — Veteran Talents',unlock:30,talents:[['Blood Rage','Active / Toggle',4,'Gain damage and speed while suffering HP strain.'],['Crimson Ritual','Active / Ritual',4,'Create a blood circle that empowers, heals, or corrupts.'],['Pulse Sever','Active',4,'Disrupt circulation, casting, and concentration.'],['Bleeding Future','Active',3,'Borrow power from future vitality with deferred cost.'],['Crimson Survivor','Passive',3,'Resist death and act while dying.']]},{name:'Tier IV — Paragon Talents',unlock:50,capstone:true,talents:[['Avatar of the Crimson Path','Active / Capstone',1,'Embrace Sangramancy with overwhelming power and backlash.'],['Blood Pact','Active / Narrative',3,'Bind blood to a supernatural force.'],['Crimson Debt','Passive / Narrative',3,'Turn accumulated blood cost into scars, curses, and debt.']]}];}
function renderBloodhunterSystemPanel(){const d=getBloodhunterDetail('Blood Homanen');return `<div class="bloodhunter-system-card"><h4>🩸 Blood Homanen — Class System</h4><p>${d.summary}</p><ul>${d.ranks.map(r=>`<li>${r}</li>`).join('')}</ul><p class="muted">BHP is GM tracked. Mutations and pathways are narrative-weighted and GM-approved.</p></div>`;}
const asteria132OldRenderTalentDetail=renderTalentDetail;
renderTalentDetail=function(id){asteria132OldRenderTalentDetail(id);const host=document.getElementById('visualTalentDetail');if(!host||!selectedTalentNode)return;const detail=getBloodhunterDetail(selectedTalentNode.name);if(!detail)return;const c=chars[id]||{};const current=(c.talents?.[selectedTalentNode.name]?.rank||0)+(talentDrafts[id]?.[selectedTalentNode.name]||0);const rankList=(detail.ranks||[]).map((txt,i)=>`<li class="${(i+1)===Math.max(1,current)?'current-rank':''}"><b>${selectedTalentNode.name} — Rank ${i+1}</b><br>${txt}</li>`).join('');const paths=detail.pathways?`<div class="pathway-box"><h5>Pathways</h5>${Object.entries(detail.pathways).map(([k,v])=>`<p><b>${k}</b> — ${v}</p>`).join('')}</div>`:'';host.insertAdjacentHTML('beforeend',`<div class="rank-buildout"><h5>Rank Buildout</h5><p>${detail.summary||''}</p><ol>${rankList}</ol>${paths}</div>`);};
const asteria132OldRenderTalentTreeUI=renderTalentTreeUI;
renderTalentTreeUI=function(id=currentPlayerId()){asteria132OldRenderTalentTreeUI(id);const c=chars[id];const host=document.querySelector('#talents .visual-tree-shell');if(host&&getCharacterTalentClasses(c).includes('bloodhunter'))host.insertAdjacentHTML('afterbegin',renderBloodhunterSystemPanel());};
function buildVersionBadge(){const b=document.querySelector('.version-badge');if(b)b.textContent='v1.3.2 • Bloodhunter Full Talent Ranks';}
window.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{buildVersionBadge();renderTalentTreeUI(currentPlayerId());},90));

/* =========================
   v1.3.3 Website Inventory Rebuild
   - Reset from v1.3.2 stable foundation
   - Coin pouch panel on player dashboard
   - Bag system lives in Inventory menu only
   - Worn/equipped left panel + bag boxes right panel
   ========================= */
const ASTERIA_V133_ARMOR_SLOTS = ['Head','Shoulders','Chest','Torso','Back','Waist','Hands','Feet'];
const ASTERIA_V133_WEAPON_SLOTS = ['Main Weapon','Off Weapon','Secondary Weapon','Quiver','Shield'];
const ASTERIA_V133_WEARABLE_SLOTS = ['Necklace','Ring 1','Ring 2','Trinket','Charm'];
const ASTERIA_V133_QUICK_SLOTS = ['Potion / Poison 1','Potion / Poison 2','Potion / Poison 3','Potion / Poison 4'];
const ASTERIA_V133_COINS = [
  {key:'copper',label:'Copper',term:'Penny',value:1},
  {key:'silver',label:'Silver',term:'Mark',value:100},
  {key:'gold',label:'Gold',term:'Crown',value:10000},
  {key:'platinum_crown',label:'Platinum Crown',term:'Platinum',value:1000000},
  {key:'royal_crown',label:'Royal Crown',term:'Royal',value:100000000},
  {key:'royal_platinum',label:'Royal Platinum',term:'Royal Platinum',value:10000000000}
];
let selectedWebBagId = null;
function asteriaV133ItemDefaults(){
  return {
    'iron-longsword':{id:'iron-longsword',name:'Iron Longsword',type:'Weapon',slot:'Main Weapon',qty:1,weight:1.5,desc:'A reliable one-handed blade. Damage: 1d8 slashing.'},
    'wooden-shield':{id:'wooden-shield',name:'Wooden Shield',type:'Shield',slot:'Shield',qty:1,weight:2,desc:'A simple shield that contributes to Armor Class.'},
    'longbow':{id:'longbow',name:'Longbow',type:'Weapon',slot:'Secondary Weapon',qty:1,weight:1,desc:'A ranged weapon for precise attacks. Damage: 1d8 piercing.'},
    'leather-hood':{id:'leather-hood',name:'Leather Hood',type:'Armor',slot:'Head',qty:1,weight:.5,desc:'Light head protection.'},
    'traveller-cloak':{id:'traveller-cloak',name:'Traveller Cloak',type:'Armor',slot:'Back',qty:1,weight:.8,desc:'A weathered cloak worn over the shoulders.'},
    'iron-breastplate':{id:'iron-breastplate',name:'Iron Breastplate',type:'Armor',slot:'Chest',qty:1,weight:6,desc:'Core torso protection for dangerous travel.'},
    'ring-agility':{id:'ring-agility',name:'Ring of Agility',type:'Wearable',slot:'Ring 1',qty:1,weight:.1,desc:'A ring linked to movement, balance, and reflexes.'},
    'minor-health-potion':{id:'minor-health-potion',name:'Minor Health Potion',type:'Consumable',slot:'Potion / Poison 1',qty:3,weight:.2,effect:{resource:'hp',amount:20},desc:'Restores 20 HP when used.'},
    'stamina-draught':{id:'stamina-draught',name:'Stamina Draught',type:'Consumable',slot:'Potion / Poison 2',qty:2,weight:.2,effect:{resource:'sp',amount:15},desc:'Restores 15 SP when used.'},
    'mana-vial':{id:'mana-vial',name:'Mana Vial',type:'Consumable',slot:'Potion / Poison 3',qty:2,weight:.2,effect:{resource:'mp',amount:15},desc:'Restores 15 MP when used.'},
    'wolf-pelt':{id:'wolf-pelt',name:'Wolf Pelt',type:'Material',slot:null,qty:2,weight:1,desc:'Harvested pelt used for crafting, trade, or survival gear.'},
    'iron-rations':{id:'iron-rations',name:'Iron Rations',type:'Supply',slot:null,qty:5,weight:.3,desc:'Preserved travel food.'}
  };
}
function asteriaV133FindItem(c,itemId){
  const defaults=asteriaV133ItemDefaults();
  const fromInv=(c.inventory||[]).find(x=>x.id===itemId);
  return fromInv || defaults[itemId] || {id:itemId,name:itemId,type:'Item',qty:1,desc:'No item page information has been added yet.'};
}
function ensureWebInventory(id=currentPlayerId()){
  const c=chars[id]; if(!c) return;
  const defaults=asteriaV133ItemDefaults();
  if(!c.inventory || !Array.isArray(c.inventory) || c.inventory.length===0){
    c.inventory=['iron-longsword','wooden-shield','longbow','leather-hood','traveller-cloak','iron-breastplate','ring-agility','minor-health-potion','stamina-draught','mana-vial','wolf-pelt','iron-rations'].map(itemId=>{
      const base={...defaults[itemId]};
      base.equipped=!!base.slot;
      return base;
    });
  } else {
    c.inventory=c.inventory.map(it=>({...(defaults[it.id]||{}),...it}));
  }
  if(!c.coins){ c.coins={copper:0,silver:0,gold:0,platinum_crown:0,royal_crown:0,royal_platinum:0}; }
  if(!c.bags || !Array.isArray(c.bags) || c.bags.length===0){
    c.bags=[
      {id:'bag-1',name:'Adventurer Backpack',type:'Backpack',rows:5,cols:5,slots:[]},
      {id:'bag-2',name:'Money Pouch',type:'Pouch',rows:4,cols:4,slots:[]},
      {id:'bag-3',name:'Satchel',type:'Satchel',rows:4,cols:5,slots:[]}
    ];
    c.bags[0].slots=[{slot:1,items:[{id:'wolf-pelt',qty:2}]},{slot:2,items:[{id:'iron-rations',qty:5}]}];
    c.bags[1].slots=[];
    c.bags[2].slots=[{slot:1,items:[{id:'minor-health-potion',qty:1}]}];
  }
  c.bags.forEach(b=>{ b.slots=b.slots||[]; b.rows=Number(b.rows||4); b.cols=Number(b.cols||4); });
  if(!selectedWebBagId && c.bags[0]) selectedWebBagId=c.bags[0].id;
}
function equippedBySlot(c,slot){
  return (c.inventory||[]).find(it=>it.equipped && it.slot===slot);
}
function slotButtonHtml(slot,item,extra=''){
  return `<button class="inventory-slot-button ${item?'filled':''}" onclick="${item?`openItemPage('${item.id}')`:`toast('Empty slot: ${slot}')`}"><span>${slot}</span><b>${item?item.name:'Empty'}</b>${extra}</button>`;
}
function renderDashboardEquipment(){
  const c=chars[currentPlayerId()]; if(!c) return; ensureWebInventory(currentPlayerId());
  const left=$('dashboardArmorLeft'), right=$('dashboardArmorRight'), weapons=$('dashboardWeapons');
  const armorLeft=['Head','Shoulders','Chest','Hands'];
  const armorRight=['Back','Torso','Waist','Feet'];
  if(left) left.innerHTML=armorLeft.map(slot=>slotButtonHtml(slot,equippedBySlot(c,slot))).join('');
  if(right) right.innerHTML=armorRight.map(slot=>slotButtonHtml(slot,equippedBySlot(c,slot))).join('');
  if(weapons) weapons.innerHTML=ASTERIA_V133_WEAPON_SLOTS.map(slot=>{
    const item=equippedBySlot(c,slot);
    const icon=slot==='Shield'?'🛡':slot==='Quiver'?'➳':slot.includes('Secondary')?'🏹':'🗡';
    return `<div class="weapon-card ${item?'filled':''}" onclick="${item?`openItemPage('${item.id}')`:`toast('Empty weapon slot: ${slot}')`}"><span>${icon}</span><div><small>${slot}</small><b>${item?item.name:'Empty'}</b></div></div>`;
  }).join('');
}
function renderCoinPanel(){
  const c=chars[currentPlayerId()]; if(!c) return; ensureWebInventory(currentPlayerId());
  const box=$('coinPanelRows'); if(!box) return;
  box.innerHTML=ASTERIA_V133_COINS.map(coin=>{
    const count=Number(c.coins?.[coin.key]||0);
    return `<div class="coin-row"><div><b>${coin.label}</b><small>${coin.term}</small></div><div class="coin-controls"><input id="coin_${coin.key}" type="number" min="0" value="1"><button onclick="adjustCoin('${coin.key}',-1)">−</button><button onclick="adjustCoin('${coin.key}',1)">+</button><span>Have: ${count}</span></div></div>`;
  }).join('');
  const total=ASTERIA_V133_COINS.reduce((sum,coin)=>sum+(Number(c.coins?.[coin.key]||0)*coin.value),0);
  if($('coinCopperTotal')) $('coinCopperTotal').textContent='Copper equivalent: '+total.toLocaleString();
}
function adjustCoin(key,sign){
  const c=chars[currentPlayerId()]; if(!c) return; ensureWebInventory(currentPlayerId());
  const amount=Math.max(1,Number($('coin_'+key)?.value||1));
  c.coins[key]=Math.max(0,Number(c.coins[key]||0)+(amount*sign));
  saveAsteriaState?.();
  renderCoinPanel();
  toast(`${sign>0?'+':'−'}${amount} ${key.replaceAll('_',' ')}`);
}
function renderInventorySlots(){
  const c=chars[currentPlayerId()]; if(!c) return; ensureWebInventory(currentPlayerId());
  const armor=$('inventoryArmorSlots'), weapon=$('inventoryWeaponSlots'), wearable=$('inventoryWearableSlots'), quick=$('inventoryQuickSlots');
  if(armor) armor.innerHTML=ASTERIA_V133_ARMOR_SLOTS.map(slot=>slotButtonHtml(slot,equippedBySlot(c,slot))).join('');
  if(weapon) weapon.innerHTML=ASTERIA_V133_WEAPON_SLOTS.map(slot=>slotButtonHtml(slot,equippedBySlot(c,slot))).join('');
  if(wearable) wearable.innerHTML=ASTERIA_V133_WEARABLE_SLOTS.map(slot=>slotButtonHtml(slot,equippedBySlot(c,slot))).join('');
  if(quick) quick.innerHTML=ASTERIA_V133_QUICK_SLOTS.map(slot=>{
    const item=equippedBySlot(c,slot);
    const use=item&&item.type==='Consumable'?`<em onclick="event.stopPropagation();useInventoryItem('${item.id}')">Use</em>`:'';
    return slotButtonHtml(slot,item,use);
  }).join('');
}
function bagUsedSlots(bag){return (bag.slots||[]).filter(s=>s.items&&s.items.length).length;}
function renderBagBoxes(){
  const c=chars[currentPlayerId()]; if(!c) return; ensureWebInventory(currentPlayerId());
  const list=$('bagBoxList'); if(!list) return;
  list.innerHTML=c.bags.map(b=>`<button class="bag-box ${selectedWebBagId===b.id?'active':''}" onclick="selectWebBag('${b.id}')"><b>${b.name}</b><span>${b.type}</span><small>${bagUsedSlots(b)} / ${b.rows*b.cols} slots used</small></button>`).join('');
}
function selectWebBag(id){selectedWebBagId=id; renderInventory();}
function renderBagGrid(){
  const c=chars[currentPlayerId()]; if(!c) return; ensureWebInventory(currentPlayerId());
  const panel=$('bagGridPanel'); if(!panel) return;
  const bag=c.bags.find(b=>b.id===selectedWebBagId)||c.bags[0]; if(!bag){panel.innerHTML='<p class="muted">No bags created.</p>';return;}
  selectedWebBagId=bag.id;
  const total=bag.rows*bag.cols;
  let cells='';
  for(let i=1;i<=total;i++){
    const slot=(bag.slots||[]).find(s=>Number(s.slot)===i);
    const items=slot?.items||[];
    cells+=`<button class="bag-cell ${items.length?'filled':''}" onclick="${items[0]?`openItemPage('${items[0].id}')`:`addItemToBagSlot('${bag.id}',${i})`}"><small>${i}</small>${items.length?items.map(it=>{const item=asteriaV133FindItem(c,it.id);return `<b>${item.name}</b><em>x${it.qty||1}</em>`;}).join(''):'<span>Empty</span>'}</button>`;
  }
  panel.innerHTML=`<div class="bag-grid-head"><div><h3>${bag.name}</h3><p class="muted smallnote">${bag.type} • ${bag.rows} × ${bag.cols} grid</p></div><button onclick="renameWebBag('${bag.id}')">Rename</button></div><div class="bag-grid" style="grid-template-columns:repeat(${bag.cols},minmax(74px,1fr))">${cells}</div>`;
}
function addItemToBagSlot(bagId,slotNo){
  const c=chars[currentPlayerId()]; if(!c) return; ensureWebInventory(currentPlayerId());
  const bag=c.bags.find(b=>b.id===bagId); if(!bag) return;
  const itemId=prompt('Add item ID to this slot (example: minor-health-potion, iron-rations, wolf-pelt):','iron-rations');
  if(!itemId) return;
  const qty=Math.max(1,Number(prompt('Quantity:','1')||1));
  let slot=bag.slots.find(s=>Number(s.slot)===slotNo);
  if(!slot){ slot={slot:slotNo,items:[]}; bag.slots.push(slot); }
  const existing=slot.items.find(x=>x.id===itemId);
  if(existing) existing.qty+=qty; else slot.items.push({id:itemId,qty});
  saveAsteriaState?.(); renderInventory(); toast('Item added to bag slot.');
}
function createWebBag(){
  const c=chars[currentPlayerId()]; if(!c) return; ensureWebInventory(currentPlayerId());
  if(c.bags.length>=3){toast('Maximum 3 bags for now.');return;}
  const name=prompt('Bag name:','New Bag')||'New Bag';
  const type=prompt('Bag type:','Backpack')||'Backpack';
  const rows=Math.max(1,Math.min(10,Number(prompt('Rows:','4')||4)));
  const cols=Math.max(1,Math.min(10,Number(prompt('Columns:','5')||5)));
  const id='bag-'+Date.now();
  c.bags.push({id,name,type,rows,cols,slots:[]});
  selectedWebBagId=id; saveAsteriaState?.(); renderInventory(); toast('Bag created.');
}
function renameWebBag(bagId){
  const c=chars[currentPlayerId()]; if(!c) return;
  const bag=c.bags?.find(b=>b.id===bagId); if(!bag) return;
  const name=prompt('Rename bag:',bag.name); if(!name) return;
  bag.name=name; saveAsteriaState?.(); renderInventory();
}
function openItemPage(itemId){
  const c=chars[currentPlayerId()]||{}; const item=asteriaV133FindItem(c,itemId);
  const modal=$('itemModal'); if(!modal){toast('Opened item page: '+item.name);return;}
  $('itemModalName').textContent=item.name;
  $('itemModalBody').innerHTML=`<div class="item-detail-grid"><div><span class="item-chip">${item.type||'Item'}</span>${item.slot?` <span class="item-chip">${item.slot}</span>`:''}${item.qty?` <span class="item-chip">Qty ${item.qty}</span>`:''}</div><p>${item.desc||'No item information has been added yet.'}</p>${item.effect?`<p><b>Use Effect:</b> +${item.effect.amount} ${item.effect.resource.toUpperCase()}</p><button class="primary" onclick="useInventoryItem('${item.id}');closeItemModal();">Use Item</button>`:''}${item.slot?`<button onclick="toggleEquipItem('${item.id}');closeItemModal();">Toggle Equip</button>`:''}</div>`;
  modal.classList.add('show');
}
function closeItemModal(){ $('itemModal')?.classList.remove('show'); }
function renderInventory(){
  ensureWebInventory(currentPlayerId());
  renderDashboardEquipment();
  renderCoinPanel();
  renderInventorySlots();
  renderBagBoxes();
  renderBagGrid();
}
const asteriaV133OldUseInventoryItem = useInventoryItem;
useInventoryItem=function(itemId){
  ensureWebInventory(currentPlayerId());
  const c=chars[currentPlayerId()];
  const item=(c.inventory||[]).find(x=>x.id===itemId);
  if(!item){ toast('Item not found: '+itemId); return; }
  if(item.type==='Consumable' && item.effect){
    if(Number(item.qty||0)<=0){toast('No '+item.name+' left.');return;}
    const key=item.effect.resource, amount=item.effect.amount;
    c[key][0]=Math.max(0,Math.min(c[key][1],c[key][0]+amount));
    item.qty=Math.max(0,Number(item.qty||0)-1);
    if(typeof syncAfterResourceChange==='function') syncAfterResourceChange(currentPlayerId());
    if(typeof addCombatLog==='function') addCombatLog(`${c.name} used ${item.name}: +${amount} ${key.toUpperCase()}.`);
    saveAsteriaState?.(); renderInventory(); toast(`${item.name}: +${amount} ${key.toUpperCase()}`); return;
  }
  if(typeof asteriaV133OldUseInventoryItem==='function') asteriaV133OldUseInventoryItem(itemId);
  renderInventory();
};
const asteriaV133OldToggleEquipItem = toggleEquipItem;
toggleEquipItem=function(itemId){
  ensureWebInventory(currentPlayerId());
  const c=chars[currentPlayerId()]; const item=(c.inventory||[]).find(x=>x.id===itemId);
  if(!item || !item.slot){toast('This item cannot be equipped yet.');return;}
  if(!item.equipped){ (c.inventory||[]).forEach(x=>{if(x.slot===item.slot)x.equipped=false;}); item.equipped=true; toast(item.name+' equipped.'); }
  else { item.equipped=false; toast(item.name+' unequipped.'); }
  saveAsteriaState?.(); renderInventory();
};
window.AsteriaViewHooks?.afterPlayerLoad('web-inventory-render', id => {ensureWebInventory(id); renderInventory();});
const oldBuildVersionBadge_v133=typeof buildVersionBadge==='function'?buildVersionBadge:function(){};
buildVersionBadge=function(){oldBuildVersionBadge_v133();const b=document.querySelector('.version-badge');if(b)b.textContent='v1.3.3 • Inventory + Bags Rebuild';}
document.addEventListener('DOMContentLoaded',()=>{Object.keys(chars||{}).forEach(id=>ensureWebInventory(id)); renderInventory();});

/* =========================
   v1.3.7 CLEAN Rebuild Patch
   - Built from confirmed-correct v1.3.3 inventory baseline
   - Adds character creation integration and combat final pass without legacy inventory code
   ========================= */
const ASTERIA_CLEAN_VERSION='v1.3.7 CLEAN • Correct v1.3.3 Base + Character Creation + Combat Polish';
function cleanTierBonus(v){v=Number(v)||0; if(v>=80)return 4; if(v>=60)return 3; if(v>=40)return 2; if(v>=20)return 1; return 0;}
if(typeof tierBonus!=='function') var tierBonus=cleanTierBonus;
const ASTERIA_SIZE_DICE_CLEAN={
  tiny:{label:'Tiny',dice:{strength:'2d4',endurance:'2d4',constitution:'2d4',dexterity:'4d6',agility:'4d6',intelligence:'4d6',wisdom:'4d6',charisma:'4d6',luck:'3d6'}},
  small:{label:'Small',dice:{strength:'3d6',endurance:'3d6',constitution:'3d6',dexterity:'4d6',agility:'4d6',intelligence:'4d6',wisdom:'4d6',charisma:'4d6',luck:'3d6'}},
  medium:{label:'Medium',dice:{strength:'4d6',endurance:'4d6',constitution:'4d6',dexterity:'4d6',agility:'4d6',intelligence:'4d6',wisdom:'4d6',charisma:'4d6',luck:'3d6'}},
  large:{label:'Large',dice:{strength:'4d8',endurance:'4d8',constitution:'4d8',dexterity:'3d6',agility:'3d6',intelligence:'4d6',wisdom:'4d6',charisma:'4d6',luck:'3d6'}}
};
const ASTERIA_CLASS_PRESETS_CLEAN={
  bloodhunter:{label:'Bloodhunter',items:['iron-longsword','minor-health-potion'],equip:['iron-longsword','minor-health-potion']},
  ranger:{label:'Ranger',items:['longbow','stamina-draught','iron-rations'],equip:['longbow','stamina-draught']},
  cleric:{label:'Cleric',items:['wooden-shield','mana-vial','minor-health-potion'],equip:['wooden-shield','mana-vial']},
  druid:{label:'Druid',items:['traveller-cloak','minor-health-potion','iron-rations'],equip:['traveller-cloak','minor-health-potion']},
  artificer:{label:'Artificer',items:['iron-rations','mana-vial','stamina-draught'],equip:['mana-vial']},
  paladin:{label:'Paladin',items:['iron-longsword','wooden-shield','iron-breastplate','minor-health-potion'],equip:['iron-longsword','wooden-shield','iron-breastplate','minor-health-potion']}
};
const ASTERIA_RACE_SIZES_CLEAN={human:'medium',uniden:'medium',undien:'medium','polaris ursa':'large',sprite:'small',pixie:'tiny','fae touched':'medium',urgal:'large',beastkin:'medium'};
function cleanRollDie(sides){return Math.floor(Math.random()*sides)+1;}
function cleanRollFormula(formula){const m=String(formula||'1d6').match(/(\d+)d(\d+)/i); if(!m)return 0; let t=0; for(let i=0;i<Number(m[1]);i++)t+=cleanRollDie(Number(m[2])); return t;}
function cleanCreatorRolls(){try{return JSON.parse(sessionStorage.getItem('asteria-clean-creator-rolls')||'{}')}catch(e){return {}}}
function saveCleanCreatorRolls(o){sessionStorage.setItem('asteria-clean-creator-rolls',JSON.stringify(o||{}));}
function cleanRaceSize(race){return ASTERIA_RACE_SIZES_CLEAN[String(race||'').trim().toLowerCase()]||'medium';}
function cleanClassKey(v){const raw=String(v||'').toLowerCase();return Object.keys(ASTERIA_CLASS_PRESETS_CLEAN).find(k=>raw.includes(k))||'ranger';}
function renderCharacterCreatorClean(){
  const host=$('characterCreator'); if(!host)return;
  const n=$('newCharName')?.value||'', r=$('newCharRace')?.value||'', a=$('newCharAge')?.value||'';
  host.innerHTML=`<h3>Create Character</h3><p class="muted smallnote">Creates a Level 0 character using Asteria characteristic rolls. HP/SP/MP = 10 + CON/END/WIS.</p><div class="creator-grid enhanced"><label>Character Name<input id="newCharName" placeholder="New character name" value="${escapeAttr(n)}"></label><label>Race<input id="newCharRace" placeholder="Race" value="${escapeAttr(r)}" oninput="syncCleanCreatorSize()"></label><label>Size<select id="newCharSize">${Object.entries(ASTERIA_SIZE_DICE_CLEAN).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></label><label>Class<select id="newCharClass">${Object.entries(ASTERIA_CLASS_PRESETS_CLEAN).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('')}</select></label><label>Age<input id="newCharAge" placeholder="Age" value="${escapeAttr(a)}"></label></div><div class="creator-actions"><button onclick="rollCleanCreatorCharacteristics()">Roll Characteristics</button><button onclick="resetCleanCreatorCharacteristics()">Reset Rolls</button></div><section class="creator-stat-panel"><div class="section-head mini"><h4>Characteristics</h4><span class="pill">Size Dice</span></div><div id="creatorStatsGrid" class="creator-stats-grid"></div></section><section class="creator-preview-panel"><h4>Resource Preview</h4><p id="creatorResourcePreview" class="muted"></p><h4>Starting Kit</h4><ul id="creatorInventoryPreview"></ul></section><button class="primary" onclick="createCharacterForAccountClean()">Create Character</button>`;
  $('newCharSize').value=cleanRaceSize(r); $('newCharClass').value=cleanClassKey($('newCharClass')?.value||'ranger');
  $('newCharSize').addEventListener('change',()=>{saveCleanCreatorRolls({});renderCleanCreatorStats();});
  $('newCharClass').addEventListener('change',renderCleanCreatorInventory);
  renderCleanCreatorStats(); renderCleanCreatorInventory();
}
function syncCleanCreatorSize(){if($('newCharSize')){$('newCharSize').value=cleanRaceSize($('newCharRace')?.value||'');saveCleanCreatorRolls({});renderCleanCreatorStats();}}
function renderCleanCreatorStats(){const host=$('creatorStatsGrid'); if(!host)return; const size=$('newCharSize')?.value||'medium', dice=ASTERIA_SIZE_DICE_CLEAN[size].dice, rolls=cleanCreatorRolls(); host.innerHTML=Object.keys(statLabels).map(k=>`<label class="creator-stat"><span>${statLabels[k]}</span><small>${dice[k]}</small><input type="number" min="0" value="${rolls[k]??0}" onchange="manualCleanCreatorStat('${k}',this.value)"></label>`).join(''); renderCleanCreatorResourcePreview();}
function manualCleanCreatorStat(k,v){const r=cleanCreatorRolls(); r[k]=Math.max(0,Number(v)||0); saveCleanCreatorRolls(r); renderCleanCreatorResourcePreview();}
function rollCleanCreatorCharacteristics(){const size=$('newCharSize')?.value||'medium', dice=ASTERIA_SIZE_DICE_CLEAN[size].dice, out={}; Object.keys(statLabels).forEach(k=>out[k]=cleanRollFormula(dice[k])); saveCleanCreatorRolls(out); renderCleanCreatorStats(); toast('Characteristics rolled.');}
function resetCleanCreatorCharacteristics(){saveCleanCreatorRolls({}); renderCleanCreatorStats();}
function renderCleanCreatorResourcePreview(){const r=cleanCreatorRolls(); const hp=RESOURCE_BASE+(r.constitution||0), sp=RESOURCE_BASE+(r.endurance||0), mp=RESOURCE_BASE+(r.wisdom||0); if($('creatorResourcePreview'))$('creatorResourcePreview').innerHTML=`HP <b>${hp}</b> = 10 + CON ${r.constitution||0}<br>SP <b>${sp}</b> = 10 + END ${r.endurance||0}<br>MP <b>${mp}</b> = 10 + WIS ${r.wisdom||0}`;}
function renderCleanCreatorInventory(){const key=$('newCharClass')?.value||'ranger', p=ASTERIA_CLASS_PRESETS_CLEAN[key]||ASTERIA_CLASS_PRESETS_CLEAN.ranger, defs=asteriaV133ItemDefaults?.()||{}; if($('creatorInventoryPreview'))$('creatorInventoryPreview').innerHTML=(p.items||[]).map(id=>`<li>${defs[id]?.name||id}</li>`).join('');}
function createCharacterForAccountClean(){
  const account=session.account||session.user; if(!accountUsers[account])return toast('Log in to a player account first.');
  let rolls=cleanCreatorRolls(); if(!Object.keys(rolls).length){rollCleanCreatorCharacteristics(); rolls=cleanCreatorRolls();}
  const name=($('newCharName')?.value||'New Character').trim(), id=normaliseId(name), race=($('newCharRace')?.value||'Unselected').trim(), classKey=$('newCharClass')?.value||'ranger', p=ASTERIA_CLASS_PRESETS_CLEAN[classKey]||ASTERIA_CLASS_PRESETS_CLEAN.ranger;
  const hp=RESOURCE_BASE+(rolls.constitution||0), sp=RESOURCE_BASE+(rolls.endurance||0), mp=RESOURCE_BASE+(rolls.wisdom||0), defs=asteriaV133ItemDefaults();
  const inv=(p.items||[]).map(itemId=>({...(defs[itemId]||{id:itemId,name:itemId,type:'Item',qty:1}),equipped:(p.equip||[]).includes(itemId)}));
  chars[id]={initial:characterInitial(name),name,race,klass:p.label,age:($('newCharAge')?.value||''),size:$('newCharSize')?.value||cleanRaceSize(race),level:0,hp:[hp,hp],sp:[sp,sp],mp:[mp,mp],xp:0,xpMax:5000,campaign:'Unassigned',session:'No active session',conditions:[],cp:0,tp:0,resourceMods:{hp:0,sp:0,mp:0},characteristics:Object.assign({strength:0,dexterity:0,agility:0,constitution:0,endurance:0,intelligence:0,wisdom:0,charisma:0,luck:0},rolls),inventory:inv,bags:[{id:'bag-1',name:'Adventurer Backpack',type:'Backpack',rows:5,cols:5,slots:[]},{id:'bag-2',name:'Money Pouch',type:'Pouch',rows:4,cols:4,slots:[]},{id:'bag-3',name:'Satchel',type:'Satchel',rows:4,cols:5,slots:[]}],coins:{copper:0,silver:0,gold:0,platinum_crown:0,royal_crown:0,royal_platinum:0},classKeys:[classKey],talentClass:classKey,talentClasses:[classKey],talents:{}};
  accountUsers[account].characters=accountUsers[account].characters||[]; if(!accountUsers[account].characters.includes(id))accountUsers[account].characters.push(id);
  session.character=id; selected=id; saveAccountState(); saveAsteriaState(); saveCleanCreatorRolls({}); renderPlayerHome(); toast('Character created: '+name); openAccountCharacter(id);
}
toggleCharacterCreator=function(){const el=$('characterCreator'); if(!el)return; if(!el.dataset.cleanCreator){renderCharacterCreatorClean(); el.dataset.cleanCreator='true';} el.classList.toggle('show'); if(el.classList.contains('show'))renderCharacterCreatorClean();};

let asteriaCleanSelectedTargetIndex=0;
function cleanCurrentTarget(){if(!enemies.length)return null; if(asteriaCleanSelectedTargetIndex<0||asteriaCleanSelectedTargetIndex>=enemies.length)asteriaCleanSelectedTargetIndex=0; return enemies[asteriaCleanSelectedTargetIndex];}
function setCombatTarget(i){asteriaCleanSelectedTargetIndex=Number(i)||0; selectedEnemyIndex=asteriaCleanSelectedTargetIndex; renderEnemies(); renderTargetSelector(); const t=cleanCurrentTarget(); if(t)feedback?.('Target: '+t.name);}
function renderTargetSelector(){let host=document.getElementById('combatTargetBox'); const panel=document.querySelector('.quick-actions-panel'); if(!panel)return; if(!host){host=document.createElement('div'); host.id='combatTargetBox'; host.className='combat-target-box'; const actions=panel.querySelector('.action-buttons'); panel.insertBefore(host,actions?.nextSibling||null);} if(!enemies.length){host.innerHTML='<label>Target</label><div class="target-empty">No enemies loaded.</div>'; return;} const t=cleanCurrentTarget(); host.innerHTML=`<label>Target</label><select id="combatTargetSelect" onchange="setCombatTarget(this.value)">${enemies.map((e,i)=>`<option value="${i}" ${i===asteriaCleanSelectedTargetIndex?'selected':''}>${e.name} • HP ${e.hp}/${e.max} • AC ${e.ac||10}</option>`).join('')}</select><div class="target-preview"><b>${t.name}</b><span>HP ${t.hp}/${t.max}</span><span>AC ${t.ac||10}</span>${conditionChips?.(t.conditions||[])||''}</div>`;}
function playerAttackBonusClean(){const c=chars[currentPlayerId()]; if(!c)return 0; const best=Math.max(tierBonus(c.characteristics?.strength||0),tierBonus(c.characteristics?.dexterity||0)); return best+(c.talents?.['Precision Strike']?.rank||0)+(c.talents?.['Blood Rite']?.rank||0);}
function playerDamageFormulaClean(){const c=chars[currentPlayerId()]; return `1d8+${Math.max(0,tierBonus(c?.characteristics?.strength||0)+(c?.talents?.['Blood Rite']?.rank||0))}`;}
async function actionAttackClean(){const actor=chars[currentPlayerId()]; if(!actor)return toast('Open a character first.'); const target=cleanCurrentTarget(); if(!target)return toast('No target selected.'); const bonus=playerAttackBonusClean(); const attack=await rollDice('Attack',`1d20+${bonus}`); const ac=Number(target.ac||10); if(attack>=ac){const dmg=await rollDice('Damage',playerDamageFormulaClean()); const before=target.hp; target.hp=Math.max(0,target.hp-dmg); feedback?.(`HIT: -${dmg} HP`,'bad'); addCombatLog?.(`${actor.name} hits ${target.name} (${attack} vs AC ${ac}) for ${dmg} damage. ${target.name} HP ${before} → ${target.hp}`,'important'); if(target.hp<=0){target.status='Defeated'; feedback?.(`${target.name} defeated!`,'level');}} else {feedback?.('MISS'); addCombatLog?.(`${actor.name} misses ${target.name} (${attack} vs AC ${ac}).`);} renderEnemies(); renderTargetSelector(); saveAsteriaState?.();}
async function actionSpellClean(){const actor=chars[currentPlayerId()]; if(!actor)return toast('Open a character first.'); const target=cleanCurrentTarget(); if(!target)return toast('No target selected.'); const cost=10; if(actor.mp[0]<cost)return toast('Not enough MP.'); const beforeMP=actor.mp[0]; actor.mp[0]=Math.max(0,actor.mp[0]-cost); const attack=await rollDice('Spell Attack',`1d20+${tierBonus(actor.characteristics?.wisdom||0)+tierBonus(actor.characteristics?.intelligence||0)}`); const ac=Number(target.ac||10); if(attack>=ac){const dmg=await rollDice('Spell Damage','1d10+2'); const before=target.hp; target.hp=Math.max(0,target.hp-dmg); feedback?.(`SPELL HIT: -${dmg} HP`,'bad'); addCombatLog?.(`${actor.name} casts a spell on ${target.name}: hit (${attack} vs AC ${ac}), ${dmg} damage. MP ${beforeMP} → ${actor.mp[0]}. ${target.name} HP ${before} → ${target.hp}`,'important');} else {feedback?.('SPELL MISS'); addCombatLog?.(`${actor.name} casts a spell but misses ${target.name}. MP ${beforeMP} → ${actor.mp[0]}.`);} syncAfterResourceChange?.(currentPlayerId()); renderEnemies(); renderTargetSelector(); saveAsteriaState?.();}
performAttack=function(){return actionAttackClean();}; castSpell=function(){return actionSpellClean();};
const oldCleanRenderEnemies=renderEnemies;
renderEnemies=function(){oldCleanRenderEnemies?.(); const rows=$('enemyRows'); if(rows){[...rows.querySelectorAll('.enemy-row')].forEach((row,i)=>{row.classList.toggle('selected-target',i===asteriaCleanSelectedTargetIndex);});} renderTargetSelector();};
const oldCleanAddEnemy=addEnemy;
addEnemy=function(){oldCleanAddEnemy?.(); asteriaCleanSelectedTargetIndex=Math.max(0,enemies.length-1); renderTargetSelector();};
const oldCleanAddEnemyFromCreature=typeof addEnemyFromCreature==='function'?addEnemyFromCreature:null;
addEnemyFromCreature=function(id=$('creatureSelect')?.value){ if(oldCleanAddEnemyFromCreature){oldCleanAddEnemyFromCreature(id);} else {const c=creatures[id]; if(c)enemies.push({id,name:c.name,hp:c.hp,max:c.hp,sp:c.sp,mp:c.mp,ac:c.ac||10,status:'None',conditions:[],attacks:c.attacks||[]});} asteriaCleanSelectedTargetIndex=Math.max(0,enemies.length-1); renderEnemies(); renderTargetSelector(); saveAsteriaState?.(); };
window.AsteriaViewHooks?.afterView('clean-inventory-targets', null, id => {if(id!=='player'){renderTargetSelector();renderInventory?.();}});
window.AsteriaViewHooks?.afterPlayerLoad('clean-inventory-player-refresh', id => {ensureWebInventory?.(id); renderInventory?.(); renderTargetSelector();});
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent=ASTERIA_CLEAN_VERSION;};
document.addEventListener('DOMContentLoaded',()=>{buildVersionBadge();renderTargetSelector();Object.keys(chars||{}).forEach(id=>ensureWebInventory?.(id));});


/* =========================
   v1.3.9 Account System Label
   ========================= */
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent='v1.3.9.2 • Account UX + Password Reset';}
document.addEventListener('DOMContentLoaded',()=>{try{buildVersionBadge()}catch(e){}});

/* =========================
   v1.3.9.3 Clean Account Login + Account Home
   ========================= */
const ASTERIA_ACCOUNT_LOGIN_VERSION='v1.3.9.4 • Account Creation + Username Login';
function isLoggedAccount(){ return ['account','player','gm'].includes(session?.role); }
function renderAccountHome(){
  const el=document.getElementById('accountHomeSummary');
  if(!el) return;
  if(!isLoggedAccount()){
    el.textContent='Log in to unlock account actions.';
    return;
  }
  const account=session.account||session.uid||session.user;
  const rec=accountUsers?.[account]||{};
  const count=(rec.characters||[]).length;
  const campCount=(campaigns||[]).filter(c=>c.ownerUid===session.uid||c.ownerAccount===account||c.createdBy===session.user).length;
  el.innerHTML=`<b>Logged in:</b> ${session.email||session.user||'Asteria Account'}<br><b>Characters:</b> ${count}<br><b>Your Campaigns:</b> ${campCount}`;
}
function accountCreateCharacter(){
  if(!isLoggedAccount()){ toast('Please log in or create an account first.'); document.getElementById('loginPanel')?.classList.add('open'); return; }
  window.AsteriaWorkspace?.openDashboard?.('createCharacter');
}
function accountCreateCampaign(){
  if(!isLoggedAccount()){ toast('Please log in or create an account first.'); document.getElementById('loginPanel')?.classList.add('open'); return; }
  window.AsteriaWorkspace?.openDashboard?.('createCampaign');
}
// Override role locks: a real account can create characters and campaigns.
updateRoleLocks=function(){
  const role=session?.role||'guest';
  document.querySelectorAll('.player-only,.gm-only,.auth-only').forEach(x=>x.classList.add('locked'));
  if(['player','account','gm'].includes(role)) document.querySelectorAll('.player-only,.auth-only').forEach(x=>x.classList.remove('locked'));
  if(session?.role==='gm') document.querySelectorAll('.gm-only').forEach(x=>x.classList.remove('locked'));
  renderAccountHome();
};
// Account-aware routing is handled by the main setView function.
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent=ASTERIA_ACCOUNT_LOGIN_VERSION;};
document.addEventListener('DOMContentLoaded',()=>{try{buildVersionBadge(); renderAccountHome(); updateRoleLocks();}catch(e){console.warn(e)}});

/* =========================
   v1.7.0 Recovery + Gameplay Consolidation Patch
   - Built from uploaded v1.3.9.4 stable base
   - Adds session export, rest/recovery controls, sync status, calendar notes, and system audit
   ========================= */
const ASTERIA_V170_VERSION='v1.7.0 • Recovery Build + Interface/Sync Consolidation';
const ASTERIA_V170_CAL_KEY='asteria-v170-calendar-notes';
function v170SafeJson(key,fallback){try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}catch(e){return fallback;}}
function v170SaveJson(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch(e){console.warn('v1.7 save failed',e);}}
function v170Stamp(){return new Date().toLocaleString([], {year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
function v170ActiveCharacter(){return chars?.[currentPlayerId?.()||selected]||chars?.[selected]||Object.values(chars||{})[0];}
function v170InjectHomePanel(){
  const hero=document.querySelector('.home-hero'); if(!hero||document.getElementById('v170RecoveryPanel'))return;
  const panel=document.createElement('div'); panel.id='v170RecoveryPanel'; panel.className='v170-panel';
  panel.innerHTML=`<div class="section-head mini"><div><h3>v1.7.0 Stable Recovery</h3><p class="muted smallnote">Built from v1.3.9.4 and consolidated into a new checkpoint.</p></div><button onclick="setView('devLog')">Open Log</button></div><div class="v170-status-grid"><span>Core Content <b>Locked</b></span><span>Dashboard <b>Active</b></span><span>GM Sync <b>Local</b></span><span>Dice + Combat <b>Active</b></span></div>`;
  hero.appendChild(panel);
}
function v170RenderAudit(){
  const host=document.getElementById('v17SystemAudit'); if(!host)return;
  const checks=[
    ['Characters', Object.keys(chars||{}).length+' loaded'],['Campaigns',(campaigns||[]).length+' loaded'],['Creatures',Object.keys(creatures||{}).length+' loaded'],['Active Enemies',(enemies||[]).length+' in encounter'],['Initiative',(initiative||[]).length+' entries'],['Roll History',(asteriaRollHistory||[]).length+' rolls'],['Combat Log',(asteriaCombatLog||[]).length+' rows'],['Save State',localStorage.getItem('asteria-state-v1')?'Found':'New browser state']
  ];
  host.innerHTML=`<h3>System Audit</h3><div class="v170-audit-grid">${checks.map(([a,b])=>`<div><small>${a}</small><b>${b}</b></div>`).join('')}</div><div class="v170-actions"><button onclick="v170ExportSessionLog()">Export Session Log</button><button onclick="v170SaveCheckpoint()">Save Checkpoint</button><button onclick="v170ClearEncounterSoft()">Clear Encounter</button></div>`;
}
function v170SaveCheckpoint(){saveAsteriaState?.();v170SaveJson('asteria-v170-last-checkpoint',{savedAt:Date.now(),label:ASTERIA_V170_VERSION});toast('v1.7.0 checkpoint saved.');v170RenderSyncPanel();v170RenderAudit();}
function v170ExportSessionLog(){
  const c=v170ActiveCharacter();
  const camp=campaigns?.[activeCampaign]?.name||c?.campaign||'Asteria Campaign';
  const lines=[];
  lines.push('# Asteria Session Log Export');lines.push('');lines.push(`- Build: ${ASTERIA_V170_VERSION}`);lines.push(`- Exported: ${v170Stamp()}`);lines.push(`- Campaign: ${camp}`);lines.push(`- Active Character: ${c?.name||'None'}`);lines.push('');
  lines.push('## Combat Log');(asteriaCombatLog||[]).slice().reverse().forEach(r=>lines.push(`- ${r.time||''} ${r.message||r}`)); if(!(asteriaCombatLog||[]).length)lines.push('- No combat entries yet.');
  lines.push('');lines.push('## Roll History');(asteriaRollHistory||[]).slice().reverse().forEach(r=>lines.push(`- ${r.time||''} ${r.roller||''} — ${r.label||'Roll'}: ${r.detail||r.total}`)); if(!(asteriaRollHistory||[]).length)lines.push('- No roll entries yet.');
  const text=lines.join('\n');
  try{navigator.clipboard?.writeText(text);toast('Session log copied to clipboard.');}catch(e){console.log(text);toast('Session log printed to console.');}
  addCombatLog?.('Session log exported through v1.7.0 tools.','important');
}
function v170ClearEncounterSoft(){enemies.length=0;initiative.length=0;turnIndex=0;renderEnemies?.();renderGM?.();renderTargetSelector?.();saveAsteriaState?.();toast('Encounter cleared.');}
function v170Rest(type='short'){
  const id=currentPlayerId?.()||selected, c=chars?.[id]; if(!c)return toast('No character selected.');
  const before=`HP ${c.hp?.[0]}/${c.hp?.[1]} • SP ${c.sp?.[0]}/${c.sp?.[1]} • MP ${c.mp?.[0]}/${c.mp?.[1]}`;
  if(type==='short'){c.sp[0]=Math.min(c.sp[1],c.sp[0]+Math.ceil(c.sp[1]*0.35));}
  if(type==='long'){c.hp[0]=Math.min(c.hp[1],c.hp[0]+Math.ceil(c.hp[1]*0.5));c.sp[0]=c.sp[1];c.mp[0]=Math.min(c.mp[1],c.mp[0]+Math.ceil(c.mp[1]*0.5));}
  if(type==='full'){c.hp[0]=c.hp[1];c.sp[0]=c.sp[1];c.mp[0]=c.mp[1];c.conditions=[];}
  syncAfterResourceChange?.(id);saveAsteriaState?.();addCombatLog?.(`${c.name} took a ${type} rest. Before: ${before}. After: HP ${c.hp[0]}/${c.hp[1]} • SP ${c.sp[0]}/${c.sp[1]} • MP ${c.mp[0]}/${c.mp[1]}.`,'important');toast(`${type.charAt(0).toUpperCase()+type.slice(1)} rest applied.`);
}
function v170InjectRestPanel(){
  const qa=document.querySelector('.quick-actions-panel'); if(!qa||document.getElementById('v170RestPanel'))return;
  const box=document.createElement('div'); box.id='v170RestPanel'; box.className='v170-rest-panel';
  box.innerHTML=`<h4>Rest + Recovery</h4><div><button onclick="v170Rest('short')">Short Rest</button><button onclick="v170Rest('long')">Long Rest</button><button onclick="v170Rest('full')">Full Rest</button></div><p class="muted smallnote">Short restores SP. Long restores HP/SP/MP. Full restores all and clears conditions.</p>`;
  qa.appendChild(box);
}
function v170RenderSyncPanel(){
  const gmHero=document.querySelector('.gm-hero'); if(!gmHero)return;
  let box=document.getElementById('v170SyncPanel'); if(!box){box=document.createElement('div');box.id='v170SyncPanel';box.className='v170-sync-panel';gmHero.appendChild(box);}
  const cp=v170SafeJson('asteria-v170-last-checkpoint',null);
  box.innerHTML=`<b>Sync Status:</b> Local browser sync active<br><small>Last checkpoint: ${cp?.savedAt?new Date(cp.savedAt).toLocaleString():'Not saved yet'}</small><div><button onclick="v170SaveCheckpoint()">Save Sync Checkpoint</button><button onclick="v170ExportSessionLog()">Export Session</button></div>`;
}
function v170RenderCalendar(){
  const host=document.getElementById('v170CalendarPanel'); if(!host)return;
  const notes=v170SafeJson(ASTERIA_V170_CAL_KEY,[]);
  host.innerHTML=`<div class="section-head mini"><h3>Campaign Calendar Notes</h3><button onclick="v170AddCalendarNote()">+ Add Note</button></div><div class="v170-calendar-list">${notes.map((n,i)=>`<div><b>${n.date}</b><span>${n.text}</span><button onclick="v170RemoveCalendarNote(${i})">×</button></div>`).join('')||'<p class="muted smallnote">No calendar notes yet.</p>'}</div>`;
}
function v170AddCalendarNote(){const text=prompt('Calendar note / upcoming session:'); if(!text)return; const notes=v170SafeJson(ASTERIA_V170_CAL_KEY,[]); notes.unshift({date:v170Stamp(),text}); v170SaveJson(ASTERIA_V170_CAL_KEY,notes.slice(0,30)); v170RenderCalendar();}
function v170RemoveCalendarNote(i){const notes=v170SafeJson(ASTERIA_V170_CAL_KEY,[]); notes.splice(i,1); v170SaveJson(ASTERIA_V170_CAL_KEY,notes); v170RenderCalendar();}
function v170InjectCalendarPanel(){const gmPanels=document.querySelector('.gm-panels'); if(!gmPanels||document.getElementById('v170CalendarPanel'))return; const panel=document.createElement('section'); panel.id='v170CalendarPanel'; panel.className='card v170-calendar-panel'; gmPanels.appendChild(panel); v170RenderCalendar();}
window.AsteriaViewHooks?.afterView('recovery-consolidation-panels', null, () => {v170InjectHomePanel();v170RenderAudit();v170InjectRestPanel();v170RenderSyncPanel();v170InjectCalendarPanel();});
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent=ASTERIA_V170_VERSION;};
document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{buildVersionBadge();v170InjectHomePanel();v170RenderAudit();v170InjectRestPanel();v170RenderSyncPanel();v170InjectCalendarPanel();},120));


/* =========================
   v1.7.1.2 Integrated Dashboard / GM Panel Fix
   - Updates existing systems instead of adding duplicate standalone pages
   ========================= */
const ASTERIA_V1712_VERSION='v1.7.1.2 • Integrated Character Sheet + GM Panel Fix';
let asteriaSessionState='Ready';
let asteriaGMViewMode='gm';
function v1712SetText(id,text){const el=document.getElementById(id); if(el)el.textContent=text;}
function v1712RenderGMRollLog(){
  const host=document.getElementById('gmRollHistory'); if(!host)return;
  host.innerHTML=(asteriaRollHistory||[]).length?(asteriaRollHistory||[]).slice(0,12).map(r=>`<div class="roll-entry ${r.cls||''}"><div><b>${r.label}</b><small>${r.mode||'Roll'} • ${r.roller||'Unknown'} • ${r.time||''}</small></div><strong>${r.total}</strong><span>${r.detail||''}</span></div>`).join(''):'<p class="muted smallnote">No dice rolls logged yet.</p>';
}
function pauseSession(){
  asteriaSessionState='Paused'; v1712SetText('gmSessionState','Paused');
  addCombatLog?.('Session paused by GM.','important'); saveAsteriaState?.(); toast('Session paused.');
}
const v1712OldStartSession=typeof startSession==='function'?startSession:function(){};
startSession=function(){
  asteriaSessionState='Active'; v1712SetText('gmSessionState','Active');
  addCombatLog?.('Session started by GM.','important'); saveAsteriaState?.(); toast('Session started. Logs are now being collected.');
};
const v1712OldEndSession=typeof endSession==='function'?endSession:function(){};
endSession=function(){
  asteriaSessionState='Ended'; v1712SetText('gmSessionState','Ended');
  v1712BuildSessionLog();
  addCombatLog?.('Session ended by GM. Session log built.','important'); saveAsteriaState?.(); toast('Session ended. Session log built.');
};
function setGMViewMode(mode='gm'){
  asteriaGMViewMode=mode;
  document.body.dataset.gmViewMode=mode;
  const note=mode==='player'?'Player View Preview active. GM-only notes are visually hidden for privacy checking.':'GM View active. Hidden notes stay GM-only.';
  v1712SetText('gmViewModeNote',note); toast(note);
}
function v1712BuildSessionLog(){
  const camp=campaigns?.[activeCampaign]?.name||'Asteria Campaign';
  const notes=document.getElementById('gmQuestUpdates')?.value||'';
  const encounter=document.getElementById('gmEncounterUpdates')?.value||'';
  const lines=[];
  lines.push(`# ${camp} — Session Log`);
  lines.push(`Build: ${ASTERIA_V1712_VERSION}`);
  lines.push(`State: ${asteriaSessionState}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push('');
  lines.push('## XP / Rewards');
  lines.push(document.getElementById('campaignXPSplitPreview')?.textContent||'No XP split recorded.');
  lines.push('');
  lines.push('## Dice Log');
  ((asteriaRollHistory||[]).slice().reverse()).forEach(r=>lines.push(`- ${r.time||''} ${r.roller||''}: ${r.label||'Roll'} — ${r.detail||r.total}`));
  if(!(asteriaRollHistory||[]).length) lines.push('- No dice entries.');
  lines.push('');
  lines.push('## Combat / Resource Log');
  ((asteriaCombatLog||[]).slice().reverse()).forEach(r=>lines.push(`- ${r.time||''} ${r.message||r}`));
  if(!(asteriaCombatLog||[]).length) lines.push('- No combat entries.');
  lines.push('');
  lines.push('## Quest Updates');
  lines.push(notes||'No quest updates entered.');
  lines.push('');
  lines.push('## Encounter Updates');
  lines.push(encounter||'No encounter updates entered.');
  const out=document.getElementById('gmSessionLogOutput'); if(out)out.value=lines.join('\n');
  return lines.join('\n');
}
const v1712OldAddRollHistory=typeof addRollHistory==='function'?addRollHistory:null;
if(v1712OldAddRollHistory){
  addRollHistory=function(entry){ v1712OldAddRollHistory(entry); v1712RenderGMRollLog(); };
}
window.AsteriaViewHooks?.afterGMRender('gm-session-state', () => {v1712SetText('gmSessionState',asteriaSessionState); setGMViewMode(asteriaGMViewMode); v1712RenderGMRollLog();});
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent=ASTERIA_V1712_VERSION;};
document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{buildVersionBadge();v1712RenderGMRollLog();},160));


/* =========================
   v1.7.1.3 Session Log System v1 Integration
   - Integrated into existing GM Dashboard (no duplicate pages)
   - Active-only automatic session event collection
   ========================= */
const ASTERIA_V1713_VERSION='v1.7.1.3 • Integrated Session Log System v1';
let asteriaSessionLogState=localStorage.getItem('asteria-session-state') || 'Not Started';
let asteriaSessionEvents=[];
let asteriaArchivedLogs=[];
try{asteriaSessionEvents=JSON.parse(localStorage.getItem('asteria-session-events')||'[]')}catch(e){asteriaSessionEvents=[]}
try{asteriaArchivedLogs=JSON.parse(localStorage.getItem('asteria-archived-logs')||'[]')}catch(e){asteriaArchivedLogs=[]}
function slNow(){return new Date().toLocaleString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',year:'numeric',month:'short',day:'2-digit'});}
function slSave(){localStorage.setItem('asteria-session-state',asteriaSessionLogState);localStorage.setItem('asteria-session-events',JSON.stringify(asteriaSessionEvents.slice(-250)));localStorage.setItem('asteria-archived-logs',JSON.stringify(asteriaArchivedLogs.slice(-25)));}
function slIsActive(){return asteriaSessionLogState==='Active';}
function slEvent(type,title,data={},visibility='Public'){
  if(!slIsActive()) return null;
  const ev={id:'sl-'+Date.now()+'-'+Math.random().toString(16).slice(2),time:slNow(),type,title,visibility,data};
  asteriaSessionEvents.push(ev); slSave(); slRender(); return ev;
}
function slVisibilityLabel(v){return v==='GM-only'?'gm-only-label':(v==='Hidden until revealed'?'hidden-label':'public-label');}
function slInstallPanel(){
  const gmPanels=document.querySelector('.gm-panels'); if(!gmPanels || document.getElementById('sessionLogSystemPanel')) return;
  const panel=document.createElement('section'); panel.className='card session-log-system-panel'; panel.id='sessionLogSystemPanel';
  panel.innerHTML=`
    <div class="section-head"><div><p class="eyebrow">Session Log System v1</p><h3>Session Timeline + Markdown Builder</h3></div><span class="pill" id="slStatePill">${asteriaSessionLogState}</span></div>
    <div class="session-control-grid">
      <button class="primary" onclick="startSession()">Start Session</button>
      <button onclick="pauseSession()">Pause Session</button>
      <button onclick="resumeSession()">Resume Session</button>
      <button class="danger" onclick="endSession()">End Session</button>
      <button onclick="generateSessionLog()">Generate Log</button>
      <button onclick="editSessionLog()">Edit Log</button>
      <button onclick="archiveSessionLog()">Archive Log</button>
      <button onclick="exportSessionMarkdown()">Export Markdown</button>
    </div>
    <p class="muted smallnote">Automatic collection only runs while the session state is <b>Active</b>. Paused, Ended, and Archived states stop automatic logging.</p>
    <div class="session-add-event">
      <select id="slManualType"><option>GM notes</option><option>Quest updates</option><option>Loot rewards</option><option>Conditions</option><option>Combat events</option><option>Player notes</option></select>
      <select id="slManualVisibility"><option>Public</option><option>GM-only</option><option>Hidden until revealed</option></select>
      <input id="slManualText" placeholder="Add manual session event...">
      <button onclick="addManualSessionEvent()">Add Event</button>
    </div>
    <div class="session-filter-row">
      <button onclick="slSetFilter('All')">All</button><button onclick="slSetFilter('Dice rolls')">Dice</button><button onclick="slSetFilter('Combat events')">Combat</button><button onclick="slSetFilter('XP awards')">XP</button><button onclick="slSetFilter('Quest updates')">Quests</button><button onclick="slSetFilter('GM notes')">Notes</button>
      <span class="muted smallnote" id="slActiveFilter">Filter: All</span>
    </div>
    <div id="slTimeline" class="session-timeline"></div>
    <h4>Editable Markdown Draft</h4>
    <textarea id="slMarkdownDraft" class="session-markdown-preview" placeholder="End Session or Generate Log to create a markdown draft..."></textarea>
    <div id="slArchiveList" class="session-archive-list"></div>`;
  const ref=document.querySelector('.gm-session-log-builder');
  if(ref) gmPanels.insertBefore(panel, ref); else gmPanels.appendChild(panel);
}
let slFilter='All';
function slSetFilter(type){slFilter=type; const f=document.getElementById('slActiveFilter'); if(f)f.textContent='Filter: '+type; slRender();}
function slRender(){
  const pill=document.getElementById('slStatePill')||document.getElementById('gmSessionState'); if(pill) pill.textContent=asteriaSessionLogState;
  const timeline=document.getElementById('slTimeline');
  if(timeline){
    const list=(asteriaSessionEvents||[]).filter(e=>slFilter==='All'||e.type===slFilter).slice().reverse();
    timeline.innerHTML=list.length?list.map(e=>`<div class="session-event ${e.visibility==='GM-only'?'gm-private':''} ${e.visibility==='Hidden until revealed'?'hidden-until':''}"><div><b>${e.type}</b><span class="${slVisibilityLabel(e.visibility)}">${e.visibility}</span><small>${e.time}</small></div><p>${e.title}</p></div>`).join(''):'<p class="muted smallnote">No session events collected for this filter.</p>';
  }
  const archives=document.getElementById('slArchiveList');
  if(archives) archives.innerHTML=asteriaArchivedLogs.length?`<h4>Archived Logs</h4>`+asteriaArchivedLogs.slice().reverse().map(a=>`<div class="archive-row"><b>${a.title}</b><small>${a.time}</small></div>`).join(''):'<p class="muted smallnote">No archived logs yet.</p>';
}
function addManualSessionEvent(){
  const type=document.getElementById('slManualType')?.value||'GM notes';
  const visibility=document.getElementById('slManualVisibility')?.value||'Public';
  const text=document.getElementById('slManualText')?.value?.trim();
  if(!text) return toast('Add event text first.');
  if(!slIsActive()) return toast('Manual events can only be added while session is Active.');
  slEvent(type,text,{manual:true},visibility); document.getElementById('slManualText').value=''; toast('Session event added.');
}
function slBuildMarkdown(playerFacing=false){
  const camp=campaigns?.[activeCampaign]?.name||'Asteria Campaign';
  const visibleEvents=(asteriaSessionEvents||[]).filter(e=>!playerFacing || e.visibility==='Public');
  const lines=[];
  lines.push(`# ${camp} — Session Log`); lines.push(`Version: ${ASTERIA_V1713_VERSION}`); lines.push(`State: ${asteriaSessionLogState}`); lines.push(`Generated: ${new Date().toLocaleString()}`); lines.push('');
  const groups=['Dice rolls','Combat events','Initiative rounds','XP awards','Level-ups','Loot rewards','Quest updates','Conditions','GM notes','Player notes'];
  groups.forEach(g=>{lines.push(`## ${g}`); const items=visibleEvents.filter(e=>e.type===g); if(items.length){items.forEach(e=>lines.push(`- ${e.time} [${e.visibility}] ${e.title}`));} else lines.push('- None recorded.'); lines.push('');});
  lines.push('## Timeline'); if(visibleEvents.length){visibleEvents.forEach(e=>lines.push(`- ${e.time} — ${e.type} — ${e.title}`));} else lines.push('- No public events recorded.');
  return lines.join('\n');
}
function generateSessionLog(){const out=document.getElementById('slMarkdownDraft')||document.getElementById('gmSessionLogOutput'); if(out) out.value=slBuildMarkdown(false); toast('Session log draft generated. Review before archive.'); return out?.value||'';}
function editSessionLog(){const out=document.getElementById('slMarkdownDraft')||document.getElementById('gmSessionLogOutput'); if(out){out.focus(); toast('Edit mode: update the draft before archiving.');}}
function archiveSessionLog(){
  if(asteriaSessionLogState!=='Ended') return toast('End Session first. Archive requires GM confirmation after draft generation.');
  const draft=(document.getElementById('slMarkdownDraft')?.value)||generateSessionLog();
  if(!confirm('Archive this session log? GM-only content will remain in the GM archive.')) return;
  asteriaSessionLogState='Archived'; asteriaArchivedLogs.push({title:(campaigns?.[activeCampaign]?.name||'Asteria Campaign')+' Session Log',time:slNow(),markdown:draft}); slSave(); slRender(); toast('Session log archived.');
}
function exportSessionMarkdown(){
  const text=(document.getElementById('slMarkdownDraft')?.value)||generateSessionLog();
  const blob=new Blob([text],{type:'text/markdown'}); const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download='asteria-session-log-v1.7.1.3.md'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); toast('Markdown export created.');
}
function resumeSession(){asteriaSessionLogState='Active'; slSave(); slRender(); addCombatLog?.('Session resumed by GM.','important'); toast('Session resumed. Automatic logging active.');}
startSession=function(){asteriaSessionLogState='Active'; if(!asteriaSessionEvents.length) asteriaSessionEvents=[]; slSave(); slRender(); slEvent('GM notes','Session started by GM.',{},'Public'); toast('Session started. Automatic logging active.');};
pauseSession=function(){if(asteriaSessionLogState!=='Active') return toast('Only an Active session can be paused.'); slEvent('GM notes','Session paused by GM.',{},'Public'); asteriaSessionLogState='Paused'; slSave(); slRender(); toast('Session paused. Automatic logging stopped.');};
endSession=function(){if(!['Active','Paused'].includes(asteriaSessionLogState)) return toast('Start a session before ending it.'); if(slIsActive()) slEvent('GM notes','Session ended by GM. Draft generated, not archived.',{},'Public'); asteriaSessionLogState='Ended'; slSave(); slRender(); generateSessionLog(); toast('Session ended. Draft generated; archive requires GM confirmation.');};
const slOldAddRollHistory=typeof addRollHistory==='function'?addRollHistory:null;
if(slOldAddRollHistory){addRollHistory=function(entry){slOldAddRollHistory(entry); slEvent('Dice rolls',`${entry.roller||'Unknown'} rolled ${entry.label||'Roll'}: ${entry.detail||entry.total}`,{diceType:(entry.detail||'').match(/d\d+/)?.[0]||'',modifier:(entry.detail||'').match(/[+-]\d+/)?.[0]||'0',result:entry.total,outcome:entry.statusLabel||''},'Public'); slRender();};}
const slOldAddCombatLog=typeof addCombatLog==='function'?addCombatLog:null;
if(slOldAddCombatLog){addCombatLog=function(message,type='normal'){slOldAddCombatLog(message,type); if(!String(message).toLowerCase().includes('session')) slEvent(type==='important'?'Combat events':'Combat events',String(message),{round:document.getElementById('roundNo')?.textContent||'',actor:'',target:'',damage:'',conditions:''},'Public');};}
const slOldDistributeCampaignXP=typeof distributeCampaignXP==='function'?distributeCampaignXP:null;
if(slOldDistributeCampaignXP){distributeCampaignXP=function(){const before={}; (campaigns?.[activeCampaign]?.party||[]).forEach(id=>before[id]={level:chars[id].level,xp:chars[id].xp}); slOldDistributeCampaignXP(); const amount=Number(document.getElementById('campaignXPAmount')?.value||0); const party=campaigns?.[activeCampaign]?.party||[]; const share=party.length?Math.floor(amount/party.length):0; party.forEach(id=>{const c=chars[id]; slEvent('XP awards',`${c.name} received split XP: ${share.toLocaleString()} XP. Current XP ${c.xp.toLocaleString()} / ${c.xpMax.toLocaleString()}.`,{splitXP:share,level:c.level,carryover:c.xp},'Public'); if(before[id]&&c.level>before[id].level) slEvent('Level-ups',`${c.name} levelled up from ${before[id].level} to ${c.level}. Carryover XP: ${c.xp.toLocaleString()}.`,{from:before[id].level,to:c.level,carryover:c.xp},'Public');});};}
function slHookRender(){slInstallPanel(); slRender(); const b=document.querySelector('.version-badge'); if(b)b.textContent=ASTERIA_V1713_VERSION;}
window.AsteriaViewHooks?.afterGMRender('session-ledger-panel', () => slHookRender());
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent=ASTERIA_V1713_VERSION;};
document.addEventListener('DOMContentLoaded',()=>setTimeout(slHookRender,200));

/* =========================
   v1.7.1.4 Dice Engine System v1 Integration
   - Updates the existing dice system instead of adding a duplicate page
   - Feeds Dice Log -> Session Log -> Combat Tracker where relevant
   ========================= */
const ASTERIA_V1714_VERSION='v1.7.1.6 • Dice Tower Visual Skins';
let asteriaRevealedRolls={};
function deVal(id, fallback=''){const el=document.getElementById(id);return el?el.value:fallback;}
function updateDiceEnginePreview(){
  const type=deVal('rollTypeSelector','d20');
  const formula=document.getElementById('digitalRollFormula');
  if(!formula) return;
  if(type==='d20' && !/d20/i.test(formula.value)) formula.value='1d20+0';
  if(type==='d100' && !/d100/i.test(formula.value)) formula.value='1d100+0';
  if(type==='damage' && /d20|d100/i.test(formula.value)) formula.value='1d8+0';
  if(type==='emphasis-best' || type==='emphasis-worst') formula.value= type.includes('best')?'2d20kh1+0':'2d20kl1+0';
}
function applyDiceModifierToFormula(){
  const mod=Number(deVal('diceModifierPreview','0')||0); const f=document.getElementById('digitalRollFormula'); if(!f)return;
  let base=f.value.replace(/([+-]\d+)$/,''); f.value=base+(mod?`${mod>0?'+':''}${mod}`:'+0');
}
function parseAdvancedDiceFormula(formula){
  const text=String(formula||'1d20').replace(/\s+/g,'').toLowerCase();
  let keep=null; let clean=text;
  if(clean.includes('kh1')){keep='highest'; clean=clean.replace('kh1','');}
  if(clean.includes('kl1')){keep='lowest'; clean=clean.replace('kl1','');}
  const m=clean.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if(!m) return {valid:false,formula:text,rolls:[],sides:20,count:1,mod:0,total:0,rawTotal:0,keep};
  const count=Math.max(1,Math.min(50,Number(m[1]||1))); const sides=Math.max(2,Math.min(1000,Number(m[2]||20))); const mod=Number(m[3]||0);
  const rolls=[]; for(let i=0;i<count;i++) rolls.push(Math.floor(Math.random()*sides)+1);
  let used=[...rolls]; if(keep==='highest') used=[Math.max(...rolls)]; if(keep==='lowest') used=[Math.min(...rolls)];
  const rawTotal=used.reduce((a,b)=>a+b,0); return {valid:true,formula:text,count,sides,mod,rolls,used,rawTotal,total:rawTotal+mod,natural:count===1?rolls[0]:null,keep};
}
function diceOutcome(parsed,type,threshold=60){
  if(!parsed.valid) return {label:'Invalid',cls:'normal'};
  if(parsed.count===1 && parsed.sides===20 && parsed.natural===20) return {label:'Natural 20 / Critical',cls:'crit'};
  if(parsed.count===1 && parsed.sides===20 && parsed.natural===1) return {label:'Natural 1 / Critical Fail',cls:'fail'};
  if(parsed.count===1 && parsed.sides===100 && parsed.natural===100) return {label:'Natural 100 / Legendary Success',cls:'crit'};
  if(parsed.count===1 && parsed.sides===100 && parsed.natural===1) return {label:'Natural 01 / Severe Failure',cls:'fail'};
  if(type==='d100' || parsed.sides===100){
    const margin=Number(threshold)-parsed.total;
    if(parsed.total<=Math.max(1,Number(threshold)-30)) return {label:'Exceptional Success',cls:'crit'};
    if(parsed.total<=Number(threshold)) return {label:'Success',cls:'normal'};
    if(margin>=-20) return {label:'Failure',cls:'normal'};
    return {label:'Severe Failure',cls:'fail'};
  }
  if(type==='damage') return {label:'Damage Rolled',cls:'normal'};
  if(type==='emphasis-best') return {label:'Emphasis Best Result',cls:'crit'};
  if(type==='emphasis-worst') return {label:'Emphasis Worst Result',cls:'fail'};
  return {label:'Result',cls:'normal'};
}
function diceAnimationDuration(mode){return mode==='quick'?180:(mode==='animated'?750:(mode==='3d'?1850:1850));}
const ASTERIA_TOWER_SKINS={
  castle:{className:'tower-castle',src:'assets/dice-towers/ruined-stone-tower.png',alt:'Ruined Stone Dice Tower',note:'Ruined stone tower: dice drop through the arch and clatter into the tray.'},
  dragon:{className:'tower-dragon',src:'assets/dice-towers/dragon-wrapped-tower.png',alt:'Dragon-Wrapped Castle Dice Tower',note:'Dragon tower: dice spiral down the wrapped tower before the result is revealed.'},
  tree:{className:'tower-tree',src:'assets/dice-towers/ancient-tree-tower.png',alt:'Ancient Tree Dice Tower',note:'Ancient tree tower: dice tumble through roots and branches into the result tray.'},
  mimic:{className:'tower-mimic',src:'assets/dice-towers/mimic-dice-tower.png',alt:'Mimic Dice Tower',note:'Mimic tower: click the hungry tower, it eats the dice, then spits out the result.'}
};
function updateDiceTowerStyle(){
  const tower=document.getElementById('diceTowerStage'); if(!tower) return;
  const style=deVal('diceTowerStyle','castle');
  const skin=ASTERIA_TOWER_SKINS[style]||ASTERIA_TOWER_SKINS.castle;
  tower.classList.remove('tower-castle','tower-dragon','tower-tree','tower-mimic');
  tower.classList.add(skin.className);
  const img=document.getElementById('towerSkinImage'); if(img){img.src=skin.src; img.alt=skin.alt;}
  const note=document.getElementById('diceTowerNote'); if(note) note.value=skin.note;
}
function animateDice(finalValue,cls='normal',mode='animated'){
  const cube=document.getElementById('diceCube'), title=document.getElementById('rollResultTitle'), line=document.getElementById('rollResultLine'), tower=document.getElementById('diceTowerStage'), tray=document.getElementById('towerTray'), towerDie=document.getElementById('towerClickDie');
  if(tower){tower.classList.toggle('active',mode==='tower'); tower.classList.remove('tower-rolling'); updateDiceTowerStyle();}
  if(!cube||!title||!line) return Promise.resolve();
  cube.style.removeProperty('--bounce-x'); cube.style.removeProperty('--bounce-y');
  if(mode==='3d'){
    cube.style.setProperty('--bounce-x',(Math.random()>.5?1:-1)*(140+Math.floor(Math.random()*160))+'px');
    cube.style.setProperty('--bounce-y',(Math.random()>.5?1:-1)*(35+Math.floor(Math.random()*60))+'px');
  }
  cube.className='dice-cube rolling '+(mode==='3d'?'screen-bounce-roll':'')+(mode==='tower'?' tower-roll':'');
  cube.textContent=mode==='tower'?'▾':'✦';
  if(towerDie) towerDie.textContent='⚂';
  if(tower && mode==='tower'){tower.classList.add('tower-rolling'); if(deVal('diceTowerStyle','castle')==='mimic') tower.classList.add('mimic-chomp');}
  title.textContent=mode==='quick'?'Resolving...':'Rolling...';
  line.textContent=mode==='tower'?'Click-roll: dice are tumbling down the selected tower.':(mode==='3d'?'Dice are bouncing across the table before landing.':'Dice are in motion.');
  if(tray) tray.textContent='Rolling...';
  return new Promise(resolve=>setTimeout(()=>{
    cube.className='dice-cube '+cls; cube.textContent=String(finalValue);
    if(tower){tower.classList.remove('tower-rolling','mimic-chomp');}
    if(towerDie) towerDie.textContent=String(finalValue);
    if(tray) tray.textContent='Result: '+finalValue;
    resolve();
  },diceAnimationDuration(mode)));
}
function makeDiceEntry(parsed,type,label,visibility,threshold,mode,manual=false){
  const outcome=diceOutcome(parsed,type,threshold);
  const modTxt=parsed.mod?` ${parsed.mod>0?'+':''}${parsed.mod}`:'';
  const used=(parsed.used&&parsed.used.length!==parsed.rolls.length)?` used [${parsed.used.join(', ')}]`:'';
  const detail=`${parsed.formula} → [${parsed.rolls.join(', ')}]${used}${modTxt} = ${parsed.total}`;
  const diceType=`d${parsed.sides}`;
  return {id:'roll-'+Date.now()+'-'+Math.random().toString(16).slice(2),mode:manual?'Manual Entry':(mode==='quick'?'Quick Roll':mode==='3d'?'3D Bounce Roll':mode==='tower'?('Dice Tower - '+((ASTERIA_TOWER_SKINS[deVal('diceTowerStyle','castle')]||{}).alt||deVal('diceTowerStyle','Castle'))):'Animated Dice'),roller:rollerName(),label,type,diceType,rawRoll:parsed.rolls.join(', '),modifier:parsed.mod,threshold:Number(threshold)||null,total:parsed.total,detail,visibility,outcome:outcome.label,statusLabel:outcome.label,cls:outcome.cls,revealed:visibility==='Public'};
}
async function rollDice(label='Roll', formula='1d20+0'){
  const type=deVal('rollTypeSelector',/d100/i.test(formula)?'d100':(/d20/i.test(formula)?'d20':'damage'));
  const visibility= type==='gm-hidden'?'GM Hidden':deVal('rollVisibility','Public');
  const threshold=Number(deVal('d100Threshold','60')||60);
  const mode=deVal('diceAnimationMode','animated');
  const parsed=parseAdvancedDiceFormula(formula);
  if(!parsed.valid){toast('Invalid dice formula. Use 1d20+5, 1d100+10, 2d6+3, 2d20kh1, or 2d20kl1.');return 0;}
  const entry=makeDiceEntry(parsed,type,label,visibility,threshold,mode,false);
  await animateDice(entry.total,entry.cls,mode);
  addRollHistory(entry); showRollResult(entry); return entry.total;
}
function quickDigitalRoll(){rollDice(deVal('digitalRollLabel','Quick Roll'),deVal('digitalRollFormula','1d20+0'));}
function quickDigitalFormula(formula,type){const f=document.getElementById('digitalRollFormula');if(f)f.value=formula;if(type&&document.getElementById('rollTypeSelector'))document.getElementById('rollTypeSelector').value=type;}
function submitPhysicalRoll(){
  const label=deVal('physicalRollLabel','Manual Roll'); const sides=Number(deVal('physicalDie','20')); let raw=Number(deVal('physicalRaw','0')); const mod=Number(deVal('physicalMod','0'));
  if(raw<1||raw>sides){toast(`Manual result must be between 1 and ${sides}.`);return;}
  const parsed={valid:true,count:1,sides,natural:raw,total:raw+mod,mod,rolls:[raw],used:[raw],formula:`1d${sides}${mod?`${mod>0?'+':''}${mod}`:'+0'}`};
  const type=sides===100?'d100':'d20'; const threshold=Number(deVal('physicalThreshold','60')||60); const visibility=deVal('physicalVisibility','Public'); const entry=makeDiceEntry(parsed,type,label,visibility,threshold,'quick',true);
  animateDice(entry.total,entry.cls,'quick').then(()=>{addRollHistory(entry); showRollResult(entry);});
}
function showRollResult(entry){
  const hidden=(entry.visibility==='GM Hidden' && session.role!=='gm') || (entry.visibility==='Hidden Until Revealed' && !entry.revealed);
  const title=document.getElementById('rollResultTitle'), line=document.getElementById('rollResultLine'), badge=document.getElementById('rollOutcomeBadge');
  if(title) title.textContent=hidden?'Hidden Roll':(entry.outcome||entry.statusLabel||'Result');
  if(line) line.textContent=hidden?`${entry.roller}: result hidden by GM visibility.`:`${entry.roller}: ${entry.detail} • ${entry.visibility}`;
  if(badge){badge.textContent=entry.visibility+' • '+(entry.outcome||entry.statusLabel||'Result'); badge.className='roll-outcome-badge '+(entry.cls||'');}
  toast(`${entry.label}: ${hidden?'Hidden':entry.total}`);
}
function addRollHistory(entry){
  const full={...entry,time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})};
  asteriaRollHistory.unshift(full); asteriaRollHistory=asteriaRollHistory.slice(0,60); renderRollHistory();
  if(typeof slEvent==='function') slEvent('Dice rolls',`${full.roller} rolled ${full.label}: ${full.visibility==='GM Hidden'?'GM Hidden':full.detail} | Outcome: ${full.outcome} | Visibility: ${full.visibility}`,{diceType:full.diceType,modifier:full.modifier,result:full.total,outcome:full.outcome,visibility:full.visibility},full.visibility==='Private'?'GM-only':(full.visibility==='GM Hidden'?'GM-only':(full.visibility==='Hidden Until Revealed'?'Hidden until revealed':'Public')));
  if((full.type==='damage'||/damage/i.test(full.label)) && typeof addCombatLog==='function') addCombatLog(`${full.roller} damage roll ${full.label}: ${full.total} (${full.detail})`,'important');
  if(session.role==='gm') renderGMDiceEnginePanel?.();
}
function renderRollHistory(){
  const render=(box)=>{if(!box)return;box.innerHTML=asteriaRollHistory.length?asteriaRollHistory.map((r,i)=>{const hidden=(r.visibility==='GM Hidden'&&session.role!=='gm')||(r.visibility==='Hidden Until Revealed'&&!r.revealed);return `<div class="roll-entry ${r.cls||''} ${r.visibility==='GM Hidden'?'gm-hidden-roll':''}"><div><b>${r.label}</b><small>${r.mode} • ${r.roller} • ${r.time} • ${r.visibility||'Public'}</small></div><strong>${hidden?'?' : r.total}</strong><span>${hidden?'Result hidden.':r.detail} <em>${r.outcome||r.statusLabel||''}</em></span>${session.role==='gm'?`<button onclick="revealRoll(${i})">Reveal</button><button onclick="markRollImportant(${i})">Important</button>`:''}</div>`;}).join(''):'<p class="muted smallnote">No rolls yet.</p>';};
  render(document.getElementById('rollHistory')); render(document.getElementById('gmRollHistory'));
}
function revealRoll(i){if(!asteriaRollHistory[i])return;asteriaRollHistory[i].revealed=true;asteriaRollHistory[i].visibility='Public';renderRollHistory();if(typeof slEvent==='function')slEvent('Dice rolls',`GM revealed roll: ${asteriaRollHistory[i].label} = ${asteriaRollHistory[i].total}`,{},'Public');toast('Roll revealed.');}
function markRollImportant(i){if(!asteriaRollHistory[i])return;asteriaRollHistory[i].important=true;asteriaRollHistory[i].cls=(asteriaRollHistory[i].cls||'')+' important';renderRollHistory();if(typeof slEvent==='function')slEvent('Dice rolls',`Important roll marked: ${asteriaRollHistory[i].label} = ${asteriaRollHistory[i].total}`,{},'Public');toast('Roll marked important.');}
function installDiceEnginePanel(){
  const gmPanels=document.querySelector('.gm-panels'); if(gmPanels && !document.getElementById('diceEngineGmPanel')){const p=document.createElement('section');p.className='card dice-engine-gm-panel';p.id='diceEngineGmPanel';p.innerHTML=`<div class="section-head"><div><p class="eyebrow">Dice Engine System v1</p><h3>GM Dice Control</h3></div><span class="pill">v1.7.1.6</span></div><div class="dice-gm-actions"><button class="primary" onclick="openDiceModal('GM Hidden Roll','1d20+0','gm-hidden')">GM Hidden d20</button><button onclick="openDiceModal('Public d100 Check','1d100+0','d100')">Public d100</button><button onclick="openDiceModal('Damage Roll','2d6+0','damage')">Damage</button></div><p class="muted smallnote">GM can hide, reveal, or mark rolls as important from the Dice Log.</p><div id="diceEngineGmHistory" class="roll-history compact"></div>`; const ref=document.querySelector('.gm-dice-log-panel'); if(ref)gmPanels.insertBefore(p,ref); else gmPanels.appendChild(p);}
}
function renderGMDiceEnginePanel(){const box=document.getElementById('diceEngineGmHistory'); if(box){box.innerHTML=asteriaRollHistory.slice(0,8).map((r,i)=>`<div class="roll-entry ${r.cls||''}"><div><b>${r.label}</b><small>${r.visibility} • ${r.outcome}</small></div><strong>${r.total}</strong><span>${r.detail}</span><button onclick="revealRoll(${i})">Reveal</button><button onclick="markRollImportant(${i})">Important</button></div>`).join('')||'<p class="muted smallnote">No GM dice history yet.</p>';}}
function openDiceModal(label='Skill Check',formula='1d20+0',type='d20'){
  const m=document.getElementById('diceModal'); if(m)m.classList.add('show');
  if(document.getElementById('digitalRollLabel'))document.getElementById('digitalRollLabel').value=label;
  if(document.getElementById('digitalRollFormula'))document.getElementById('digitalRollFormula').value=formula;
  if(document.getElementById('rollTypeSelector'))document.getElementById('rollTypeSelector').value=type;
  if(type==='gm-hidden'&&document.getElementById('rollVisibility'))document.getElementById('rollVisibility').value='GM Hidden';
  setRollMode('digital');
}
function closeDiceModal(){document.getElementById('diceModal')?.classList.remove('show');}
function setRollMode(mode){document.getElementById('digitalRollBox')?.classList.toggle('show',mode==='digital');document.getElementById('physicalRollBox')?.classList.toggle('show',mode==='physical');document.getElementById('digitalModeBtn')?.classList.toggle('active',mode==='digital');document.getElementById('physicalModeBtn')?.classList.toggle('active',mode==='physical');}
function clearRollHistory(){asteriaRollHistory=[];renderRollHistory();renderGMDiceEnginePanel();toast('Dice result history cleared.');}
window.AsteriaViewHooks?.afterGMRender('dice-engine-gm-panel', () => {installDiceEnginePanel();renderRollHistory();renderGMDiceEnginePanel();const b=document.querySelector('.version-badge');if(b)b.textContent=ASTERIA_V1714_VERSION;});
window.AsteriaViewHooks?.afterView('dice-engine-refresh', null, id => {if(id!=='gm') renderRollHistory();});
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent=ASTERIA_V1714_VERSION;};
document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{installDiceEnginePanel();renderRollHistory();renderGMDiceEnginePanel();updateDiceTowerStyle();buildVersionBadge();},300));

/* =========================
   v1.7.1.7 Combat System v1 Integration
   - Integrated into existing GM Dashboard, Player Dashboard, Dice Log, and Session Log
   - No duplicate pages added
   ========================= */
const ASTERIA_V1717_VERSION='v1.7.1.7 • Combat System v1';
let asteriaCombatState=localStorage.getItem('asteriaCombatState')||'Not In Combat';
let asteriaCombatRound=Number(localStorage.getItem('asteriaCombatRound')||1);
let asteriaCombatTurn=Number(localStorage.getItem('asteriaCombatTurn')||0);
let asteriaCombatSummaryDraft=localStorage.getItem('asteriaCombatSummaryDraft')||'';
let combatTargetType='enemy';
let combatTargetIndex=0;
function combatSave(){localStorage.setItem('asteriaCombatState',asteriaCombatState);localStorage.setItem('asteriaCombatRound',String(asteriaCombatRound));localStorage.setItem('asteriaCombatTurn',String(asteriaCombatTurn));localStorage.setItem('asteriaCombatSummaryDraft',asteriaCombatSummaryDraft||'');}
function combatNow(){return new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function modFromScore(score){score=Number(score||0);return Math.floor((score-10)/2);}
function cChar(id=selected){return chars?.[id]||chars?.[currentPlayerId?.()];}
function combatActorName(){const entry=initiative?.[turnIndex||0];return entry?.name||cChar()?.name||'Unknown Actor';}
function combatDefenseForCharacter(c){const agi=modFromScore(c?.characteristics?.agility||10);const armor=(c?.inventory||[]).some(i=>i.equipped&&/armou?r|cloak|mail|plate|leather/i.test(i.type+' '+i.name))?2:0;const shield=(c?.inventory||[]).some(i=>i.equipped&&/shield/i.test(i.name))?2:0;const talent=Number(c?.combatMods?.defence||0);return 10+agi+armor+shield+talent;}
function combatEnsureEnemyStats(){(enemies||[]).forEach((e,i)=>{if(e.max===undefined)e.max=e.hp||50;if(e.hp===undefined)e.hp=e.max;if(e.defence===undefined)e.defence=10+(i%3)+2;if(e.initiative===undefined)e.initiative=10+i;if(!e.conditions)e.conditions=[];});}
function combatLogEvent(entry){const round=entry.round||asteriaCombatRound;const msg=`R${round} • ${entry.actor||combatActorName()} ${entry.action||'acts'}${entry.target?' → '+entry.target:''}${entry.roll!==undefined?' • Roll '+entry.roll:''}${entry.damage?' • '+entry.damage:''}${entry.resources?' • '+entry.resources:''}${entry.notes?' • '+entry.notes:''}`;addCombatLog?.(msg,entry.important?'important':'normal'); if(typeof slEvent==='function') slEvent('Combat events',msg,entry,'Public'); combatRenderAll();}
function combatSetState(state){asteriaCombatState=state;combatSave();combatLogEvent({action:'set combat state',target:state,actor:'GM',important:true,notes:state}); if(state==='Combat Ended') combatGenerateSummary(); combatRenderAll();}
function combatStart(){asteriaCombatRound=1;turnIndex=0;asteriaCombatTurn=0;combatSetState('Combat Active');}
function combatPrepare(){combatSetState('Preparing Combat');}
function combatPause(){combatSetState('Combat Paused');}
function combatEnd(){combatSetState('Combat Ended');toast('Combat ended. Summary draft generated; GM should confirm XP/rewards.');}
function combatLogged(){combatSetState('Combat Logged');}
function combatNextTurn(){if(!initiative.length){toast('Add initiative entries first.');return;} if(typeof nextTurn==='function') nextTurn(); else turnIndex=(turnIndex+1)%initiative.length; asteriaCombatTurn=turnIndex; combatLogEvent({action:'next turn',actor:'GM',target:combatActorName(),important:true});}
function combatPreviousTurn(){if(!initiative.length)return toast('No initiative entries.');turnIndex=(turnIndex-1+initiative.length)%initiative.length;asteriaCombatTurn=turnIndex;renderInitiative?.();combatLogEvent({action:'previous turn',actor:'GM',target:combatActorName(),important:true});}
function combatEndRound(){asteriaCombatRound+=1;document.getElementById('roundNo')&&(document.getElementById('roundNo').textContent=asteriaCombatRound);combatLogEvent({action:'ended round',actor:'GM',target:'Round '+asteriaCombatRound,important:true});}
function combatTargetName(){if(combatTargetType==='player'){const id=document.getElementById('combatTargetPlayer')?.value||selected;return chars[id]?.name||'Player';} const e=enemies[combatTargetIndex]||enemies[0];return e?.name||'Enemy';}
function combatApplyToTarget(kind,amount){amount=Number(amount||document.getElementById('combatAmount')?.value||0);if(!amount)return toast('Enter an amount first.');let targetName='';if(combatTargetType==='player'){const id=document.getElementById('combatTargetPlayer')?.value||selected;adjustCharacterResource?.(id,'hp',kind==='heal'?amount:-amount);targetName=chars[id]?.name;}else{combatEnsureEnemyStats();const e=enemies[combatTargetIndex]||enemies[0];if(!e)return toast('No enemy target selected.');const old=e.hp;e.hp=Math.max(0,Math.min(e.max,kind==='heal'?e.hp+amount:e.hp-amount));targetName=e.name;renderEnemies?.();if(e.hp===0) combatLogEvent({actor:'GM',action:'defeated',target:e.name,important:true,notes:'Enemy defeated'});}combatLogEvent({actor:'GM',action:kind==='heal'?'healing':'damage',target:targetName,damage:(kind==='heal'?'+':'-')+amount+' HP'});}
function combatApplyDamage(){combatApplyToTarget('damage');}
function combatApplyHealing(){combatApplyToTarget('heal');}
function combatAddEnemy(){if(typeof addEnemy==='function')addEnemy();combatEnsureEnemyStats();combatLogEvent({actor:'GM',action:'added enemy',target:enemies[enemies.length-1]?.name||'Enemy'});}
function combatRemoveEnemy(){if(!enemies.length)return;const e=enemies.splice(combatTargetIndex,1)[0];combatTargetIndex=0;renderEnemies?.();combatLogEvent({actor:'GM',action:'removed enemy',target:e?.name||'Enemy'});}
function combatApplyCondition(){const cond=document.getElementById('combatConditionName')?.value||'Poisoned';const rounds=Number(document.getElementById('combatConditionRounds')?.value||3);let target='';if(combatTargetType==='player'){const id=document.getElementById('combatTargetPlayer')?.value||selected;chars[id].conditions=chars[id].conditions||[];chars[id].conditions.push({name:cond,rounds});target=chars[id].name;renderGM?.();loadPlayer?.(id);}else{combatEnsureEnemyStats();const e=enemies[combatTargetIndex]||enemies[0];if(!e)return toast('No enemy target.');e.conditions.push({name:cond,rounds});target=e.name;renderEnemies?.();}combatLogEvent({actor:'GM',action:'applied condition',target,conditions:cond,notes:`${rounds} rounds`});}
function combatRemoveCondition(){let target='';if(combatTargetType==='player'){const id=document.getElementById('combatTargetPlayer')?.value||selected;target=chars[id].name;(chars[id].conditions||[]).pop();renderGM?.();}else{const e=enemies[combatTargetIndex]||enemies[0];if(!e)return;e.conditions=(e.conditions||[]);e.conditions.pop();target=e.name;renderEnemies?.();}combatLogEvent({actor:'GM',action:'removed condition',target});}
function combatFormulaMods(c){const str=modFromScore(c?.characteristics?.strength||10);const dex=modFromScore(c?.characteristics?.dexterity||10);const equip=(c?.inventory||[]).filter(i=>i.equipped).length;const talent=Number(c?.combatMods?.attack||0);return {attack:Math.max(str,dex)+equip+talent,damage:Math.max(str,dex)+Math.floor(equip/2)+Number(c?.combatMods?.damage||0)};}
function spendCombatResource(c,key,cost){if(!cost)return true;if(!c?.[key]||c[key][0]<cost){toast(`Not enough ${key.toUpperCase()} for this action.`);return false;}c[key][0]-=cost;syncAfterResourceChange?.(currentPlayerId?.()||selected);return true;}
async function combatAttack(actorId=currentPlayerId?.()||selected,dramatic=false){const c=chars[actorId];if(!c)return;const mods=combatFormulaMods(c);const target=combatTargetName();const formula=`1d20${mods.attack>=0?'+':''}${mods.attack}`;const roll=await rollDice?.(`${c.name} Attack`,formula);combatLogEvent({round:asteriaCombatRound,actor:c.name,action:'attack roll',target,roll,notes:roll===20?'Natural 20 flagged':roll===1?'Natural 1 flagged':''});return roll;}
async function combatDamage(actorId=currentPlayerId?.()||selected){const c=chars[actorId];if(!c)return;const mods=combatFormulaMods(c);const formula=`1d6${mods.damage>=0?'+':''}${mods.damage}`;const roll=await rollDice?.(`${c.name} Damage`,formula);combatApplyToTarget('damage',roll);combatLogEvent({round:asteriaCombatRound,actor:c.name,action:'damage roll',target:combatTargetName(),roll,damage:roll+' damage'});}
async function playerCombatAction(action){const id=currentPlayerId?.()||selected;const c=chars[id];if(!c)return;if(asteriaCombatState!=='Combat Active') toast('Combat is not active; GM can override from the GM panel.');if(action==='Attack'){await combatAttack(id);await combatDamage(id);}if(action==='Cast Spell'){if(!spendCombatResource(c,'mp',5))return;await combatAttack(id,true);combatLogEvent({actor:c.name,action:'cast spell',target:combatTargetName(),resources:'-5 MP'});}if(action==='Use Talent'){if(!spendCombatResource(c,'sp',5))return;combatLogEvent({actor:c.name,action:'used talent',resources:'-5 SP'});}if(action==='Use Item'){combatLogEvent({actor:c.name,action:'used item',notes:'Open inventory for exact item effect.'});}if(action==='Defend'){combatLogEvent({actor:c.name,action:'defend',notes:'+defensive posture until next turn'});}if(action==='Move'){if(!spendCombatResource(c,'sp',2))return;combatLogEvent({actor:c.name,action:'move',resources:'-2 SP'});}if(action==='End Turn'){combatLogEvent({actor:c.name,action:'ended turn'});combatNextTurn();}loadPlayer?.(id);renderGM?.();}
function combatGenerateSummary(){const lines=['# Combat Summary','',`- Version: ${ASTERIA_V1717_VERSION}`,`- State: ${asteriaCombatState}`,`- Rounds: ${asteriaCombatRound}`,`- Generated: ${new Date().toLocaleString()}`,'','## Remaining Enemies'];(enemies||[]).forEach(e=>lines.push(`- ${e.name}: ${e.hp}/${e.max} HP, DR ${e.defence||10}, Conditions: ${(e.conditions||[]).map(c=>c.name).join(', ')||'None'}`));lines.push('','## Combat Timeline');(asteriaCombatLog||[]).slice().reverse().forEach(e=>lines.push(`- ${e.time} — ${e.message}`));lines.push('','## GM Follow-Up','- Confirm XP reward.','- Confirm loot/rewards.','- Save or archive session log.');asteriaCombatSummaryDraft=lines.join('\n');combatSave();const out=document.getElementById('combatSummaryDraft');if(out)out.value=asteriaCombatSummaryDraft; if(typeof slEvent==='function')slEvent('Combat events','Combat ended and summary draft generated.',{rounds:asteriaCombatRound},'Public');return asteriaCombatSummaryDraft;}
function combatInstallGmPanel(){const gmPanels=document.querySelector('.gm-panels');if(!gmPanels||document.getElementById('combatSystemPanel'))return;const panel=document.createElement('section');panel.id='combatSystemPanel';panel.className='card combat-system-panel';panel.innerHTML=`<div class="section-head"><div><p class="eyebrow">Combat System v1</p><h3>GM Combat Dashboard</h3></div><span id="combatStatePill" class="pill">${asteriaCombatState}</span></div><div class="combat-status-strip"><div><small>State</small><b id="combatStateText">${asteriaCombatState}</b></div><div><small>Round</small><b id="combatRoundText">${asteriaCombatRound}</b></div><div><small>Turn</small><b id="combatTurnText">${combatActorName()}</b></div><div><small>Enemies</small><b id="combatEnemyCount">${enemies.length}</b></div></div><div class="combat-state-grid"><button onclick="combatPrepare()">Prepare Combat</button><button class="primary" onclick="combatStart()">Start Combat</button><button onclick="combatPause()">Pause Combat</button><button onclick="combatEnd()" class="danger-soft">End Combat</button><button onclick="combatLogged()">Mark Logged</button><button onclick="combatGenerateSummary()">Generate Summary</button></div><div class="combat-control-grid"><button onclick="combatAddEnemy()">Add Enemy</button><button onclick="combatRemoveEnemy()">Remove Enemy</button><button onclick="combatPreviousTurn()">Previous Turn</button><button class="primary" onclick="combatNextTurn()">Next Turn</button><button onclick="combatEndRound()">End Round</button><button onclick="sortInitiative?.();combatRenderAll()">Roll / Sort Initiative</button></div><div class="combat-turn-banner"><b>Current Turn:</b> <span id="combatTurnBanner">${combatActorName()}</span></div><div class="combat-target-row"><label>Target Type<select id="combatTargetType" onchange="combatTargetType=this.value;combatRenderAll()"><option value="enemy">Enemy</option><option value="player">Player</option></select></label><label>Enemy Target<select id="combatTargetEnemy" onchange="combatTargetIndex=Number(this.value);combatRenderAll()"></select></label><label>Player Target<select id="combatTargetPlayer"></select></label><button onclick="combatAttack(selected,true)">GM Attack Roll</button></div><div class="combat-form-row"><label>Amount<input id="combatAmount" type="number" value="10"></label><button onclick="combatApplyDamage()">Apply Damage</button><button onclick="combatApplyHealing()">Apply Healing</button><span class="resource-cost-note">GM override enabled.</span></div><div class="combat-form-row"><label>Condition<select id="combatConditionName"><option>Poisoned</option><option>Burning</option><option>Bleeding</option><option>Stunned</option><option>Restrained</option><option>Frightened</option></select></label><label>Rounds<input id="combatConditionRounds" type="number" value="3"></label><button onclick="combatApplyCondition()">Apply Condition</button><button onclick="combatRemoveCondition()">Remove Condition</button></div><h4>Enemy Combat Cards</h4><div id="combatEnemyCards" class="combat-enemy-cards"></div><h4>Combat Log Timeline</h4><div id="combatLogFull" class="combat-log-rows combat-log-full"></div><h4>Combat Summary Draft</h4><textarea id="combatSummaryDraft" class="combat-summary-box" placeholder="End Combat or Generate Summary to create draft..."></textarea>`;const ref=document.querySelector('.initiative');if(ref)gmPanels.insertBefore(panel,ref);else gmPanels.appendChild(panel);}
function combatInstallPlayerPanel(){const host=document.querySelector('#player .dashboard-grid')||document.querySelector('#player .leftcol')||document.querySelector('#player');if(!host||document.getElementById('playerCombatSystemPanel'))return;const panel=document.createElement('section');panel.id='playerCombatSystemPanel';panel.className='card player-combat-system-panel';panel.innerHTML=`<div class="section-head"><div><p class="eyebrow">Combat System v1</p><h3>Player Combat Panel</h3></div><span class="pill" id="playerCombatStatePill">${asteriaCombatState}</span></div><div class="combat-turn-banner"><b>Current Turn:</b> <span id="playerCombatTurn">${combatActorName()}</span></div><div class="player-combat-actions"><button class="primary" onclick="playerCombatAction('Attack')">Attack</button><button onclick="playerCombatAction('Cast Spell')">Cast Spell</button><button onclick="playerCombatAction('Use Talent')">Use Talent</button><button onclick="playerCombatAction('Use Item')">Use Item</button><button onclick="playerCombatAction('Defend')">Defend</button><button onclick="playerCombatAction('Move')">Move</button><button class="primary" onclick="playerCombatAction('End Turn')">End Turn</button></div><p class="muted smallnote">Attack uses d20 + characteristic + equipment + talent modifier. Damage uses weapon/spell dice + modifiers. Dramatic rolls can still use the Dice Tower from the Dice Engine.</p><div id="playerDefenseLine" class="combat-status-strip"></div></section>`;host.appendChild(panel);}
function combatRenderCards(){combatEnsureEnemyStats();const enemySel=document.getElementById('combatTargetEnemy');if(enemySel){enemySel.innerHTML=(enemies||[]).map((e,i)=>`<option value="${i}" ${i===combatTargetIndex?'selected':''}>${e.name}</option>`).join('');}const playerSel=document.getElementById('combatTargetPlayer');if(playerSel){playerSel.innerHTML=Object.entries(chars||{}).map(([id,c])=>`<option value="${id}" ${id===selected?'selected':''}>${c.name}</option>`).join('');}const box=document.getElementById('combatEnemyCards');if(box){box.innerHTML=(enemies||[]).map((e,i)=>`<article class="combat-enemy-card ${i===combatTargetIndex?'active-target':''}" onclick="combatTargetIndex=${i};combatTargetType='enemy';combatRenderAll()"><h4>${e.name}</h4><div class="mini-line"><span>HP</span><b>${e.hp}/${e.max}</b></div><div class="meter hp"><i style="width:${pct(e.hp,e.max)}%"></i></div><div class="mini-line"><span>Defence Rating</span><b>${e.defence||10}</b></div><div class="mini-line"><span>Initiative</span><b>${e.initiative||'-'}</b></div><div class="condition-chips">${(e.conditions||[]).map(c=>`<span>${conditionIcon?.(c.name)||''} ${c.name} (${c.rounds})</span>`).join('')||'<small>No conditions</small>'}</div><div class="enemy-card-actions"><button onclick="event.stopPropagation();combatTargetIndex=${i};combatApplyToTarget('damage',5)">-5 HP</button><button onclick="event.stopPropagation();combatTargetIndex=${i};combatApplyToTarget('heal',5)">+5 HP</button><button onclick="event.stopPropagation();combatTargetIndex=${i};combatRemoveEnemy()">Remove</button></div></article>`).join('')||'<p class="muted smallnote">No enemies added.</p>';}}
function combatRenderAll(){combatInstallGmPanel();combatInstallPlayerPanel();combatEnsureEnemyStats();const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};set('combatStatePill',asteriaCombatState);set('combatStateText',asteriaCombatState);set('combatRoundText',asteriaCombatRound);set('combatTurnText',combatActorName());set('combatTurnBanner',combatActorName());set('combatEnemyCount',(enemies||[]).length);set('playerCombatStatePill',asteriaCombatState);set('playerCombatTurn',combatActorName());document.getElementById('roundNo')&&(document.getElementById('roundNo').textContent=asteriaCombatRound);const out=document.getElementById('combatSummaryDraft');if(out&&!out.value)out.value=asteriaCombatSummaryDraft;const log=document.getElementById('combatLogFull');if(log)log.innerHTML=(asteriaCombatLog||[]).map(x=>`<div class="combat-log-entry ${x.type==='important'?'important':''}"><b>${x.message}</b><small>${x.time}</small></div>`).join('')||'<p class="muted smallnote">No combat events yet.</p>';const c=chars[currentPlayerId?.()||selected];const def=document.getElementById('playerDefenseLine');if(def&&c){def.innerHTML=`<div><small>Defence Rating</small><b>${combatDefenseForCharacter(c)}</b></div><div><small>HP</small><b>${c.hp[0]} / ${c.hp[1]}</b></div><div><small>SP</small><b>${c.sp[0]} / ${c.sp[1]}</b></div><div><small>MP</small><b>${c.mp[0]} / ${c.mp[1]}</b></div>`;}combatRenderCards();combatSave();const badge=document.querySelector('.version-badge');if(badge)badge.textContent=ASTERIA_V1717_VERSION;}
window.AsteriaViewHooks?.afterGMRender('combat-panels', () => combatRenderAll());
window.AsteriaViewHooks?.afterPlayerLoad('combat-panels', () => combatRenderAll());
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent=ASTERIA_V1717_VERSION;};
document.addEventListener('DOMContentLoaded',()=>setTimeout(combatRenderAll,300));

/* =====================================================
   Asteria v1.7.1.8 — GM Right Menu Panel Upgrade
   Integrated fix: keeps Party Stats as permanent left panel and moves GM systems into a right-side menu.
   ===================================================== */
const ASTERIA_V1718_VERSION='v1.7.1.8';
let asteriaGMActiveSystem=localStorage.getItem('asteriaGMActiveSystem')||'materials';
const asteriaGMSystems=[
  {id:'encounter',label:'Encounter',hint:'Combat, enemies, initiative'},
  {id:'session',label:'Session Logs',hint:'Timeline, archive, export'},
  {id:'dice',label:'Dice Control',hint:'Roll history, reveal, important'},
  {id:'notes',label:'GM Notes',hint:'Private prep and live notes'},
  {id:'campaign',label:'Campaign',hint:'Campaign manager and settings'},
  {id:'rewards',label:'Rewards',hint:'XP split, loot, rewards'},
  {id:'quests',label:'Quests',hint:'Quest updates and hooks'},
  {id:'builder',label:'Encounter Builder',hint:'Build/load encounter sets'},
  {id:'tools',label:'GM Tools',hint:'Overrides and utilities'}
];
function gmMenuCardSystem(card){
  if(!card) return 'tools';
  const txt=(card.textContent||'').toLowerCase();
  const cls=(card.className||'').toLowerCase();
  if(cls.includes('active-encounter')||cls.includes('initiative')||cls.includes('encounter')||cls.includes('combat')||txt.includes('combat')||txt.includes('initiative')||txt.includes('enemy')) return 'encounter';
  if(cls.includes('session')||txt.includes('session log')||txt.includes('live session')||txt.includes('timeline')||txt.includes('archive')||txt.includes('markdown')) return 'session';
  if(cls.includes('dice')||cls.includes('roll')||txt.includes('dice log')||txt.includes('dice engine')||txt.includes('roll history')) return 'dice';
  if(cls.includes('xp')||txt.includes('xp split')||txt.includes('reward')||txt.includes('loot')) return 'rewards';
  if(txt.includes('quest')) return 'quests';
  if(txt.includes('campaign')&&!txt.includes('session')) return 'campaign';
  if(txt.includes('builder')||txt.includes('creature select')||txt.includes('load enemies')) return 'builder';
  if(txt.includes('note')) return 'notes';
  return 'tools';
}
function ensureGMRightMenu(){
  const gm=document.getElementById('gm'); if(!gm) return;
  const layout=gm.querySelector('.gm-layout'); if(!layout) return;
  if(!layout.querySelector('.gm-right-menu')){
    const aside=document.createElement('aside');
    aside.className='card gm-right-menu';
    aside.innerHTML=`<div class="right-menu-head"><p class="eyebrow">GM Menu</p><h2>Systems</h2><p class="muted smallnote">Party Stats remains fixed on the left. Use this menu to switch the right-side GM systems without duplicating features.</p></div><div id="gmSystemButtons" class="gm-system-buttons"></div><div class="gm-menu-footer"><span class="pill">${ASTERIA_V1718_VERSION}</span><button onclick="setView('campaigns')">Campaign Manager</button></div>`;
    layout.appendChild(aside);
  }
  const btns=document.getElementById('gmSystemButtons');
  if(btns){
    btns.innerHTML=asteriaGMSystems.map(s=>`<button class="gm-system-btn ${s.id===asteriaGMActiveSystem?'active':''}" onclick="setGMSystemPanel('${s.id}')"><b>${s.label}</b><small>${s.hint}</small></button>`).join('');
  }
}
function setGMSystemPanel(id){
  asteriaGMActiveSystem=id;
  localStorage.setItem('asteriaGMActiveSystem',id);
  applyGMSystemPanel();
}
function applyGMSystemPanel(){
  ensureGMRightMenu();
  const gm=document.getElementById('gm'); if(!gm) return;
  const btns=gm.querySelectorAll('.gm-system-btn');
  btns.forEach(b=>b.classList.toggle('active',b.getAttribute('onclick')?.includes(`'${asteriaGMActiveSystem}'`)));
  const panels=gm.querySelector('.gm-panels'); if(!panels) return;
  panels.classList.add('gm-systems-content');
  Array.from(panels.children).forEach(card=>{
    if(!card.classList?.contains('card')) return;
    if(card.classList.contains('gm-system-title')) return;
    const system=card.dataset.gmSystem||gmMenuCardSystem(card);
    card.dataset.gmSystem=system;
    card.classList.toggle('gm-system-hidden',system!==asteriaGMActiveSystem);
  });
  let title=panels.querySelector('.gm-system-title');
  if(!title){
    title=document.createElement('section');
    title.className='card gm-system-title';
    panels.prepend(title);
  }
  const meta=asteriaGMSystems.find(s=>s.id===asteriaGMActiveSystem)||asteriaGMSystems[0];
  title.innerHTML=`<div><p class="eyebrow">Active GM System</p><h2>${meta.label}</h2><p class="muted">${meta.hint}. Player party stats stay visible on the left for live control.</p></div>`;
  const badge=document.querySelector('.version-badge'); if(badge) badge.textContent=ASTERIA_V1718_VERSION;
}
window.AsteriaViewHooks?.afterGMRender('gm-system-menu', () => applyGMSystemPanel());
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent=ASTERIA_V1718_VERSION;};
document.addEventListener('DOMContentLoaded',()=>setTimeout(applyGMSystemPanel,500));

/* =====================================================
   Asteria v1.7.1.9 — GM Menu Layout Fix
   Moves GM menu from right side to directly under the GM campaign header.
   Keeps Party Stats fixed on the left and keeps all systems integrated.
   ===================================================== */
const ASTERIA_V1719_VERSION='v1.7.1.9';
function ensureGMRightMenu(){
  const gm=document.getElementById('gm'); if(!gm) return;
  const layout=gm.querySelector('.gm-layout');
  const main=gm.querySelector('.gm-main');
  if(!layout||!main) return;
  // Remove the old right-side menu so the system is not duplicated.
  layout.querySelectorAll('.gm-right-menu').forEach(el=>el.remove());
  let bar=main.querySelector('.gm-menu-bar');
  if(!bar){
    bar=document.createElement('section');
    bar.className='card gm-menu-bar';
    bar.innerHTML=`<div class="gm-menu-bar-head"><div><p class="eyebrow">GM Menu</p><h2>Systems</h2><p class="muted smallnote">Switch active GM systems below the campaign header. Party Stats stays fixed on the left for live control.</p></div><span class="pill gm-menu-version">${ASTERIA_V1719_VERSION}</span></div><div id="gmSystemButtons" class="gm-system-buttons"></div><div class="gm-menu-bar-actions"><button onclick="setView('campaigns')">Campaign Manager</button><button onclick="startSession()">Start Session</button><button onclick="endSession()">End + Build Log</button></div>`;
    const hero=main.querySelector('.gm-hero');
    if(hero && hero.nextSibling) main.insertBefore(bar,hero.nextSibling); else main.prepend(bar);
  }
  const btns=bar.querySelector('#gmSystemButtons');
  if(btns){
    btns.innerHTML=asteriaGMSystems.map(s=>`<button class="gm-system-btn ${s.id===asteriaGMActiveSystem?'active':''}" onclick="setGMSystemPanel('${s.id}')"><b>${s.label}</b><small>${s.hint}</small></button>`).join('');
  }
}
function applyGMSystemPanel(){
  ensureGMRightMenu();
  const gm=document.getElementById('gm'); if(!gm) return;
  const btns=gm.querySelectorAll('.gm-menu-bar .gm-system-btn');
  btns.forEach(b=>b.classList.toggle('active',b.getAttribute('onclick')?.includes(`'${asteriaGMActiveSystem}'`)));
  const panels=gm.querySelector('.gm-panels'); if(!panels) return;
  panels.classList.add('gm-systems-content');
  Array.from(panels.children).forEach(card=>{
    if(!card.classList?.contains('card')) return;
    if(card.classList.contains('gm-system-title')) return;
    const system=card.dataset.gmSystem||gmMenuCardSystem(card);
    card.dataset.gmSystem=system;
    card.classList.toggle('gm-system-hidden',system!==asteriaGMActiveSystem);
  });
  let title=panels.querySelector('.gm-system-title');
  if(!title){
    title=document.createElement('section');
    title.className='card gm-system-title';
    panels.prepend(title);
  }
  const meta=asteriaGMSystems.find(s=>s.id===asteriaGMActiveSystem)||asteriaGMSystems[0];
  title.innerHTML=`<div><p class="eyebrow">Active GM System</p><h2>${meta.label}</h2><p class="muted">${meta.hint}. Player party stats stay visible on the left for live control.</p></div><span class="pill">${ASTERIA_V1719_VERSION}</span>`;
  const badge=document.querySelector('.version-badge'); if(badge) badge.textContent=ASTERIA_V1719_VERSION;
}
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent=ASTERIA_V1719_VERSION;};
document.addEventListener('DOMContentLoaded',()=>setTimeout(applyGMSystemPanel,700));


/* =====================================================
   Asteria v1.7.2.0 — Manual Roll Tracking System
   Purpose: remove digital dice / auto damage. Website is now a tracker.
   Players and GM roll physical dice, enter scores, and the site shows modifiers.
   ===================================================== */
const ASTERIA_V1720_VERSION='v1.7.2.0 • Manual Tracking';

// Remove Dice Control from GM menu while keeping manual score logging available.
try{
  if(Array.isArray(asteriaGMSystems)){
    for(let i=asteriaGMSystems.length-1;i>=0;i--){ if(asteriaGMSystems[i]?.id==='dice') asteriaGMSystems.splice(i,1); }
  }
}catch(e){}

function v1720ModifierFromFormula(formula){
  const m=String(formula||'').match(/([+-]\d+)\s*$/); return m?Number(m[1]):0;
}
function v1720DiceTypeFromFormula(formula){
  const m=String(formula||'').match(/d(\d+)/i); return m?'d'+m[1]:'manual';
}
function v1720Outcome(type, raw, total, threshold, target){
  raw=Number(raw||0); total=Number(total||0);
  if(type==='d20' || type==='attack'){
    if(raw===20) return 'Natural 20 / Critical Success';
    if(raw===1) return 'Natural 1 / Critical Failure';
    if(target) return total>=Number(target)?'Suggested Hit':'Suggested Miss';
    return 'Manual d20 Check';
  }
  if(type==='d100'){
    if(raw===100) return 'Natural 100 / Legendary Success';
    if(raw===1) return 'Natural 01 / Severe Failure';
    return total<=Number(threshold||60)?'Suggested Success':'Suggested Failure';
  }
  if(type==='damage') return 'Manual Damage / Healing Amount';
  return 'Manual Entry Logged';
}
function addManualRollHistory(entry){
  const e={
    id:'manual-'+Date.now()+'-'+Math.random().toString(16).slice(2),
    mode:'Manual Entry',roller:rollerName?.()||'Unknown',label:entry.label||'Manual Check',
    type:entry.type||'manual',diceType:entry.diceType||'manual',rawRoll:entry.raw,
    modifier:Number(entry.modifier||0),threshold:entry.threshold||null,total:Number(entry.total||0),
    detail:entry.detail||'',visibility:entry.visibility||'Public',outcome:entry.outcome||'Manual Entry Logged',
    statusLabel:entry.outcome||'Manual Entry Logged',cls:entry.cls||'normal',revealed:true,
    time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})
  };
  if(!Array.isArray(asteriaRollHistory)) window.asteriaRollHistory=[];
  asteriaRollHistory.unshift(e); asteriaRollHistory=asteriaRollHistory.slice(0,50);
  if(typeof renderRollHistory==='function') renderRollHistory();
  if(typeof v1720RenderManualLog==='function') v1720RenderManualLog();
  if(typeof slEvent==='function') slEvent('Manual roll entries',`${e.roller} entered ${e.label}: ${e.detail||e.total}`,e,e.visibility);
  return e;
}

// Safety override: any old digital roll calls become manual prompts instead of random rolls.
async function rollDice(label='Manual Check', formula='1d20+0'){
  const mod=v1720ModifierFromFormula(formula);
  const raw=Number(prompt(`${label}\nEnter physical dice result only.\nModifier shown by system: ${mod>=0?'+':''}${mod}`, '10'));
  if(!raw){toast?.('Manual roll cancelled.');return 0;}
  const total=raw+mod;
  const type=/d100/i.test(formula)?'d100':(/d20/i.test(formula)?'d20':'damage');
  const outcome=v1720Outcome(type,raw,total,60,0);
  addManualRollHistory({label,type,diceType:v1720DiceTypeFromFormula(formula),raw,modifier:mod,total,outcome,detail:`Physical ${v1720DiceTypeFromFormula(formula)} ${raw} ${mod?`${mod>0?'+':''}${mod}`:''} = ${total}`});
  toast?.(`${label}: ${total} (${outcome})`);
  return total;
}
function quickDigitalRoll(){toast?.('Digital dice has been removed in v1.7.2.0. Use manual entry.');openManualCheckPrompt?.('Manual Check');}
function openDiceModal(){toast?.('Digital dice has been removed. Use manual score entry in the tracker.');openManualCheckPrompt?.('Manual Check');}
function closeDiceModal(){document.getElementById('diceModal')?.classList.remove('show');}
function clearRollHistory(){asteriaRollHistory=[];v1720RenderManualLog?.();toast?.('Manual roll log cleared.');}
function submitPhysicalRoll(){
  const raw=Number(document.getElementById('physicalRaw')?.value||0); const mod=Number(document.getElementById('physicalMod')?.value||0);
  const sides=Number(document.getElementById('physicalDie')?.value||20); const label=document.getElementById('physicalRollLabel')?.value||'Manual Check';
  if(raw<1||raw>sides)return toast?.(`Manual result must be between 1 and ${sides}.`);
  const total=raw+mod; const type=sides===100?'d100':'d20'; const threshold=Number(document.getElementById('physicalThreshold')?.value||60);
  const outcome=v1720Outcome(type,raw,total,threshold,0);
  addManualRollHistory({label,type,diceType:'d'+sides,raw,modifier:mod,total,threshold,outcome,detail:`Physical d${sides} ${raw} ${mod?`${mod>0?'+':''}${mod}`:''} = ${total}`});
  toast?.(`${label}: ${total}`);
}
function openManualCheckPrompt(label='Manual Check', mod=0, type='d20', threshold=60, target=0){
  const raw=Number(prompt(`${label}\nEnter physical dice result.\nModifier: ${mod>=0?'+':''}${mod}`, type==='d100'?'50':'10'));
  if(!raw){toast?.('Manual entry cancelled.');return 0;}
  const total=raw+Number(mod||0); const outcome=v1720Outcome(type,raw,total,threshold,target);
  addManualRollHistory({label,type,diceType:type==='d100'?'d100':type==='damage'?'damage':'d20',raw,modifier:mod,total,threshold,outcome,detail:`${raw} ${mod?`${mod>0?'+':''}${mod}`:''} = ${total}${target?` vs Target ${target}`:''}`});
  toast?.(`${label}: ${total} — ${outcome}`); return total;
}

function v1720AttackMod(c){try{return combatFormulaMods?.(c)?.attack ?? playerAttackBonusClean?.() ?? 0;}catch(e){return 0;}}
function v1720DamageMod(c){try{return combatFormulaMods?.(c)?.damage ?? Math.max(0,tierBonus(c?.characteristics?.strength||0)) ?? 0;}catch(e){return 0;}}
function v1720CurrentTarget(){return (enemies&&enemies[combatTargetIndex]) || (typeof cleanCurrentTarget==='function'?cleanCurrentTarget():null);}
function v1720TargetDR(){const t=v1720CurrentTarget(); return Number(t?.defence||t?.ac||10);}
function v1720ApplyManualAttack(actorId=currentPlayerId?.()||selected){
  const c=chars[actorId]; if(!c)return toast?.('No actor selected.');
  const mod=v1720AttackMod(c), target=v1720CurrentTarget(), dr=v1720TargetDR();
  const raw=Number(document.getElementById('manualAttackRaw')?.value||prompt(`Attack Roll for ${c.name}\nEnter d20 result. Modifier: ${mod>=0?'+':''}${mod}. Target DR: ${dr}`,'10'));
  if(!raw)return;
  const total=raw+mod, outcome=v1720Outcome('attack',raw,total,60,dr);
  addManualRollHistory({label:`${c.name} Attack`,type:'attack',diceType:'d20',raw,modifier:mod,total,outcome,detail:`d20 ${raw} ${mod?`${mod>0?'+':''}${mod}`:''} = ${total} vs DR ${dr}`});
  combatLogEvent?.({round:asteriaCombatRound,actor:c.name,action:'manual attack entry',target:target?.name||combatTargetName?.(),roll:total,notes:outcome});
  v1720UpdateManualCombatPreview();
}
function v1720ApplyManualDamage(actorId=currentPlayerId?.()||selected){
  const c=chars[actorId]; if(!c)return toast?.('No actor selected.');
  const mod=v1720DamageMod(c), target=v1720CurrentTarget();
  const raw=Number(document.getElementById('manualDamageRaw')?.value||prompt(`Damage for ${c.name}\nEnter damage rolled/declared. Modifier: ${mod>=0?'+':''}${mod}`,'0'));
  if(raw<0||Number.isNaN(raw))return;
  const total=Math.max(0,raw+mod);
  addManualRollHistory({label:`${c.name} Damage`,type:'damage',diceType:'manual damage',raw,modifier:mod,total,outcome:'Manual Damage Confirmed',detail:`Damage ${raw} ${mod?`${mod>0?'+':''}${mod}`:''} = ${total}`});
  if(target) combatApplyToTarget?.('damage',total);
  combatLogEvent?.({round:asteriaCombatRound,actor:c.name,action:'manual damage entry',target:target?.name||combatTargetName?.(),damage:total+' damage',notes:'Applied by tracker from manual input'});
  v1720UpdateManualCombatPreview();
}
function v1720LogManualAction(action){
  const id=currentPlayerId?.()||selected; const c=chars[id]; if(!c)return;
  if(action==='Cast Spell'){if(!spendCombatResource?.(c,'mp',5))return; combatLogEvent?.({actor:c.name,action:'cast spell',target:combatTargetName?.(),resources:'-5 MP',notes:'Manual roll/damage if required.'});}
  else if(action==='Use Talent'){if(!spendCombatResource?.(c,'sp',5))return; combatLogEvent?.({actor:c.name,action:'used talent',resources:'-5 SP',notes:'Manual result if required.'});}
  else if(action==='Use Item') combatLogEvent?.({actor:c.name,action:'used item',notes:'Track item effect manually.'});
  else if(action==='Defend') combatLogEvent?.({actor:c.name,action:'defend',notes:'Defensive posture noted.'});
  else if(action==='Move'){if(!spendCombatResource?.(c,'sp',2))return; combatLogEvent?.({actor:c.name,action:'move',resources:'-2 SP'});}
  else if(action==='End Turn'){combatLogEvent?.({actor:c.name,action:'ended turn'});combatNextTurn?.();}
  loadPlayer?.(id);renderGM?.();combatRenderAll?.();
}

async function combatAttack(actorId=currentPlayerId?.()||selected){return v1720ApplyManualAttack(actorId);}
async function combatDamage(actorId=currentPlayerId?.()||selected){return v1720ApplyManualDamage(actorId);}
async function playerCombatAction(action){
  if(asteriaCombatState!=='Combat Active') toast?.('Combat is not active; GM can still track manually.');
  if(action==='Attack') return v1720ApplyManualAttack();
  return v1720LogManualAction(action);
}
function performAttack(){return v1720ApplyManualAttack(currentPlayerId?.()||selected);}
function castSpell(){return v1720LogManualAction('Cast Spell');}

function v1720ManualCombatHtml(){
  return `<section class="manual-combat-entry"><div class="section-head mini"><div><h4>Manual Combat Entry</h4><p class="muted smallnote">Roll physical dice at the table. Enter the score here. The tracker shows modifiers, totals, and suggested hit/miss only.</p></div><span class="pill">No Auto Roll</span></div><div class="manual-combat-grid"><label>Attack d20 Result<input id="manualAttackRaw" type="number" min="1" max="20" value="10" oninput="v1720UpdateManualCombatPreview()"></label><label>Attack Modifier<input id="manualAttackMod" type="number" readonly></label><label>Target Defence<input id="manualTargetDR" type="number" readonly></label><button class="primary" onclick="v1720ApplyManualAttack()">Log Attack</button><label>Damage Entered<input id="manualDamageRaw" type="number" min="0" value="0" oninput="v1720UpdateManualCombatPreview()"></label><label>Damage Modifier<input id="manualDamageMod" type="number" readonly></label><label>Final Damage<input id="manualFinalDamage" type="number" readonly></label><button onclick="v1720ApplyManualDamage()">Apply Damage</button></div><div class="manual-result-strip"><div><small>Attack Total</small><b id="manualAttackTotal">—</b></div><div><small>Suggested Result</small><b id="manualAttackOutcome">—</b></div><div><small>Damage Total</small><b id="manualDamageTotal">—</b></div><div><small>Mode</small><b>Tracker</b></div></div></section>`;
}
function v1720UpdateManualCombatPreview(){
  const c=chars[currentPlayerId?.()||selected]||chars[selected]; if(!c)return;
  const atk=v1720AttackMod(c), dmg=v1720DamageMod(c), dr=v1720TargetDR();
  const ar=Number(document.getElementById('manualAttackRaw')?.value||0); const da=Number(document.getElementById('manualDamageRaw')?.value||0);
  const set=(id,v)=>{const el=document.getElementById(id); if(el)el.value=v; const tx=document.getElementById(id);};
  if(document.getElementById('manualAttackMod'))document.getElementById('manualAttackMod').value=atk;
  if(document.getElementById('manualDamageMod'))document.getElementById('manualDamageMod').value=dmg;
  if(document.getElementById('manualTargetDR'))document.getElementById('manualTargetDR').value=dr;
  const at=ar+atk, dt=Math.max(0,da+dmg);
  if(document.getElementById('manualFinalDamage'))document.getElementById('manualFinalDamage').value=dt;
  if(document.getElementById('manualAttackTotal'))document.getElementById('manualAttackTotal').textContent=ar?at:'—';
  if(document.getElementById('manualAttackOutcome'))document.getElementById('manualAttackOutcome').textContent=ar?v1720Outcome('attack',ar,at,60,dr):'—';
  if(document.getElementById('manualDamageTotal'))document.getElementById('manualDamageTotal').textContent=da?dt:'—';
}
function v1720InstallManualPlayerPanel(){
  const panel=document.getElementById('playerCombatSystemPanel'); if(!panel)return;
  const note=panel.querySelector('.muted.smallnote'); if(note) note.textContent='Manual tracking mode: roll physical dice, enter results when needed, and use the tracker for modifiers, resources, conditions, and logs.';
  if(!panel.querySelector('.manual-combat-entry')) panel.insertAdjacentHTML('beforeend',v1720ManualCombatHtml());
  const actions=panel.querySelector('.player-combat-actions'); if(actions){actions.innerHTML=`<button class="primary" onclick="v1720ApplyManualAttack()">Log Attack</button><button onclick="v1720LogManualAction('Cast Spell')">Cast Spell</button><button onclick="v1720LogManualAction('Use Talent')">Use Talent</button><button onclick="v1720LogManualAction('Use Item')">Use Item</button><button onclick="v1720LogManualAction('Defend')">Defend</button><button onclick="v1720LogManualAction('Move')">Move</button><button class="primary" onclick="v1720LogManualAction('End Turn')">End Turn</button>`;}
}
function v1720InstallManualGmPanel(){
  const panel=document.getElementById('combatSystemPanel'); if(!panel)return;
  const btn=[...panel.querySelectorAll('button')].find(b=>/GM Attack Roll/i.test(b.textContent)); if(btn){btn.textContent='GM Manual Attack Entry'; btn.setAttribute('onclick','v1720ApplyManualAttack(selected)');}
  if(!panel.querySelector('.manual-combat-entry')){
    const row=panel.querySelector('.combat-target-row'); if(row) row.insertAdjacentHTML('afterend',v1720ManualCombatHtml());
  }
}
function v1720RenderManualLog(){
  const host=document.getElementById('manualRollLog')||document.getElementById('gmRollHistory'); if(!host)return;
  host.innerHTML=(asteriaRollHistory||[]).slice(0,12).map(r=>`<div class="roll-entry ${r.cls||''}"><div><b>${r.label}</b><small>${r.mode||'Manual'} • ${r.roller||'Unknown'} • ${r.time||''}</small></div><strong>${r.total}</strong><span>${r.detail||''}</span></div>`).join('')||'<p class="muted smallnote">No manual score entries yet.</p>';
}
function v1720InstallManualLogPanel(){
  const panels=document.querySelector('#gm .gm-panels'); if(!panels||document.getElementById('manualRollLogPanel'))return;
  const card=document.createElement('section');card.id='manualRollLogPanel';card.className='card manual-roll-card';card.dataset.gmSystem='session';
  card.innerHTML=`<div class="section-head mini"><div><h3>Manual Score Log</h3><p class="muted smallnote">Tracks entered dice scores only. No digital dice rolls are generated by the website.</p></div><button onclick="clearRollHistory()">Clear</button></div><div id="manualRollLog" class="roll-history compact"></div>`;
  const ref=panels.querySelector('.gm-session-log-builder'); if(ref) panels.insertBefore(card,ref); else panels.appendChild(card);
}
function v1720CleanUI(){
  document.querySelectorAll('#diceModal,.dice-engine-gm-panel,#diceEngineGmPanel,.gm-dice-log-panel,.dice-engine-panel').forEach(el=>el.remove());
  document.querySelectorAll('button').forEach(b=>{if(/Roll Dice|Dice Control|GM Hidden d20|Public d100/i.test(b.textContent||'')) b.remove();});
  document.querySelectorAll('.gm-system-btn').forEach(b=>{if(/Dice Control/i.test(b.textContent||'')) b.remove();});
  document.querySelectorAll('.version-badge').forEach(b=>b.textContent=ASTERIA_V1720_VERSION);
}
const v1720OldCombatRenderAll=typeof combatRenderAll==='function'?combatRenderAll:function(){};
combatRenderAll=function(){v1720OldCombatRenderAll();v1720InstallManualPlayerPanel();v1720InstallManualGmPanel();v1720InstallManualLogPanel();v1720UpdateManualCombatPreview();v1720RenderManualLog();v1720CleanUI();};
window.AsteriaViewHooks?.afterGMRender('manual-action-tracker-gm', () => {v1720InstallManualLogPanel();v1720CleanUI();v1720RenderManualLog();v1720UpdateManualCombatPreview();applyGMSystemPanel?.();});
window.AsteriaViewHooks?.afterPlayerLoad('manual-action-tracker-player', () => {v1720InstallManualPlayerPanel();v1720UpdateManualCombatPreview();v1720CleanUI();});
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent=ASTERIA_V1720_VERSION;};
document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{v1720CleanUI();v1720InstallManualLogPanel();combatRenderAll?.();buildVersionBadge();},900));

/* =====================================================
   Asteria v1.7.2.1 — Resource Action Tracker
   Removes the dedicated combat system UI and replaces it with manual spell/talent/item action panels.
   The website is now a tracker: players/GM enter resource changes and manual scores when needed.
   ===================================================== */
const ASTERIA_V1721_VERSION='v1.7.2.1 • Resource Action Tracker';
let asteriaActionHistory=JSON.parse(localStorage.getItem('asteriaActionHistory')||'[]');
function v1721SaveActions(){localStorage.setItem('asteriaActionHistory',JSON.stringify(asteriaActionHistory.slice(0,120)));}
function v1721ActorId(){return (typeof currentPlayerId==='function'?currentPlayerId():null)||selected||Object.keys(chars||{})[0];}
function v1721Actor(){return chars[v1721ActorId()];}
function v1721Mod(c,key){try{return tierBonus?.(c?.characteristics?.[key]||0)||0;}catch(e){return 0;}}
function v1721ResourceCostFromPanel(prefix){return {hp:Number(document.getElementById(prefix+'HpCost')?.value||0),sp:Number(document.getElementById(prefix+'SpCost')?.value||0),mp:Number(document.getElementById(prefix+'MpCost')?.value||0)};}
function v1721CanPay(c,cost){return c&&c.hp[0]>=cost.hp&&c.sp[0]>=cost.sp&&c.mp[0]>=cost.mp;}
function v1721Pay(c,cost){c.hp[0]=Math.max(0,c.hp[0]-cost.hp);c.sp[0]=Math.max(0,c.sp[0]-cost.sp);c.mp[0]=Math.max(0,c.mp[0]-cost.mp);}
function v1721CostText(cost){return `HP -${cost.hp||0} • SP -${cost.sp||0} • MP -${cost.mp||0}`;}
function v1721AddAction(entry){
  const full={time:new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}),...entry};
  asteriaActionHistory.unshift(full);asteriaActionHistory=asteriaActionHistory.slice(0,120);v1721SaveActions();
  if(typeof addCombatLog==='function') addCombatLog(`${full.actor||'Actor'} ${full.action||'action'}${full.target?` → ${full.target}`:''}. ${full.cost||''} ${full.note||''}`,'important');
  if(typeof slEvent==='function') slEvent('Player actions',`${full.actor||'Actor'} ${full.action||'action'}${full.target?` on ${full.target}`:''}. ${full.cost||''} ${full.note||''}`,full,'Public');
  v1721RenderActionHistory();saveAsteriaState?.();renderGM?.();loadPlayer?.(v1721ActorId());
}
function v1721ApplyAction(kind,prefix='playerAction'){
  const c=v1721Actor(); if(!c)return toast?.('No character selected.');
  const cost=v1721ResourceCostFromPanel(prefix);
  if(!v1721CanPay(c,cost))return toast?.(`Not enough resources for ${kind}.`);
  const name=document.getElementById(prefix+'Name')?.value?.trim()||kind;
  const target=document.getElementById(prefix+'Target')?.value?.trim()||'';
  const manual=document.getElementById(prefix+'Manual')?.value?.trim()||'';
  const note=document.getElementById(prefix+'Note')?.value?.trim()||'';
  const before=`HP ${c.hp[0]}/${c.hp[1]} • SP ${c.sp[0]}/${c.sp[1]} • MP ${c.mp[0]}/${c.mp[1]}`;
  v1721Pay(c,cost);
  const after=`HP ${c.hp[0]}/${c.hp[1]} • SP ${c.sp[0]}/${c.sp[1]} • MP ${c.mp[0]}/${c.mp[1]}`;
  const modLine=v1721ModifierLine(c,kind);
  v1721AddAction({actor:c.name,kind,action:name,target,cost:v1721CostText(cost),manual,modifiers:modLine,before,after,note});
  toast?.(`${name} tracked. ${v1721CostText(cost)}`);
}
function v1721ModifierLine(c,kind){
  const str=v1721Mod(c,'strength'), dex=v1721Mod(c,'dexterity'), agi=v1721Mod(c,'agility'), int=v1721Mod(c,'intelligence'), wis=v1721Mod(c,'wisdom'), cha=v1721Mod(c,'charisma');
  if(/spell/i.test(kind)) return `Spell reference: INT ${int>=0?'+':''}${int} • WIS ${wis>=0?'+':''}${wis} • CHA ${cha>=0?'+':''}${cha}`;
  if(/talent/i.test(kind)) return `Talent reference: STR ${str>=0?'+':''}${str} • DEX ${dex>=0?'+':''}${dex} • AGI ${agi>=0?'+':''}${agi}`;
  return `Action reference: STR ${str>=0?'+':''}${str} • DEX ${dex>=0?'+':''}${dex} • AGI ${agi>=0?'+':''}${agi} • INT ${int>=0?'+':''}${int} • WIS ${wis>=0?'+':''}${wis}`;
}
function v1721PanelHtml(prefix='playerAction'){
  const c=v1721Actor();
  const spellMods=c?v1721ModifierLine(c,'Spell'):'—'; const talentMods=c?v1721ModifierLine(c,'Talent'):'—';
  return `<section class="card resource-action-panel" id="${prefix}Panel" data-gm-system="actions"><div class="section-head"><div><p class="eyebrow">Resource Action Tracker</p><h3>Spells, Talents & Manual Scores</h3><p class="muted smallnote">No combat automation. Roll at the table when needed, enter the score/note here, and let the site deduct HP/SP/MP costs.</p></div><span class="pill">No Combat System</span></div><div class="modifier-reference-grid"><div><small>Spell Modifiers</small><b>${spellMods}</b></div><div><small>Talent Modifiers</small><b>${talentMods}</b></div><div><small>Defence Reference</small><b>${c?(typeof combatDefenseForCharacter==='function'?combatDefenseForCharacter(c):10):'—'}</b></div></div><div class="resource-action-grid"><label>Action / Spell / Talent Name<input id="${prefix}Name" placeholder="e.g. Healing Light, Arcane Edge, Mana Step"></label><label>Target / Notes Target<input id="${prefix}Target" placeholder="Target or self"></label><label>Manual Score / Result<input id="${prefix}Manual" placeholder="e.g. d20 16 + 4 = 20, or healed 8"></label><label>HP Cost<input id="${prefix}HpCost" type="number" value="0" min="0"></label><label>SP Cost<input id="${prefix}SpCost" type="number" value="0" min="0"></label><label>MP Cost<input id="${prefix}MpCost" type="number" value="0" min="0"></label><label class="wide">Extra Note<input id="${prefix}Note" placeholder="GM ruling, condition, duration, save DC, item used..."></label></div><div class="resource-action-buttons"><button class="primary" onclick="v1721ApplyAction('Cast Spell','${prefix}')">Cast Spell / Spend MP</button><button onclick="v1721ApplyAction('Use Talent','${prefix}')">Use Talent / Spend Resource</button><button onclick="v1721ApplyAction('Use Item','${prefix}')">Use Item</button><button onclick="v1721ApplyAction('General Action','${prefix}')">Log Action</button></div><h4>Recent Action History</h4><div id="${prefix}History" class="action-history-list"></div></section>`;
}
function v1721RenderActionHistory(){
  document.querySelectorAll('.action-history-list').forEach(host=>{host.innerHTML=(asteriaActionHistory||[]).slice(0,15).map(a=>`<div class="action-history-row"><div><b>${a.action||a.kind}</b><small>${a.time||''} • ${a.actor||''}${a.target?` → ${a.target}`:''}</small><span>${a.manual||a.note||'Tracked resource action'}</span></div><strong>${a.cost||''}</strong></div>`).join('')||'<p class="muted smallnote">No spell, talent, or item actions tracked yet.</p>';});
}
function v1721RemoveCombatUI(){
  document.querySelectorAll('#combatSystemPanel,#playerCombatSystemPanel,.manual-combat-entry,#combatEnemyCards,#combatSummaryDraft').forEach(el=>el.remove());
  document.querySelectorAll('.gm-system-btn').forEach(btn=>{const t=(btn.textContent||'').toLowerCase(); if(t.includes('dice control'))btn.remove();});
  document.querySelectorAll('.gm-menu-bar .gm-system-buttons,.gm-system-buttons').forEach(box=>{ if(!box.querySelector('[data-action-system]')){ const b=document.createElement('button'); b.className='gm-system-btn'; b.dataset.actionSystem='true'; b.onclick=()=>setGMSystemPanel?.('actions'); b.innerHTML='<b>Actions</b><small>Spells, talents, resources</small>'; box.prepend(b);} });
  if(Array.isArray(asteriaGMSystems)&&!asteriaGMSystems.find(s=>s.id==='actions')) asteriaGMSystems.unshift({id:'actions',label:'Actions',hint:'Spell, talent, item, and resource tracking'});
  if(asteriaGMActiveSystem==='dice') {asteriaGMActiveSystem='actions'; localStorage.setItem('asteriaGMActiveSystem','actions');}
}
function v1721InstallPlayerActions(){
  const host=document.querySelector('#player .dashboard-grid')||document.querySelector('#player .leftcol')||document.querySelector('#player'); if(!host)return;
  if(!document.getElementById('playerActionPanel')) host.appendChild(document.createRange().createContextualFragment(v1721PanelHtml('playerAction')));
}
function v1721InstallGMActions(){
  const panels=document.querySelector('#gm .gm-panels'); if(!panels)return;
  if(!document.getElementById('gmActionPanel')){ const frag=document.createRange().createContextualFragment(v1721PanelHtml('gmAction')); panels.prepend(frag); }
  const p=document.getElementById('gmActionPanel'); if(p)p.dataset.gmSystem='actions';
}
function v1721RelabelLogs(){
  document.querySelectorAll('h3,h4,p,small,b,button,span').forEach(el=>{ if(el.childNodes.length===1&&el.firstChild.nodeType===3){ el.textContent=el.textContent.replace(/Combat Log/g,'Action / Resource Log').replace(/Combat events/g,'Action events').replace(/Combat Tracker/g,'Resource Tracker').replace(/Combat System v1/g,'Resource Action Tracker'); }});
}
function v1721Refresh(){
  v1721RemoveCombatUI(); v1721InstallPlayerActions(); v1721InstallGMActions(); v1721RenderActionHistory(); v1721RelabelLogs();
  document.querySelectorAll('.version-badge').forEach(b=>b.textContent=ASTERIA_V1721_VERSION);
  applyGMSystemPanel?.();
}
// Disable combat state controls while leaving initiative/enemy/resource data available for reference if older code calls them.
['combatPrepare','combatStart','combatPause','combatEnd','combatLogged','combatGenerateSummary','combatAttack','combatDamage','playerCombatAction'].forEach(fn=>{window[fn]=function(){toast?.('Combat automation has been removed. Use the Resource Action Tracker.');v1721Refresh();};});
window.AsteriaViewHooks?.afterGMRender('resource-action-tracker', () => v1721Refresh());
window.AsteriaViewHooks?.afterPlayerLoad('resource-action-tracker', () => v1721Refresh());
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent=ASTERIA_V1721_VERSION;};
document.addEventListener('DOMContentLoaded',()=>setTimeout(v1721Refresh,1000));


/* =====================================================
   Asteria v1.7.2.3 — Full Website UI Identity Pass
   Integrated into existing Character Sheet / GM systems, no duplicate pages.
   ===================================================== */
const ASTERIA_V1722_VERSION='v1.7.2.3 • Data Sync Foundation';
const ASTERIA_MAGIC_TYPES_V1722={
  air:{label:'Air',cls:'magic-air',desc:'Pale Blue',spells:[['Gale Thread','3 MP','Air Magic'],['Feather Step','2 MP','Air Magic']]},
  earth:{label:'Earth',cls:'magic-earth',desc:'Green',spells:[['Stoneguard','4 MP','Earth Magic'],['Root Grip','5 MP','Earth Magic']]},
  fire:{label:'Fire',cls:'magic-fire',desc:'Red',spells:[['Ember Bolt','4 MP','Fire Magic'],['Cinder Ward','3 MP','Fire Magic']]},
  water:{label:'Water',cls:'magic-water',desc:'Blue',spells:[['Ripple Mend','4 MP','Water Magic'],['Tide Push','5 MP','Water Magic']]},
  life:{label:'Life',cls:'magic-life',desc:'Yellow',spells:[['Living Spark','5 MP','Life Magic']]},
  death:{label:'Death',cls:'magic-death',desc:'Purple',spells:[['Grave Whisper','5 MP','Death Magic']]},
  light:{label:'Light',cls:'magic-light',desc:'White',spells:[['Healing Light','6 MP','Light Magic'],['Radiant Mark','4 MP','Light Magic']]},
  dark:{label:'Dark',cls:'magic-dark',desc:'Black',spells:[['Shadow Veil','4 MP','Dark Magic']]},
  celestial:{label:'Celestial',cls:'magic-celestial',desc:'Luminous Gold',spells:[['Starfall Sigil','8 MP','Celestial Magic']]},
  infernal:{label:'Infernal',cls:'magic-infernal',desc:'Crimson Red',spells:[['Hellbrand','7 MP','Infernal Magic']]},
  blood:{label:'Blood',cls:'magic-blood',desc:'Deep Red',spells:[['Blood Rite','4 HP','Blood Magic'],['Vein Thread','3 HP','Blood Magic']]},
  chaos:{label:'Chaos',cls:'magic-chaos',desc:'Ashen Grey',spells:[['Fracture Pulse','7 MP','Chaos Magic']]},
  eldritch:{label:'Eldritch',cls:'magic-eldritch',desc:'Dark Emerald',spells:[['Void Needle','6 MP','Eldritch Magic']]},
  fae:{label:'Fae',cls:'magic-fae',desc:'Rose Pink',spells:[['Glamour Flicker','5 MP','Fae Magic']]},
  fate:{label:'Fate',cls:'magic-fate',desc:'Wine Red',spells:[['Thread Tug','6 MP','Fate Magic']]},
  space:{label:'Space',cls:'magic-space',desc:'Midnight Blue',spells:[['Step Between','8 MP','Space Magic']]},
  spirit:{label:'Spirit',cls:'magic-spirit',desc:'Silver White',spells:[['Soul Echo','5 MP','Spirit Magic']]},
  time:{label:'Time',cls:'magic-time',desc:'Bronze Gold',spells:[['Moment Slip','7 MP','Time Magic']]},
  abyssal:{label:'Abyssal',cls:'magic-abyssal',desc:'Obsidian Blue',spells:[['Deep Call','8 MP','Abyssal Magic']]}
};
let asteriaSpellTabV1722=localStorage.getItem('asteriaSpellTabV1722')||'all';
function v1722CurrentMagicAccess(){
  const c=(typeof v1721Actor==='function'?v1721Actor():null)||(chars&&chars[currentPlayerId?.()]);
  let access=c?.magicAccess||c?.spellTypes||c?.magics;
  if(typeof access==='string') access=access.split(',').map(x=>x.trim().toLowerCase());
  if(!Array.isArray(access)||!access.length) access=['light','water','blood','fate','eldritch'];
  return access.map(x=>String(x).toLowerCase().replace(/ magic/g,'')).filter(x=>ASTERIA_MAGIC_TYPES_V1722[x]);
}
function v1722SpellCards(){
  const access=v1722CurrentMagicAccess();
  const types=asteriaSpellTabV1722==='all'?access:access.filter(x=>x===asteriaSpellTabV1722);
  return types.flatMap(key=>(ASTERIA_MAGIC_TYPES_V1722[key].spells||[]).map(s=>({key,type:ASTERIA_MAGIC_TYPES_V1722[key],name:s[0],cost:s[1],school:s[2]})));
}
function v1722RenderSpellPanel(){
  const tabs=document.getElementById('spellTabsV1722'), list=document.getElementById('activeSpellListV1722');
  if(!tabs||!list)return;
  const access=v1722CurrentMagicAccess();
  if(asteriaSpellTabV1722!=='all'&&!access.includes(asteriaSpellTabV1722))asteriaSpellTabV1722='all';
  tabs.innerHTML=`<button class="spell-tab-v1722 ${asteriaSpellTabV1722==='all'?'active':''}" onclick="v1722SetSpellTab('all')">All</button>`+access.map(k=>`<button class="spell-tab-v1722 ${asteriaSpellTabV1722===k?'active':''}" onclick="v1722SetSpellTab('${k}')">${ASTERIA_MAGIC_TYPES_V1722[k].label}</button>`).join('');
  const cards=v1722SpellCards();
  list.innerHTML=cards.map(sp=>`<article class="spell-card-v1722 ${sp.type.cls}" onclick="v1722OpenSpell('${sp.name.replace(/'/g,"\\'")}')"><h4>${sp.name}</h4><p><b>${sp.school}</b></p><p>Cost: ${sp.cost}</p><small>${sp.type.desc}</small></article>`).join('')||'<p class="muted">No active spells assigned.</p>';
}
function v1722SetSpellTab(tab){asteriaSpellTabV1722=tab;localStorage.setItem('asteriaSpellTabV1722',tab);v1722RenderSpellPanel();}
function v1722OpenSpell(name){toast?.(`${name}: spell detail page hook ready.`);}
function v1722SlotIcon(slot){const icons={Head:'&#9682;',Shoulders:'&#9672;',Chest:'&#9818;',Hands:'&#10022;',Back:'&#9698;',Torso:'&#9673;',Waist:'&#9711;',Feet:'&#9699;'};return icons[slot]||'&#9638;';}
function v1722Slot(slot,item){return `<button class="inventory-slot-button ${item?'filled':''}" onclick="${item?`openItemPage('${item.id}')`:`toast('Empty slot: ${slot}')`}"><span class="slot-glyph">${v1722SlotIcon(slot)}</span><span class="slot-label">${slot}</span><b>${item?item.name:'Empty'}</b></button>`;}
function v1722EquippedByConfig(c,cfg){
  const slots=[cfg.slot,...(cfg.aliases||[])].filter(Boolean);
  for(const slot of slots){
    const item=equippedBySlot?.(c,slot);
    if(item)return item;
  }
  return null;
}
function v1722RenderDashboardEquipment(){
  const c=chars?.[currentPlayerId?.()]; if(!c)return; ensureWebInventory?.(currentPlayerId?.());
  const left=document.getElementById('dashboardArmorLeft'), right=document.getElementById('dashboardArmorRight'), weapons=document.getElementById('dashboardWeapons');
  const armorLeft=['Head','Chest','Hands','Feet']; const armorRight=['Back','Torso','Waist','Shoulders'];
  if(left)left.innerHTML=armorLeft.map(s=>v1722Slot(s,equippedBySlot?.(c,s))).join('');
  if(right)right.innerHTML=armorRight.map(s=>v1722Slot(s,equippedBySlot?.(c,s))).join('');
  if(weapons){
    const slots=[
      {slot:'Main Weapon',label:'Main Weapon',icon:'&#9876;',area:'main',aliases:['Main Hand']},
      {slot:'Secondary Weapon',label:'Secondary Weapon',icon:'&#10148;',area:'secondary',aliases:['Ranged']},
      {slot:'Off Weapon',label:'Off Weapon',icon:'&#9876;',area:'off',aliases:['Off Hand']},
      {slot:'Quiver',label:'Quiver',icon:'&#10142;',area:'quiver'},
      {slot:'Shield',label:'Shield',icon:'&#9960;',area:'shield'}
    ];
    const card=cfg=>{const item=v1722EquippedByConfig(c,cfg);return `<div class="weapon-card weapon-card-v1722 weapon-slot-${cfg.area} ${item?'filled':''}" onclick="${item?`openItemPage('${item.id}')`:`toast('Empty weapon slot: ${cfg.label}')`}"><span>${cfg.icon}</span><div><small>${cfg.label}</small><b>${item?item.name:'Empty'}</b></div></div>`;};
    weapons.className='dashboard-weapons weapon-layout-v1722';
    weapons.innerHTML=slots.map(card).join('');
  }
}
const ASTERIA_SKILL_RANK_NAMES=['Novice','Initiate','Apprentice','Journeyman','Adept','Master','Grandmaster'];
function skillRankName(rank){
  const n=Math.max(1,Math.min(ASTERIA_SKILL_RANK_NAMES.length,Number(rank)||1));
  return ASTERIA_SKILL_RANK_NAMES[n-1];
}
function skillCardIcon(name){
  const text=String(name||'').toLowerCase();
  if(text.includes('arch')||text.includes('bow'))return '&#10148;';
  if(text.includes('stealth')||text.includes('silent'))return '&#9680;';
  if(text.includes('survival')||text.includes('nature'))return '&#10048;';
  if(text.includes('perception')||text.includes('aware'))return '&#9673;';
  if(text.includes('arcana')||text.includes('magic'))return '&#10022;';
  return '&#9672;';
}
function renderDashboardSkills(id=currentPlayerId?.()){
  const host=document.querySelector('.skills-panel');
  const c=chars?.[id];
  if(!host||!c)return;
  const defaults=[
    {name:'Archery',rank:5},
    {name:'Stealth',rank:4},
    {name:'Survival',rank:3},
    {name:'Perception',rank:4}
  ];
  const raw=Array.isArray(c.skills)?c.skills:defaults;
  const skills=raw.map(skill=>typeof skill==='string'?{name:skill,rank:1}:skill);
  host.innerHTML=`<h3>Skills</h3><div class="dashboard-skill-card-list">${skills.map(skill=>{
    const rank=Number(skill.rank||skill.level||1);
    const rankName=skill.rankName||skillRankName(rank);
    const cls=String(rankName).toLowerCase().replace(/[^a-z0-9]+/g,'-');
    return `<article class="dashboard-skill-card rank-${cls}"><div class="skill-card-icon" aria-hidden="true">${skillCardIcon(skill.name)}</div><div><b>${skill.name}</b><span>${rankName}</span><small>Rank ${rank}</small></div></article>`;
  }).join('')}</div>`;
}
function playerRecoveryAction(kind){
  const id=currentPlayerId?.();
  const c=chars?.[id];
  if(!c)return;
  const config={
    short:{label:'Short Rest',hp:.25,sp:.5,mp:.25},
    long:{label:'Long Rest',hp:1,sp:1,mp:1},
    recover:{label:'Recovery',hp:.1,sp:.25,mp:.25}
  }[kind]||{label:'Recovery',hp:.1,sp:.25,mp:.25};
  ['hp','sp','mp'].forEach(key=>{
    const max=c[key]?.[1]||0;
    const gain=Math.max(1,Math.round(max*config[key]));
    c[key][0]=Math.min(max,(c[key][0]||0)+gain);
  });
  saveAsteriaState?.();
  addCombatLog?.(`${c.name} used ${config.label}.`);
  loadPlayer?.(id);
  toast?.(`${config.label} applied.`);
}
function v1722SplitTalents(){
  const classList=document.getElementById('classTalentsList'), racialList=document.getElementById('racialTraitsList');
  if(classList&&typeof renderUnlockedTalentSummary==='function')renderUnlockedTalentSummary(currentPlayerId?.());
  if(racialList&&!racialList.dataset.v1722){racialList.dataset.v1722='true';racialList.innerHTML=`<article><b>Fleet Footed</b><p>Increases movement speed by 10%.</p></article><article><b>Pixie Soul Bond</b><p>Racial soul-link trait reference. Full rule page hook ready.</p></article>`;}
}
function movePlayerPanel(selector,targetSelector){
  const panel=document.querySelector(selector), target=document.querySelector(targetSelector);
  if(panel&&target&&!target.contains(panel))target.appendChild(panel);
}
function renderCharacterTabProfile(id=currentPlayerId?.()){
  const c=chars?.[id]; if(!c)return;
  const race=document.getElementById('characterTabRace'), klass=document.getElementById('characterTabClass');
  if(race)race.textContent=c.race||'Race pending';
  if(klass)klass.textContent=`${c.klass||'Class pending'} - Level ${c.level||0}`;
}
function normalizePlayerDashboardLayout(){
  movePlayerPanel('.racial-traits-panel','#characterTraitsDock');
  movePlayerPanel('.skills-panel','#overview .player-dashboard-grid');
  movePlayerPanel('.spell-panel-v1722','#overview .player-dashboard-grid');
  movePlayerPanel('#playerPartyLootPanel','#partyLootDock');
  renderCharacterTabProfile(currentPlayerId?.());
  if(typeof renderUnlockedTalentSummary==='function')renderUnlockedTalentSummary(currentPlayerId?.());
  renderDashboardSkills(currentPlayerId?.());
}
function v1722RemoveDashboardActionClutter(){
  document.querySelectorAll('#combatTargetBox,#v170RestPanel,.combat-target-box').forEach(el=>el.remove());
}
function v1722CleanupUI(){
  document.querySelectorAll('#player .resource-action-panel,#playerActionPanel').forEach(el=>el.remove());
  document.querySelectorAll('.gm-system-btn').forEach(btn=>{const t=(btn.textContent||'').toLowerCase(); if(t.includes('dice control'))btn.remove();});
  if(Array.isArray(asteriaGMSystems)){ for(let i=asteriaGMSystems.length-1;i>=0;i--){ if(asteriaGMSystems[i].id==='dice') asteriaGMSystems.splice(i,1); } }
  document.querySelectorAll('.version-badge').forEach(b=>b.textContent=ASTERIA_V1722_VERSION);
  const nav=[...document.querySelectorAll('a,button,span,b')].find(e=>(e.textContent||'').includes('v1.7.2.1')); if(nav)nav.textContent=nav.textContent.replace('v1.7.2.1','v1.7.2.3');
  v1722RemoveDashboardActionClutter();
  v1722SplitTalents(); v1722RenderSpellPanel(); v1722RenderDashboardEquipment(); normalizePlayerDashboardLayout();
}
// Override older render hooks cleanly.
renderDashboardEquipment=v1722RenderDashboardEquipment;
renderTargetSelector=function(){v1722RemoveDashboardActionClutter();};
v170InjectRestPanel=function(){v1722RemoveDashboardActionClutter();};
window.AsteriaViewHooks?.afterPlayerLoad('dashboard-equipment-cleanup', () => v1722CleanupUI());
window.AsteriaViewHooks?.afterGMRender('dashboard-equipment-cleanup', () => v1722CleanupUI());
window.AsteriaViewHooks?.afterView('dashboard-equipment-cleanup', null, id => {if(id!=='gm'&&id!=='player')v1722CleanupUI();});
buildVersionBadge=function(){const b=document.querySelector('.version-badge');if(b)b.textContent=ASTERIA_V1722_VERSION;};
document.addEventListener('DOMContentLoaded',()=>setTimeout(v1722CleanupUI,700));

/* =========================
   v1.7.2.5 XP Distribution + Level Progression System v1
   Integrated into existing GM Panel, Character Sheet, Player Dashboard, Session Log, Campaign State.
   ========================= */
const ASTERIA_XP_SYSTEM_VERSION='XP Distribution + Level Progression System v1';
function xpPartyIds(){return (campaigns?.[activeCampaign]?.party||[]).filter(id=>chars[id]);}
function xpLevelPreview(id,award){
  const c=chars[id]; if(!c) return {level:0,xp:0,leveled:false,levels:0,carry:0};
  let level=Number(c.level||0), xp=Number(c.xp||0)+Number(award||0), levels=0;
  while(level<100 && xp>=xpToNextLevel(level)){xp-=xpToNextLevel(level);level++;levels++;}
  return {level,xp,leveled:levels>0,levels,carry:xp};
}
function xpAdjustedTotal(){
  const base=Math.max(0,Number(document.getElementById('campaignXPAmount')?.value||0));
  const mod=Number(document.getElementById('xpGlobalModifier')?.value||0);
  return Math.max(0,Math.floor(base*(1+(mod/100))));
}
function xpAwardsForCurrentPanel(){
  const ids=xpPartyIds();
  const mode=document.getElementById('xpDistributionMode')?.value||'equal';
  const total=xpAdjustedTotal();
  const awards={}; ids.forEach(id=>awards[id]=0);
  if(mode==='milestone') return awards;
  if(mode==='manual'){
    ids.forEach(id=>awards[id]=Math.max(0,Number(document.getElementById('manualXP_'+id)?.value||0)));
    return awards;
  }
  const active=ids.filter(id=>mode!=='selected'||document.getElementById('includeXP_'+id)?.checked);
  if(!active.length) return awards;
  if(mode==='weighted'){
    const weights=active.map(id=>Math.max(1,Number(chars[id].level||0)+1));
    const totalWeight=weights.reduce((a,b)=>a+b,0)||1;
    let used=0;
    active.forEach((id,i)=>{const val=i===active.length-1?total-used:Math.floor(total*weights[i]/totalWeight);awards[id]=Math.max(0,val);used+=val;});
    return awards;
  }
  const share=Math.floor(total/active.length); let rem=total%active.length;
  active.forEach(id=>{awards[id]=share+(rem>0?1:0); if(rem>0)rem--;});
  return awards;
}
function xpSummaryForCampaign(){
  const ids=xpPartyIds();
  const awards=xpAwardsForCurrentPanel();
  const mode=document.getElementById('xpDistributionMode')?.value||'equal';
  return ids.map(id=>{
    const c=chars[id], award=awards[id]||0, pv=xpLevelPreview(id,award);
    const manual=mode==='manual'?`<input id="manualXP_${id}" type="number" min="0" value="${award||0}" oninput="updateXPSplitPreview()">`:`<span class="xp-result">+${award.toLocaleString()} XP</span>`;
    return `<div class="xp-award-row">
      <input type="checkbox" id="includeXP_${id}" ${mode==='selected'?'':'checked'} onchange="updateXPSplitPreview()">
      <div><b>${c.name}</b><small>Level ${c.level} • ${(c.xp||0).toLocaleString()} / ${(c.xpMax||xpToNextLevel(c.level)).toLocaleString()} XP</small></div>
      <span class="hide-sm">CP ${c.cp||0}</span><span class="hide-sm">TP ${c.tp||0}</span>
      ${manual}
      <span class="level-preview">${pv.leveled?`Level ${pv.level} • carry ${pv.carry.toLocaleString()}`:'No level-up'}</span>
    </div>`;
  }).join('')||'<p class="muted">No party members in this campaign.</p>';
}
function updateXPSplitPreview(){
  const mode=document.getElementById('xpDistributionMode')?.value||'equal';
  const source=document.getElementById('xpSourceType')?.value||'XP Award';
  const total=xpAdjustedTotal();
  const awards=xpAwardsForCurrentPanel();
  const ids=xpPartyIds();
  if(document.getElementById('xpSplitPartyList')) document.getElementById('xpSplitPartyList').innerHTML=xpSummaryForCampaign();
  const recipients=ids.filter(id=>(awards[id]||0)>0).length;
  const line=mode==='milestone'?`${source}: milestone recorded. No XP applied.`:`${source}: ${total.toLocaleString()} adjusted XP prepared for ${recipients} recipient${recipients===1?'':'s'} using ${mode.replace('-', ' ')} distribution.`;
  if(document.getElementById('campaignXPSplitPreview')) document.getElementById('campaignXPSplitPreview').textContent=line;
  previewXPAwardMarkdown(false);
}
function previewXPAwardMarkdown(showToast=true){
  const source=document.getElementById('xpSourceType')?.value||'XP Award';
  const reason=document.getElementById('xpAwardReason')?.value||'No reason recorded';
  const mode=document.getElementById('xpDistributionMode')?.value||'equal';
  const vis=document.getElementById('xpVisibility')?.value||'Public';
  const awards=xpAwardsForCurrentPanel();
  const lines=[];
  lines.push(`## XP Award — ${source}`);
  lines.push(`- Reason: ${reason}`);
  lines.push(`- Distribution: ${mode}`);
  lines.push(`- Visibility: ${vis}`);
  lines.push(`- Adjusted Total: ${xpAdjustedTotal().toLocaleString()} XP`);
  lines.push('');
  xpPartyIds().forEach(id=>{const c=chars[id], award=awards[id]||0, pv=xpLevelPreview(id,award); if(award>0||mode==='milestone') lines.push(`- ${c.name}: +${award.toLocaleString()} XP${pv.leveled?` → Level ${pv.level}, carryover ${pv.carry.toLocaleString()} XP`:''}`);});
  const out=lines.join('\n');
  if(document.getElementById('xpAwardLogPreview')) document.getElementById('xpAwardLogPreview').value=out;
  if(showToast) toast('XP award preview generated.');
  return out;
}
function distributeCampaignXP(){
  ensureProgressionData?.();
  const mode=document.getElementById('xpDistributionMode')?.value||'equal';
  const source=document.getElementById('xpSourceType')?.value||'XP Award';
  const reason=document.getElementById('xpAwardReason')?.value||'No reason recorded';
  const visibility=document.getElementById('xpVisibility')?.value||'Public';
  if(mode==='milestone'){
    const msg=`Milestone recorded: ${source} — ${reason}`;
    addCombatLog?.(msg,'important'); slEvent?.('XP awards',msg,{source,reason,mode},visibility); previewXPAwardMarkdown(false); saveAsteriaState?.(); toast('Milestone XP entry logged.'); return;
  }
  const awards=xpAwardsForCurrentPanel();
  const results=[];
  xpPartyIds().forEach(id=>{
    const add=Math.max(0,Number(awards[id]||0)); if(!add) return;
    const c=chars[id]; const before={level:c.level,xp:c.xp,cp:c.cp||0,tp:c.tp||0};
    adjustCharacterResource(id,'xp',add);
    const after={level:c.level,xp:c.xp,cp:c.cp||0,tp:c.tp||0};
    results.push(`${c.name} +${add.toLocaleString()} XP${after.level>before.level?` → Level ${after.level}`:''}`);
    slEvent?.('XP awards',`${c.name} received ${add.toLocaleString()} XP from ${source}.`,{source,reason,award:add,before,after,carryover:c.xp,splitXP:add},visibility);
    if(after.level>before.level) slEvent?.('Level-ups',`${c.name} levelled from ${before.level} to ${after.level}. Carryover XP: ${c.xp.toLocaleString()}.`,{source,from:before.level,to:after.level,carryover:c.xp,cp:c.cp,tp:c.tp},visibility);
  });
  if(!results.length){toast('No XP recipients selected.');return;}
  const msg=`GM awarded XP (${source}): ${results.join('; ')}. Reason: ${reason}`;
  addCombatLog?.(msg,'important');
  feedback?.(`XP Award Applied: ${results.length} character${results.length===1?'':'s'}`,'level');
  previewXPAwardMarkdown(false); saveAsteriaState?.(); saveAccountState?.(); refreshSyncedViews?.(); syncAfterResourceChange?.(selected); renderXPSplitPanel(); renderGM?.(); toast('XP applied and synced.');
}
function clearXPManualInputs(){xpPartyIds().forEach(id=>{const el=document.getElementById('manualXP_'+id); if(el)el.value=0;}); updateXPSplitPreview();}
function renderXPSplitPanel(){ if(document.getElementById('xpSplitPartyList')) document.getElementById('xpSplitPartyList').innerHTML=xpSummaryForCampaign(); updateXPSplitPreview(); }
(function(){
  window.AsteriaViewHooks?.afterGMRender('xp-distribution-panel-v1725', () => renderXPSplitPanel());
  const oldBadge=buildVersionBadge; buildVersionBadge=function(){ oldBadge?.(); const b=document.querySelector('.version-badge'); if(b)b.textContent='v1.7.2.5 • XP Distribution + Level Progression'; };
  document.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{renderXPSplitPanel(); buildVersionBadge();},100));
})();

/* =========================
   v1.7.2.6 Notification + Sound System v1
   Integrated into Player Dashboard, GM Panel, XP, Session Log, Inventory-ready hooks
========================= */
(function(){
  const STORAGE_KEY='asteriaNotificationSettingsV1';
  const defaultSettings={muted:false,volume:0.45,majorSounds:true,position:'bottom-right'};
  function loadSettings(){try{return Object.assign({},defaultSettings,JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'));}catch(e){return {...defaultSettings};}}
  function saveSettings(s){localStorage.setItem(STORAGE_KEY,JSON.stringify(s));}
  window.asteriaNotificationSettings=loadSettings();
  window.asteriaNotifications=window.asteriaNotifications||[];
  function ensureRoot(){
    let root=document.getElementById('asteriaNotificationRoot');
    if(!root){root=document.createElement('div');root.id='asteriaNotificationRoot';root.className='asteria-notification-root';root.innerHTML='<div id="asteriaNotificationStack" class="asteria-notification-stack"></div>';document.body.appendChild(root);}
    const stack=document.getElementById('asteriaNotificationStack');
    if(stack){stack.classList.toggle('bottom-centre',window.asteriaNotificationSettings.position==='bottom-centre');}
    return root;
  }
  function tone(kind='chime'){
    const s=window.asteriaNotificationSettings||defaultSettings;
    if(s.muted || (kind==='level'&&!s.majorSounds)) return;
    try{
      const AudioCtx=window.AudioContext||window.webkitAudioContext; if(!AudioCtx) return;
      const ctx=new AudioCtx(); const vol=Math.max(0,Math.min(1,Number(s.volume??.45)));
      const now=ctx.currentTime;
      const master=ctx.createGain(); master.gain.setValueAtTime(0.0001,now); master.gain.exponentialRampToValueAtTime(0.18*vol,now+.02); master.gain.exponentialRampToValueAtTime(0.0001,now+(kind==='level'?1.35:.55)); master.connect(ctx.destination);
      const patterns={xp:[880,1320],coin:[1200,1600],quest:[660,880,990],warning:[110,82],level:[523,659,784,1046],item:[740,980],rest:[392,523,659]};
      const freqs=patterns[kind]||patterns.xp;
      freqs.forEach((f,i)=>{const o=ctx.createOscillator();const g=ctx.createGain();o.type=(kind==='warning')?'sawtooth':(kind==='level'?'triangle':'sine');o.frequency.setValueAtTime(f,now+i*.14);g.gain.setValueAtTime(0.0001,now+i*.14);g.gain.exponentialRampToValueAtTime(0.35*vol,now+i*.14+.025);g.gain.exponentialRampToValueAtTime(0.0001,now+i*.14+(kind==='level'?.38:.18));o.connect(g);g.connect(master);o.start(now+i*.14);o.stop(now+i*.14+(kind==='level'?.45:.24));});
      setTimeout(()=>ctx.close?.(),1800);
    }catch(e){}
  }
  function shouldShowToCurrentUser(n){
    if(!n) return false;
    if(n.visibility==='GM-only' && window.session?.role!=='gm') return false;
    if(n.visibility==='Hidden until revealed' && window.session?.role!=='gm' && !n.revealed) return false;
    if(n.targetPlayer && window.session?.role==='player' && window.session?.character!==n.targetPlayer) return false;
    return true;
  }
  window.asteriaNotify=function(opts={}){
    ensureRoot();
    const n=Object.assign({level:'small',title:'Asteria',message:'',type:'info',visibility:'Public',important:false,autoClose:true,sound:'xp',sessionLog:false,partyWide:false,targetPlayer:null,revealed:false},opts);
    if(n.level==='major') n.autoClose=false;
    n.id='notify_'+Date.now()+'_'+Math.random().toString(36).slice(2,7); n.time=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
    window.asteriaNotifications.unshift(n); window.asteriaNotifications=window.asteriaNotifications.slice(0,80);
    if(n.sessionLog && typeof slEvent==='function') slEvent('Notifications',`${n.title}: ${n.message}`,{level:n.level,type:n.type,visibility:n.visibility,targetPlayer:n.targetPlayer||'',partyWide:!!n.partyWide},n.visibility||'Public');
    if(n.important && typeof addCombatLog==='function') addCombatLog(`Notification: ${n.title} — ${n.message}`,'important');
    if(!shouldShowToCurrentUser(n)) return n;
    const iconMap={xp:'✦',coin:'◈',item:'◆',quest:'📜',level:'⚜',warning:'⚠',rest:'☾',info:'✧',map:'◇'};
    const stack=document.getElementById('asteriaNotificationStack');
    const root=document.getElementById('asteriaNotificationRoot');
    const el=document.createElement('div');
    el.className=`asteria-notification ${n.level} ${n.type||''} ${n.level==='major'?'level-up':''}`;
    el.dataset.notifyId=n.id;
    el.innerHTML=`<div class="notify-head"><span class="notify-icon">${iconMap[n.type]||iconMap.info}</span><div><div class="notify-title">${n.title}</div><span class="notify-chip">${n.level}</span> ${n.visibility!=='Public'?`<span class="notify-chip">${n.visibility}</span>`:''}</div>${n.level==='major'||n.important?'<button class="notify-close" aria-label="Close notification">×</button>':''}</div><div class="notify-body">${n.message||''}</div>`;
    const close=()=>{el.remove();}; el.querySelector('.notify-close')?.addEventListener('click',close);
    if(n.level==='major') root.appendChild(el); else stack.appendChild(el);
    tone(n.sound||n.type||'xp');
    if(n.autoClose!==false && n.level!=='major') setTimeout(close,n.level==='medium'?6200:3600);
    return n;
  };
  window.closeAsteriaNotification=function(id){document.querySelector(`[data-notify-id="${id}"]`)?.remove();};
  window.updateNotificationSettings=function(){
    const s=window.asteriaNotificationSettings;
    s.muted=!!document.getElementById('notifyMute')?.checked;
    s.majorSounds=!!document.getElementById('notifyMajorSounds')?.checked;
    s.volume=Number(document.getElementById('notifyVolume')?.value||s.volume||.45);
    s.position=document.getElementById('notifyPosition')?.value||s.position||'bottom-right';
    saveSettings(s); ensureRoot();
    asteriaNotify({level:'small',title:'Notification settings saved',message:`Volume ${Math.round(s.volume*100)}%`,type:'info',sound:'chime'});
  };
  window.demoAsteriaNotification=function(level,type){
    const map={small:['XP Received','+250 XP added to your character.'],medium:['Quest Updated','The party made major progress on a quest.'],major:['Level Up!','A character has reached a new level. Close this notification manually.']};
    const m=map[level]||map.small; asteriaNotify({level,title:m[0],message:m[1],type:type||level,sound:type==='level'?'level':type,important:level==='major',sessionLog:level!=='small'});
  };
  function injectSettingsPanel(){
    const gm=document.querySelector('#gm .gm-main .gm-panels')||document.querySelector('#gm .gm-main'); if(!gm||document.getElementById('notificationSettingsPanel')) return;
    const s=window.asteriaNotificationSettings;
    const panel=document.createElement('section'); panel.className='card notification-settings-panel'; panel.id='notificationSettingsPanel';
    panel.innerHTML=`<div class="section-head mini"><div><p class="eyebrow">Website System</p><h3>Notification + Sound System</h3></div><span class="pill">v1.7.2.6</span></div><p class="muted smallnote">Integrated notifications for XP, level-ups, quests, warnings, rewards, rests, inventory, map hooks, and session log events.</p><div class="notification-settings-grid"><label>Mute Sounds<input id="notifyMute" type="checkbox" ${s.muted?'checked':''}></label><label>Volume<input id="notifyVolume" type="range" min="0" max="1" step="0.05" value="${s.volume}"></label><label>Major Sounds<input id="notifyMajorSounds" type="checkbox" ${s.majorSounds?'checked':''}></label><label>Position<select id="notifyPosition"><option value="bottom-right" ${s.position==='bottom-right'?'selected':''}>Bottom Right</option><option value="bottom-centre" ${s.position==='bottom-centre'?'selected':''}>Bottom Centre</option></select></label><button onclick="updateNotificationSettings()">Save Sound Settings</button></div><div class="notification-demo-row"><button onclick="demoAsteriaNotification('small','xp')">Test XP</button><button onclick="demoAsteriaNotification('medium','quest')">Test Quest</button><button onclick="demoAsteriaNotification('major','level')">Test Level Up</button><button onclick="demoAsteriaNotification('medium','warning')">Test Warning</button></div>`;
    gm.appendChild(panel);
  }
  const oldToast=window.toast; if(typeof oldToast==='function'){window.toast=function(msg){oldToast(msg);};}
  const oldCheck=window.checkLevelUp; if(typeof oldCheck==='function'){
    window.checkLevelUp=function(id){const c=chars[id]; const before=c?c.level:0; oldCheck(id); const after=c?c.level:before; if(c&&after>before){asteriaNotify({level:'major',title:`Level Up: ${c.name}`,message:`${c.name} reached Level ${after}. CP and TP rewards have been applied.`,type:'level',sound:'level',important:true,sessionLog:true,partyWide:true,targetPlayer:id});}};
  }
  const oldAdjust=window.adjustCharacterResource; if(typeof oldAdjust==='function'){
    window.adjustCharacterResource=function(id,key,amount){const c=chars[id]; const before=key==='xp'?(c?.xp||0):(c?.[key]?.[0]||0); oldAdjust(id,key,amount); const after=key==='xp'?(c?.xp||0):(c?.[key]?.[0]||0); const diff=after-before; if(!c||!diff) return; if(key==='xp'&&diff>0){asteriaNotify({level:'small',title:'XP Received',message:`${c.name} received +${diff.toLocaleString()} XP.`,type:'xp',sound:'xp',targetPlayer:id,sessionLog:false});} else if(['hp','sp','mp'].includes(key)){asteriaNotify({level:'small',title:`${key.toUpperCase()} Updated`,message:`${c.name}: ${before} → ${after}.`,type:diff<0?'warning':'info',sound:diff<0?'warning':'rest',targetPlayer:id,sessionLog:false});}}
  }
  const oldDistribute=window.distributeCampaignXP; if(typeof oldDistribute==='function'){
    window.distributeCampaignXP=function(){const total=Number(document.getElementById('campaignXPAmount')?.value||0); oldDistribute(); if(total>0) asteriaNotify({level:'small',title:'Party XP Awarded',message:`${total.toLocaleString()} XP processed through the GM XP panel.`,type:'xp',sound:'xp',partyWide:true,sessionLog:true});};
  }
  const oldUseItem=window.useInventoryItem; if(typeof oldUseItem==='function'){
    window.useInventoryItem=function(itemId){const c=chars[currentPlayerId?.()||selected]; const item=c?.inventory?.find(x=>x.id===itemId); oldUseItem(itemId); if(item) asteriaNotify({level:'small',title:'Item Used',message:`${c.name} used ${item.name}.`,type:'item',sound:'item',targetPlayer:currentPlayerId?.()||selected,sessionLog:true});};
  }
  const oldStart=window.startSession; if(typeof oldStart==='function') window.startSession=function(){oldStart();asteriaNotify({level:'medium',title:'Session Started',message:'Automatic session logging is active.',type:'info',sound:'quest',visibility:'GM-only',sessionLog:true});};
  const oldEnd=window.endSession; if(typeof oldEnd==='function') window.endSession=function(){oldEnd();asteriaNotify({level:'medium',title:'Session Ended',message:'Session draft generated for GM review.',type:'quest',sound:'quest',visibility:'GM-only',important:true,sessionLog:true});};
  const oldArchive=window.archiveSessionLog; if(typeof oldArchive==='function') window.archiveSessionLog=function(){oldArchive();asteriaNotify({level:'medium',title:'Session Archived',message:'The session log has been archived.',type:'quest',sound:'quest',visibility:'GM-only',sessionLog:true});};
  document.addEventListener('DOMContentLoaded',()=>{ensureRoot(); setTimeout(injectSettingsPanel,250); window.AsteriaViewHooks?.afterGMRender('notification-settings-panel',()=>setTimeout(injectSettingsPanel,50)); const oldBadge=window.buildVersionBadge; if(typeof oldBadge==='function'){window.buildVersionBadge=function(){oldBadge(); const b=document.querySelector('.version-badge'); if(b)b.textContent='v1.7.2.6 - Notification + Sound System';}; window.buildVersionBadge();}});
})();

/* =============================================================
   v1.7.2.7 Party Loot + Unified Transaction Pipeline v1
   Integrated into existing Asteria website systems. No standalone app.
   ============================================================= */
(function(){
  const VERSION='v1.7.2.7 • Party Loot + Unified Transaction Pipeline';
  const storeKey='asteriaTransactionPipelineV1';
  const currencyTypes=['copper','silver','gold','platinumCrown','royalCrown','royalPlatinum'];
  const currencyLabels={copper:'Copper / Pennies',silver:'Silver / Marks',gold:'Gold / Crowns',platinumCrown:'Platinum Crown',royalCrown:'Royal Crown',royalPlatinum:'Royal Platinum'};
  const defaultState={transactions:[],partyLoot:[],approvalQueue:[],unsortedLoot:{},settings:{gmApprovalRare:true,autoConvert:false,publicPartyLoot:true}};
  function clone(x){return JSON.parse(JSON.stringify(x));}
  function readState(){try{return Object.assign(clone(defaultState),JSON.parse(localStorage.getItem(storeKey)||'{}'));}catch(e){return clone(defaultState);}}
  function writeState(s){localStorage.setItem(storeKey,JSON.stringify(s)); if(typeof saveAsteriaState==='function') saveAsteriaState();}
  function currentId(){try{return currentPlayerId?.()||selected||Object.keys(chars||{})[0];}catch(e){return selected||'kael';}}
  function charById(id){return (window.chars||chars||{})[id||currentId()];}
  function nowStamp(){return new Date().toISOString();}
  function uid(prefix='tx'){return prefix+'_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);}
  function notify(level,title,message,type='item',opts={}){ if(typeof asteriaNotify==='function') asteriaNotify(Object.assign({level,title,message,type,sound:type,sessionLog:level!=='small'},opts)); else if(typeof toast==='function') toast(title+': '+message); }
  function logSession(text,data={},visibility='Public'){
    if(typeof slEvent==='function') slEvent('Transactions',text,data,visibility);
    else if(typeof addCombatLog==='function') addCombatLog(text, data?.important?'important':'');
  }
  function ensureCurrency(c){ if(!c.currency)c.currency={copper:0,silver:0,gold:0,platinumCrown:0,royalCrown:0,royalPlatinum:0}; currencyTypes.forEach(k=>{if(c.currency[k]===undefined)c.currency[k]=0;}); return c.currency; }
  function ensureLootContainers(c,id){ if(!c.inventory)c.inventory=[]; if(!c.unsortedLoot)c.unsortedLoot=[]; const state=readState(); if(!state.unsortedLoot[id]) state.unsortedLoot[id]=[]; writeState(state); return c; }
  function compendiumItem(itemId){
    const db=window.itemDatabase||{};
    const item=db[itemId]||{};
    return Object.assign({id:itemId||uid('item'),name:item.name||itemId||'Unknown Item',type:item.type||'Item',qty:item.qty||1,desc:item.desc||item.description||'Compendium-linked item snapshot.',value:item.value||0,weight:item.weight||0,tags:item.tags||[],version:item.version||'compendium-current',sourcePage:item.sourcePage||`content/Items/${item.name||itemId||'Unknown Item'}.md`},item);
  }
  function snapshotItem(itemRef,source='Transaction'){
    const base=typeof itemRef==='string'?compendiumItem(itemRef):Object.assign(compendiumItem(itemRef?.id||itemRef?.name),itemRef||{});
    return Object.assign({},base,{snapshotId:uid('itemSnap'),snapshotVersion:base.version||'compendium-current',sourcePage:base.sourcePage||'Compendium Item Page',source,receivedAt:nowStamp(),gmOnly:!!base.gmOnly,hidden:!!base.hidden,cursed:!!base.cursed,questItem:!!base.questItem});
  }
  function itemRarity(item){const tags=(item.tags||[]).join(' ').toLowerCase(); const name=(item.rarity||'').toLowerCase(); return name||(/legendary|relic|story/.test(tags)?'legendary':/rare/.test(tags)?'rare':'common');}
  function notificationForTransaction(tx){
    const rare=(tx.items||[]).some(i=>['rare','legendary','relic','story'].includes(itemRarity(i)));
    const legendary=(tx.items||[]).some(i=>['legendary','relic','story'].includes(itemRarity(i)));
    const level=legendary?'major':rare?'medium':'small';
    const type=tx.type==='purchase'||tx.type==='currency'?'coin':'item';
    const title=tx.type==='purchase'?'Purchase Complete':tx.type==='sale'?'Sale Complete':tx.type==='questReward'?'Quest Reward':tx.type==='service'?'Service Purchased':tx.type==='claimApproved'?'Claim Approved':'Transaction Logged';
    notify(level,title,tx.summary||`${tx.source||'Reward'} processed.`,type,{targetPlayer:tx.playerId||null,partyWide:tx.partyWide||false,visibility:tx.visibility||'Public',important:level==='major'});
  }
  function hasCurrency(c,cost={}){const cur=ensureCurrency(c); return currencyTypes.every(k=>(cur[k]||0)>=(Number(cost[k]||0)));}
  function addCurrency(c,amounts={}){const cur=ensureCurrency(c); currencyTypes.forEach(k=>cur[k]=Math.max(0,Number(cur[k]||0)+Number(amounts[k]||0))); return cur;}
  function removeCurrency(c,amounts={}){ if(!hasCurrency(c,amounts)) return false; const cur=ensureCurrency(c); currencyTypes.forEach(k=>cur[k]=Math.max(0,Number(cur[k]||0)-Number(amounts[k]||0))); return true; }
  function addToInventoryOrLoot(playerId,item,preferred='inventory'){
    const c=charById(playerId); if(!c) return {ok:false,location:'missing-character'}; ensureLootContainers(c,playerId);
    const capacity=Number(c.inventoryCapacity||30); const full=(c.inventory||[]).length>=capacity;
    if(preferred==='partyLoot' || full){ const state=readState(); state.partyLoot.unshift({lootId:uid('loot'),item,source:item.source||'Transaction',dateGained:nowStamp(),status:'Unclaimed',visibility:item.gmOnly?'GM-only':'Public',requestedBy:null}); writeState(state); if(full) notify('medium','Inventory Full',`${c.name}'s inventory is full. ${item.name} was sent to Party Loot.`,'warning',{targetPlayer:playerId}); return {ok:true,location:'partyLoot'}; }
    c.inventory.push(item); return {ok:true,location:'inventory'};
  }
  function createTransaction(input={}){
    const state=readState();
    const tx=Object.assign({id:uid('tx'),timestamp:nowStamp(),type:'reward',source:'GM Manual Reward',playerId:currentId(),character:'',items:[],currency:{},cost:{},service:null,status:'Pending',visibility:'Public',gmApprovalRequired:false,gmApproved:false,gmOverride:false,summary:'',notes:''},input);
    const c=charById(tx.playerId); if(c) tx.character=c.name;
    tx.items=(tx.items||[]).map(i=>i.snapshotId?i:snapshotItem(i,tx.source));
    const needsApproval=tx.gmApprovalRequired || (readState().settings.gmApprovalRare && tx.items.some(i=>['rare','legendary','relic','story'].includes(itemRarity(i))));
    tx.gmApprovalRequired=needsApproval;
    if(needsApproval && !tx.gmApproved){ tx.status='Awaiting GM Approval'; state.approvalQueue.unshift(tx); state.transactions.unshift(tx); writeState(state); notify('medium','GM Approval Required',tx.summary||`${tx.character||'Player'} has a transaction awaiting GM approval.`,'warning',{visibility:'GM-only',important:true}); renderTransactionPanels(); return tx; }
    return applyTransaction(tx);
  }
  function applyTransaction(tx){
    const state=readState(); const c=charById(tx.playerId); if(!c && !tx.partyWide){tx.status='Failed: Missing character'; state.transactions.unshift(tx); writeState(state); renderTransactionPanels(); return tx;}
    if(c){ensureLootContainers(c,tx.playerId);}
    if(tx.type==='purchase'||tx.cost&&Object.values(tx.cost).some(Number)){ if(c&&!removeCurrency(c,tx.cost)){tx.status='Failed: Insufficient Currency'; state.transactions.unshift(tx); writeState(state); notify('medium','Purchase Failed','Not enough currency for this transaction.','warning',{targetPlayer:tx.playerId}); renderTransactionPanels(); return tx;} }
    if(tx.currency&&Object.values(tx.currency).some(Number)){ if(c)addCurrency(c,tx.currency); else {state.partyCurrency=state.partyCurrency||{}; currencyTypes.forEach(k=>state.partyCurrency[k]=Number(state.partyCurrency[k]||0)+Number(tx.currency[k]||0));} }
    (tx.items||[]).forEach(item=>{ if(tx.partyWide || !c) state.partyLoot.unshift({lootId:uid('loot'),item,source:tx.source,dateGained:nowStamp(),status:'Unclaimed',visibility:item.gmOnly?'GM-only':'Public',requestedBy:null}); else addToInventoryOrLoot(tx.playerId,item,tx.destination||'inventory'); });
    tx.status='Applied'; tx.appliedAt=nowStamp(); state.transactions.unshift(tx); state.approvalQueue=state.approvalQueue.filter(x=>x.id!==tx.id); writeState(state);
    notificationForTransaction(tx); logSession(`${tx.character||'Party'} transaction: ${tx.summary||tx.source}`,{transactionId:tx.id,source:tx.source,items:(tx.items||[]).map(i=>i.name).join(', '),currency:JSON.stringify(tx.currency||{}),status:tx.status,visibility:tx.visibility},tx.visibility);
    if(typeof renderInventory==='function') renderInventory(); if(typeof renderGM==='function') renderGM(); if(typeof loadPlayer==='function') loadPlayer(currentId()); renderTransactionPanels(); return tx;
  }
  window.asteriaTransaction={create:createTransaction,apply:applyTransaction,read:readState,write:writeState,addCurrency,removeCurrency,snapshotItem};
  window.gmManualReward=function(){
    const player=document.getElementById('txRewardPlayer')?.value||selected||currentId(); const itemName=document.getElementById('txRewardItem')?.value?.trim(); const source=document.getElementById('txRewardSource')?.value||'GM Manual Reward';
    const qty=Math.max(1,Number(document.getElementById('txRewardQty')?.value||1)); const rarity=document.getElementById('txRewardRarity')?.value||'common'; const dest=document.getElementById('txRewardDestination')?.value||'inventory';
    const currency={}; currencyTypes.forEach(k=>currency[k]=Number(document.getElementById('txCur_'+k)?.value||0));
    const items=itemName?[{id:itemName.toLowerCase().replace(/[^a-z0-9]+/g,'-'),name:itemName,type:'Loot',qty,rarity,tags:[rarity],sourcePage:'Manual / Pending Compendium Link'}]:[];
    createTransaction({type:'gmReward',source,playerId:player,items,currency,destination:dest,gmApprovalRequired:['rare','legendary','relic','story'].includes(rarity),summary:`${chars[player]?.name||'Player'} received ${itemName||'currency/reward'} from ${source}.`});
  };
  window.requestLootClaim=function(lootId){const state=readState(); const loot=state.partyLoot.find(l=>l.lootId===lootId); if(!loot)return; loot.status='Claim Requested'; loot.requestedBy=currentId(); const tx={id:uid('claim'),timestamp:nowStamp(),type:'lootClaim',source:'Party Loot Claim',playerId:loot.requestedBy,items:[loot.item],lootId,status:'Awaiting GM Approval',summary:`${chars[loot.requestedBy]?.name||'Player'} requested ${loot.item.name}.`,gmApprovalRequired:true}; state.approvalQueue.unshift(tx); state.transactions.unshift(tx); writeState(state); notify('medium','Loot Claim Requested',tx.summary,'item',{visibility:'GM-only',important:true}); renderTransactionPanels();};
  window.approveTransaction=function(id){const state=readState(); const tx=state.approvalQueue.find(x=>x.id===id); if(!tx)return; tx.gmApproved=true; tx.status='Approved'; if(tx.lootId){state.partyLoot=state.partyLoot.filter(l=>l.lootId!==tx.lootId); writeState(state);} applyTransaction(Object.assign(tx,{type:'claimApproved',summary:`Claim approved: ${tx.items?.[0]?.name||'Loot'} assigned to ${chars[tx.playerId]?.name||'player'}.`}));};
  window.denyTransaction=function(id){const state=readState(); const tx=state.approvalQueue.find(x=>x.id===id); if(!tx)return; tx.status='Denied'; state.approvalQueue=state.approvalQueue.filter(x=>x.id!==id); if(tx.lootId){const loot=state.partyLoot.find(l=>l.lootId===tx.lootId); if(loot){loot.status='Unclaimed'; loot.requestedBy=null;}} state.transactions.unshift(Object.assign({},tx,{deniedAt:nowStamp()})); writeState(state); notify('medium','Claim Denied',tx.summary||'Transaction denied by GM.','warning',{targetPlayer:tx.playerId}); renderTransactionPanels();};
  window.assignPartyLoot=function(lootId,playerId){const state=readState(); const loot=state.partyLoot.find(l=>l.lootId===lootId); if(!loot)return; state.partyLoot=state.partyLoot.filter(l=>l.lootId!==lootId); writeState(state); createTransaction({type:'lootAssign',source:loot.source||'Party Loot',playerId,items:[loot.item],gmApproved:true,summary:`${loot.item.name} assigned from Party Loot to ${chars[playerId]?.name||'player'}.`});};
  window.removePartyLoot=function(lootId){const state=readState(); state.partyLoot=state.partyLoot.filter(l=>l.lootId!==lootId); writeState(state); renderTransactionPanels();};
  window.confirmPurchase=function(itemName='Shop Item',costGold=1){const player=currentId(); createTransaction({type:'purchase',source:'Shop Purchase',playerId:player,items:[{name:itemName,type:'Purchased Item',value:costGold,tags:['shop']}],cost:{gold:costGold},summary:`Purchased ${itemName} for ${costGold} Crowns.`});};
  window.purchaseService=function(service='Inn Stay',costSilver=5){const player=currentId(); createTransaction({type:'service',source:'Service Purchase',playerId:player,service,cost:{silver:costSilver},summary:`${chars[player]?.name||'Player'} purchased service: ${service}.`});};
  window.addQuestRewardTransaction=function(playerId=currentId(),xp=0,itemName='',gold=0){const items=itemName?[{name:itemName,type:'Quest Reward',tags:['quest']}]:[]; const currency={gold:Number(gold||0)}; createTransaction({type:'questReward',source:'Quest Reward',playerId,items,currency,summary:`Quest reward granted${xp?` (+${xp} XP separately through XP system)`:''}.`}); if(xp&&typeof adjustCharacterResource==='function')adjustCharacterResource(playerId,'xp',Number(xp));};
  function optionPlayers(){return Object.entries(chars||{}).map(([id,c])=>`<option value="${id}" ${id===selected?'selected':''}>${c.name}</option>`).join('');}
  function currencyInputs(){return currencyTypes.map(k=>`<label>${currencyLabels[k]}<input id="txCur_${k}" type="number" min="0" value="0"></label>`).join('');}
  function renderPartyLootList(){const state=readState(); if(!document.getElementById('partyLootList'))return; document.getElementById('partyLootList').innerHTML=(state.partyLoot||[]).map(l=>`<article class="loot-row ${l.visibility==='GM-only'?'gm-secret':''}"><div><b>${l.item.name}</b><small>${l.item.type||'Item'} • ${l.source||'Unknown Source'} • ${new Date(l.dateGained).toLocaleDateString()} ${l.item.questItem?' • Quest Item':''}</small><p class="muted smallnote">Snapshot: ${l.item.snapshotVersion||'current'} • ${l.visibility||'Public'} • ${l.status}</p></div><div class="loot-actions"><select id="assign_${l.lootId}">${optionPlayers()}</select><button onclick="assignPartyLoot('${l.lootId}',document.getElementById('assign_${l.lootId}').value)">Assign</button><button onclick="requestLootClaim('${l.lootId}')">Request Claim</button><button class="danger" onclick="removePartyLoot('${l.lootId}')">Remove</button></div></article>`).join('')||'<p class="muted">No party loot waiting.</p>';}
  function renderApprovals(){const state=readState(); const el=document.getElementById('transactionApprovalQueue'); if(!el)return; el.innerHTML=(state.approvalQueue||[]).map(tx=>`<article class="approval-row"><div><b>${tx.type}</b><small>${tx.summary||tx.source}</small><p class="muted smallnote">${tx.character||''} • ${tx.status} • ${new Date(tx.timestamp).toLocaleString()}</p></div><div><button class="primary" onclick="approveTransaction('${tx.id}')">Approve</button><button class="danger" onclick="denyTransaction('${tx.id}')">Deny</button></div></article>`).join('')||'<p class="muted">No approvals pending.</p>';}
  function renderTxLog(){const state=readState(); const el=document.getElementById('transactionLogRows'); if(!el)return; el.innerHTML=(state.transactions||[]).slice(0,40).map(tx=>`<div class="tx-log-row"><b>${tx.status}</b><span>${tx.summary||tx.source}</span><small>${tx.id} • ${new Date(tx.timestamp).toLocaleString()} • ${tx.visibility||'Public'}</small></div>`).join('')||'<p class="muted">No transactions yet.</p>';}
  function renderPlayerLoot(){const state=readState(); const el=document.getElementById('playerPartyLootPanel'); if(!el)return; const visible=(state.partyLoot||[]).filter(l=>l.visibility!=='GM-only'); el.innerHTML=`<div class="section-head mini"><h3>Party Loot</h3><span class="pill">Shared</span></div>${visible.map(l=>`<article class="player-loot-card"><b>${l.item.name}</b><small>${l.source||'Reward'} • ${l.status}</small><button onclick="requestLootClaim('${l.lootId}')">Request Claim</button></article>`).join('')||'<p class="muted smallnote">No public party loot.</p>'}`;}
  window.renderTransactionPanels=function(){renderPartyLootList();renderApprovals();renderTxLog();renderPlayerLoot();};
  function injectPanels(){
    const gm=document.querySelector('#gm .gm-main .gm-panels');
    if(gm&&!document.getElementById('partyLootManagerPanel')){
      const panel=document.createElement('section'); panel.className='card transaction-pipeline-panel'; panel.id='partyLootManagerPanel';
      panel.innerHTML=`<div class="section-head"><div><p class="eyebrow">Unified Transaction Pipeline</p><h3>Party Loot + Rewards</h3></div><span class="pill">v1</span></div><p class="muted smallnote">All loot, purchases, services, quest rewards, trades, crafting placeholders, currency changes, and GM grants should flow through this handler.</p><div class="tx-tool-grid"><label>Player<select id="txRewardPlayer">${optionPlayers()}</select></label><label>Source<select id="txRewardSource"><option>GM Manual Reward</option><option>Encounter Loot</option><option>Creature Drop</option><option>Quest Reward</option><option>Treasure Chest</option><option>Shop Purchase</option><option>NPC Trade</option><option>Crafted Item</option><option>Service Purchase</option><option>Shattered Zone Reward</option></select></label><label>Item / Reward Name<input id="txRewardItem" placeholder="Iron Dagger, Relic Shard, Healing Service..."></label><label>Quantity<input id="txRewardQty" type="number" value="1" min="1"></label><label>Rarity<select id="txRewardRarity"><option>common</option><option>rare</option><option>legendary</option><option>relic</option><option>story</option></select></label><label>Destination<select id="txRewardDestination"><option value="inventory">Inventory / Selected Bag</option><option value="partyLoot">Party Loot</option></select></label></div><details open><summary>Currency Change</summary><div class="currency-entry-grid">${currencyInputs()}</div></details><div class="tx-button-row"><button class="primary" onclick="gmManualReward()">Create Transaction</button><button onclick="purchaseService('Inn Stay',5)">Test Service</button><button onclick="confirmPurchase('Shop Item',1)">Test Purchase</button></div><h4>Party Loot</h4><div id="partyLootList" class="party-loot-list"></div>`;
      gm.appendChild(panel);
      const approvals=document.createElement('section'); approvals.className='card transaction-approval-panel'; approvals.innerHTML=`<div class="section-head mini"><h3>Approval Queue</h3><span class="pill">GM Only</span></div><div id="transactionApprovalQueue"></div>`; gm.appendChild(approvals);
      const log=document.createElement('section'); log.className='card transaction-log-panel'; log.innerHTML=`<div class="section-head mini"><h3>Transaction Log</h3><span class="pill">Session Linked</span></div><div id="transactionLogRows"></div>`; gm.appendChild(log);
    }
    const party=document.querySelector('#partyLootDock')||document.querySelector('#partyPane .party-dashboard-grid');
    if(party&&!document.getElementById('playerPartyLootPanel')){const p=document.createElement('section'); p.className='card player-party-loot-panel'; p.id='playerPartyLootPanel'; party.appendChild(p);}
    normalizePlayerDashboardLayout?.();
    const inv=document.querySelector('#inventory .inventory-system-layout');
    if(inv&&!document.getElementById('unsortedLootPanel')){const p=document.createElement('div'); p.className='card unsorted-loot-panel'; p.id='unsortedLootPanel'; p.innerHTML='<div class="section-head mini"><h3>Unsorted Loot</h3><span class="pill">Inventory Safety</span></div><p class="muted smallnote">Items that could not be placed into a selected bag or inventory slot appear here or in Party Loot.</p><div id="unsortedLootRows"></div>'; inv.appendChild(p);}
    renderTransactionPanels();
  }
  const oldRenderInventory=window.renderInventory; if(typeof oldRenderInventory==='function') window.renderInventory=function(){oldRenderInventory(); renderTransactionPanels();};
  window.AsteriaViewHooks?.afterGMRender('transaction-panels', () => setTimeout(injectPanels,50));
  window.AsteriaViewHooks?.afterPlayerLoad('transaction-panels', () => setTimeout(injectPanels,50));
  const oldUseItem=window.useInventoryItem; if(typeof oldUseItem==='function'&&!oldUseItem.__txWrapped){window.useInventoryItem=function(itemId){const id=currentId(); const c=charById(id); const it=c?.inventory?.find(x=>x.id===itemId); oldUseItem(itemId); if(it) createTransaction({type:'itemUse',source:'Inventory Use',playerId:id,items:[],summary:`${c.name} used ${it.name}.`,gmApproved:true,visibility:'Public'});}; window.useInventoryItem.__txWrapped=true;}
  const oldBadge=window.buildVersionBadge; window.buildVersionBadge=function(){ if(typeof oldBadge==='function')oldBadge(); const b=document.querySelector('.version-badge'); if(b)b.textContent=VERSION; };
  document.addEventListener('DOMContentLoaded',()=>{setTimeout(()=>{injectPanels(); window.buildVersionBadge?.();},300);});
})();

/* =====================================================
   Asteria v1.7.2.8 — Item Creation + Crafting UI Pipeline System v1
   Integrated into current website systems: player dashboard, GM panel,
   compendium, transactions, notifications, session log, inventory.
   ===================================================== */
(function(){
  const VERSION='v1.7.2.8 • Item Creation + Crafting UI Pipeline v1';
  const STORE='asteriaCraftingPipelineV1';
  const now=()=>new Date().toISOString();
  const uid=(p='craft')=>p+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
  const moneyTypes=['copper','silver','gold','platinumCrown','royalCrown','royalPlatinum'];

  const ITEM_CLASSES={
    Common:{label:'Common',colour:'Gray',ac:0,damage:0,valueMod:1,affinity:'Stable baseline'},
    Uncommon:{label:'Uncommon',colour:'Green',ac:1,damage:1,valueMod:1.25,affinity:'Minor resonance'},
    Unusual:{label:'Unusual',colour:'Blue',ac:2,damage:2,valueMod:1.6,affinity:'Distinct technique'},
    Rare:{label:'Rare',colour:'Red',ac:3,damage:3,valueMod:2.2,affinity:'Strong enchantment affinity'},
    Epic:{label:'Epic',colour:'Orange',ac:4,damage:4,valueMod:3,affinity:'High essence stability'},
    Mythic:{label:'Mythic',colour:'Purple',ac:5,damage:5,valueMod:4.5,affinity:'Mythic channeling'},
    Legendary:{label:'Legendary',colour:'Gold',ac:6,damage:6,valueMod:7,affinity:'Legendary anchor'},
    Relic:{label:'Relic',colour:'Diamond',ac:7,damage:7,valueMod:12,affinity:'Relic/legacy bound'}
  };
  const ITEM_QUALITIES={
    Trash:{label:'Trash',ac:-6,damage:-6}, Poor:{label:'Poor',ac:-3,damage:-3}, Average:{label:'Average',ac:0,damage:0},
    'Well Crafted':{label:'Well Crafted',ac:1,damage:1}, Exceptional:{label:'Exceptional',ac:2,damage:2}, Superb:{label:'Superb',ac:3,damage:3},
    Exquisite:{label:'Exquisite',ac:4,damage:5}, Masterwork:{label:'Masterwork',ac:5,damage:7}
  };
  const CRAFT_TIERS={
    Simple:{xp:0,desc:'Ammunition, tools, rations; repeatable work with little innovation.',examples:'Ammunition, rations, basic tools',notes:'XP only once if meaningful.'},
    Advanced:{xp:250,desc:'Weapons, armour, and complex tools requiring trained craftsmanship.',examples:'Weapons, armour, lock tools',notes:'Common among professionals.'},
    Innovated:{xp:500,desc:'New techniques or improvements that modify an existing design.',examples:'Improved bowstring, reinforced pack',notes:'Requires experimentation.'},
    Ingenious:{xp:1000,desc:'Multiple functions or layered mechanics built into one design.',examples:'Folding shield, hidden mechanism',notes:'Hard to replicate.'},
    'Cutting Edge':{xp:2000,desc:'At the edge of known capability; failure risk is high.',examples:'Prototype device, unusual alloy',notes:'Rare knowledge/tools required.'},
    Revolutionary:{xp:3000,desc:'Alters industries, warfare, or magic by enabling new possibilities.',examples:'New class of construct',notes:'Often controlled or feared.'},
    Masterwork:{xp:4000,desc:'Nearly flawless form and function with no wasted effort.',examples:'Perfect blade, signature armour',notes:'Extremely rare.'},
    Savant:{xp:5000,desc:'Legendary creation tied to myth, fate, or legacy.',examples:'World-defining item',notes:'Unique or campaign-changing.'}
  };
  const SKILL_RANK_BONUS={Novice:-50,Initiate:0,Apprentice:150,Journeyman:400,Adept:800,Master:1600,Grandmaster:3000};
  const AFFINITY_CAPS=[['Novice',1,9],['Initiate',10,24],['Apprentice',25,44],['Journeyman',45,69],['Adept',70,84],['Master',85,97],['Grandmaster',98,100]];
  const POTION_STRENGTH=['Tainted','Weak','Processed','Refined','Concentrated','Enhanced','Fortified','Grand'];
  const POTION_LEVEL=['Basic','Brew','Tincture','Suspension','Concoction','Solution','Infused','Elixir'];
  const SOUL_STONE_RANKS=['Poor','Weak','Basic','Common','Luminous','Brilliant','Special','Resplendent'];
  const BASE_MATERIALS={
    Wood:{ac:0,damage:0,mod:'Flexible, light, low metal content'}, Iron:{ac:1,damage:1,mod:'Reliable baseline metal'}, Steel:{ac:2,damage:2,mod:'Balanced durability and edge'},
    Silver:{ac:1,damage:1,mod:'Spirit and curse resonance'}, Mithril:{ac:3,damage:2,mod:'Lightweight, high-quality armour'}, Obsidian:{ac:0,damage:3,mod:'Sharp but brittle'},
    Soulstone:{ac:1,damage:2,mod:'Soul point resonance material'}, Dragonbone:{ac:3,damage:3,mod:'Rare monster material'}
  };
  const BASE_TEMPLATES={
    Sword:{type:'Weapon',baseDamage:'1d8',baseAC:0,baseValue:15,skill:'Smithing'}, Dagger:{type:'Weapon',baseDamage:'1d4',baseAC:0,baseValue:5,skill:'Smithing'},
    Bow:{type:'Weapon',baseDamage:'1d6',baseAC:0,baseValue:25,skill:'Woodworking'}, Armour:{type:'Armour',baseDamage:'—',baseAC:2,baseValue:30,skill:'Smithing'},
    Shield:{type:'Armour',baseDamage:'—',baseAC:1,baseValue:10,skill:'Smithing'}, Potion:{type:'Consumable',baseDamage:'—',baseAC:0,baseValue:12,skill:'Alchemy'},
    Tool:{type:'Tool',baseDamage:'—',baseAC:0,baseValue:8,skill:'Tinkering'}, 'Soul Stone Focus':{type:'Material/Focus',baseDamage:'—',baseAC:0,baseValue:50,skill:'Gem Craft'}
  };
  window.ASTERIA_CRAFTING_TABLES={ITEM_CLASSES,ITEM_QUALITIES,CRAFT_TIERS,SKILL_RANK_BONUS,AFFINITY_CAPS,POTION_STRENGTH,POTION_LEVEL,SOUL_STONE_RANKS,BASE_MATERIALS,BASE_TEMPLATES};

  function read(){try{return JSON.parse(localStorage.getItem(STORE)||'{}')}catch(e){return {}}}
  function write(s){localStorage.setItem(STORE,JSON.stringify(s)); if(window.asteriaDataSync?.saveAppState) window.asteriaDataSync.saveAppState({crafting:s});}
  function state(){const s=read(); s.projects=s.projects||[]; s.approvals=s.approvals||[]; s.log=s.log||[]; return s;}
  function currentCharId(){try{return typeof currentPlayerId==='function'?currentPlayerId():selected}catch(e){return selected}}
  function char(id=currentCharId()){return (window.chars||{})[id]}
  function opt(obj,sel){return Object.keys(obj).map(k=>`<option ${k===sel?'selected':''}>${k}</option>`).join('')}
  function optArr(arr,sel){return arr.map(k=>`<option ${k===sel?'selected':''}>${k}</option>`).join('')}
  function notifyCraft(level,title,msg,type='crafting',opts={}){ if(typeof notify==='function') notify(level,title,msg,type,opts); else if(typeof toast==='function') toast(title+': '+msg); }
  function logSession(type,text,data={},visibility='Public'){ if(typeof slEvent==='function') slEvent(type,text,data,visibility); }
  function addCraftLog(entry){const s=state(); s.log.unshift(Object.assign({id:uid('craftlog'),time:now()},entry)); write(s); renderCraftingPanels();}
  function affinityCap(score){score=Number(score||0); const row=AFFINITY_CAPS.find(r=>score>=r[1]&&score<=r[2]); return row?row[0]:'Novice'}
  function outcomeFromTotal(total){total=Number(total||0); if(total>=85)return 'Success'; if(total>=55)return 'Partial Success'; if(total>=25)return 'Major Failure'; return 'Catastrophic Failure'}
  function outcomeMod(out){return out==='Success'?1:out==='Partial Success'?0.5:out==='Major Failure'?0.25:0}
  function calcPreview(p){
    const template=BASE_TEMPLATES[p.template]||BASE_TEMPLATES.Sword, material=BASE_MATERIALS[p.material]||BASE_MATERIALS.Iron, cls=ITEM_CLASSES[p.itemClass]||ITEM_CLASSES.Common, q=ITEM_QUALITIES[p.quality]||ITEM_QUALITIES.Average;
    const ac=(Number(template.baseAC)||0)+(Number(material.ac)||0)+cls.ac+q.ac;
    const dmgMod=(Number(material.damage)||0)+cls.damage+q.damage;
    const tier=CRAFT_TIERS[p.craftTier]||CRAFT_TIERS.Simple;
    const skillBonus=SKILL_RANK_BONUS[p.skillRank]??0;
    const out=p.outcome||outcomeFromTotal(p.finalRoll||0);
    const xp=Math.max(0,Math.round((tier.xp*outcomeMod(out))+skillBonus));
    const value=Math.max(0,Math.round((template.baseValue||1)*(cls.valueMod||1)+Math.max(0,q.damage+q.ac)*5));
    return {template,material,cls,q,ac,dmgMod,tier,out,xp,value,cap:affinityCap(p.affinity)};
  }
  function finalItemSnapshot(p){const calc=calcPreview(p); const isPotion=p.template==='Potion'; const isSoul=p.template==='Soul Stone Focus'||p.material==='Soulstone'; return {
    id:uid('craftedItem'), name:p.itemName||p.projectName||`${p.itemClass} ${p.material} ${p.template}`, type:calc.template.type, source:'Crafting Project', sourceProject:p.projectName,
    rarity:p.itemClass, quality:p.quality, material:p.material, craftTier:p.craftTier, skill:p.skill, skillRank:p.skillRank,
    baseDamage:calc.template.baseDamage, damageModifier:calc.dmgMod, acModifier:calc.ac, value:calc.value,
    potion:isPotion?{strength:p.potionStrength,level:p.potionLevel,effectValue:p.potionEffect||'',duration:p.potionDuration||'',sideEffects:p.potionSide||''}:null,
    soulStone:isSoul?{rank:p.soulRank,soulPoints:Number(p.soulPoints||0),sellingPrice:p.soulSell||'',purchasePrice:p.soulBuy||'',craftMaterial:true,enchantMaterial:true}:null,
    snapshot:{versionRef:'Crafting UI Pipeline v1',createdAt:now(),compendiumRefs:p.compendiumRefs||[],preserved:true},
    tags:['crafted',p.itemClass,p.quality,p.craftTier].filter(Boolean), hidden:p.hidden||false, cursed:p.cursed||false, questItem:p.questItem||false
  }}
  function serializeProjectForm(prefix='craft'){const g=id=>document.getElementById(prefix+id); return {
    id:g('Id')?.value||uid('project'), status:g('Status')?.value||'Draft', projectName:g('ProjectName')?.value||'Unnamed Project', itemName:g('ItemName')?.value||'', characterId:g('Character')?.value||currentCharId(),
    template:g('Template')?.value||'Sword', material:g('Material')?.value||'Iron', itemClass:g('Class')?.value||'Common', quality:g('Quality')?.value||'Average', craftTier:g('Tier')?.value||'Simple',
    skill:g('Skill')?.value||'Smithing', skillRank:g('SkillRank')?.value||'Initiate', affinity:Number(g('Affinity')?.value||50), tools:g('Tools')?.value||'', materials:g('Materials')?.value||'', optional:g('Optional')?.value||'', time:g('Time')?.value||'', risk:g('Risk')?.value||'Low',
    roll:Number(g('Roll')?.value||0), skillMod:Number(g('SkillMod')?.value||0), toolMod:Number(g('ToolMod')?.value||0), materialMod:Number(g('MaterialMod')?.value||0), environmentMod:Number(g('EnvMod')?.value||0), gmMod:Number(g('GmMod')?.value||0),
    outcome:g('Outcome')?.value||'', gmApproval:g('Approval')?.checked||false, destination:g('Destination')?.value||'inventory', potionStrength:g('PotionStrength')?.value||'Processed', potionLevel:g('PotionLevel')?.value||'Basic', potionEffect:g('PotionEffect')?.value||'', potionDuration:g('PotionDuration')?.value||'', potionSide:g('PotionSide')?.value||'', soulRank:g('SoulRank')?.value||'Basic', soulPoints:Number(g('SoulPoints')?.value||0), soulSell:g('SoulSell')?.value||'', soulBuy:g('SoulBuy')?.value||''
  }}
  function projectCard(p){const calc=calcPreview(p); return `<article class="craft-project-card ${p.status==='Approved'?'approved':''}"><div><b>${p.projectName}</b><small>${chars?.[p.characterId]?.name||'Unknown'} • ${p.template} • ${p.status}</small><p class="muted smallnote">${p.itemClass} / ${p.quality} / ${p.craftTier} • ${p.skill} ${p.skillRank} • Affinity cap: ${calc.cap}</p></div><div class="craft-mini-stats"><span>AC ${calc.ac>=0?'+':''}${calc.ac}</span><span>Dmg ${calc.dmgMod>=0?'+':''}${calc.dmgMod}</span><span>XP ${calc.xp}</span></div><div class="craft-card-actions"><button onclick="loadCraftProject('${p.id}')">Edit</button><button class="primary" onclick="completeCraftProject('${p.id}')">Complete</button><button onclick="requestCraftApproval('${p.id}')">Request GM</button></div></article>`}
  window.saveCraftProject=function(){const p=serializeProjectForm('craft'); p.finalRoll=(p.roll||0)+p.skillMod+p.toolMod+p.materialMod+p.environmentMod+p.gmMod; p.outcome=p.outcome||outcomeFromTotal(p.finalRoll); p.updatedAt=now(); const s=state(); const i=s.projects.findIndex(x=>x.id===p.id); if(i>=0)s.projects[i]=Object.assign(s.projects[i],p); else s.projects.unshift(p); write(s); notifyCraft('small','Crafting Project Saved',`${p.projectName} saved.`); logSession('Crafting',`Crafting project saved: ${p.projectName}`,p,'Public'); renderCraftingPanels();};
  window.startCraftProject=function(){const p=serializeProjectForm('craft'); p.status='Active'; p.startedAt=now(); const s=state(); const i=s.projects.findIndex(x=>x.id===p.id); if(i>=0)s.projects[i]=Object.assign(s.projects[i],p); else s.projects.unshift(p); write(s); notifyCraft('medium','Crafting Project Started',`${p.projectName} is now active.`); addCraftLog({type:'Project Started',project:p.projectName,character:chars?.[p.characterId]?.name,visibility:'Public'});};
  window.loadCraftProject=function(id){const p=state().projects.find(x=>x.id===id); if(!p)return; setGMSystemPanel?.('crafting'); setTimeout(()=>{for(const [k,v] of Object.entries({Id:p.id,Status:p.status,ProjectName:p.projectName,ItemName:p.itemName,Character:p.characterId,Template:p.template,Material:p.material,Class:p.itemClass,Quality:p.quality,Tier:p.craftTier,Skill:p.skill,SkillRank:p.skillRank,Affinity:p.affinity,Tools:p.tools,Materials:p.materials,Optional:p.optional,Time:p.time,Risk:p.risk,Roll:p.roll,SkillMod:p.skillMod,ToolMod:p.toolMod,MaterialMod:p.materialMod,EnvMod:p.environmentMod,GmMod:p.gmMod,Outcome:p.outcome,Destination:p.destination,PotionStrength:p.potionStrength,PotionLevel:p.potionLevel,PotionEffect:p.potionEffect,PotionDuration:p.potionDuration,PotionSide:p.potionSide,SoulRank:p.soulRank,SoulPoints:p.soulPoints,SoulSell:p.soulSell,SoulBuy:p.soulBuy})){const el=document.getElementById('craft'+k); if(el)el.value=v??'';} const ap=document.getElementById('craftApproval'); if(ap)ap.checked=!!p.gmApproval; updateCraftPreview();},50);};
  window.deleteCraftProject=function(id){const s=state(); s.projects=s.projects.filter(p=>p.id!==id); write(s); renderCraftingPanels();};
  window.requestCraftApproval=function(id){const s=state(); const p=s.projects.find(x=>x.id===id); if(!p)return; p.status='Awaiting GM Approval'; if(!s.approvals.find(a=>a.id===id))s.approvals.unshift({id:p.id,projectName:p.projectName,characterId:p.characterId,time:now(),status:'Pending'}); write(s); notifyCraft('medium','Crafting Approval Required',`${p.projectName} awaits GM approval.`,'warning',{visibility:'GM-only',important:true}); renderCraftingPanels();};
  window.approveCraftProject=function(id){const s=state(); const p=s.projects.find(x=>x.id===id); if(!p)return; p.status='Approved'; s.approvals=s.approvals.filter(a=>a.id!==id); write(s); notifyCraft('medium','Crafting Approved',`${p.projectName} approved.`); addCraftLog({type:'GM Approval',project:p.projectName,gmOverride:false});};
  window.rejectCraftProject=function(id){const s=state(); const p=s.projects.find(x=>x.id===id); if(p)p.status='Rejected'; s.approvals=s.approvals.filter(a=>a.id!==id); write(s); notifyCraft('medium','Crafting Rejected',`${p?.projectName||'Project'} rejected.`,'warning'); renderCraftingPanels();};
  window.completeCraftProject=function(id){const s=state(); const p=s.projects.find(x=>x.id===id); if(!p)return; p.finalRoll=(Number(p.roll)||0)+(Number(p.skillMod)||0)+(Number(p.toolMod)||0)+(Number(p.materialMod)||0)+(Number(p.environmentMod)||0)+(Number(p.gmMod)||0); p.outcome=p.outcome||outcomeFromTotal(p.finalRoll); const calc=calcPreview(p); p.finalSnapshot=finalItemSnapshot(p); p.completedAt=now(); p.status='Completed'; write(s);
    const notificationLevel=(p.itemClass==='Relic'||p.itemClass==='Legendary'||p.craftTier==='Savant'||p.quality==='Masterwork'||p.outcome==='Catastrophic Failure')?'major':'medium';
    notifyCraft(notificationLevel,p.outcome==='Catastrophic Failure'?'Catastrophic Crafting Failure':'Item Crafted',`${p.projectName}: ${p.outcome}. XP ${calc.xp}.` , p.outcome==='Catastrophic Failure'?'warning':'crafting',{important:notificationLevel==='major'});
    logSession('Crafting',`Craft completed: ${p.projectName} — ${p.outcome}`,{project:p.projectName,character:chars?.[p.characterId]?.name,skill:p.skill,rank:p.skillRank,affinityCap:calc.cap,materials:p.materials,tools:p.tools,roll:p.roll,finalRoll:p.finalRoll,outcome:p.outcome,xp:calc.xp,item:p.finalSnapshot.name,stats:`AC ${calc.ac}, Damage modifier ${calc.dmgMod}`,destination:p.destination},'Public');
    if(window.asteriaTransaction?.create){ window.asteriaTransaction.create({type:'craftedItem',source:'Crafting Project',playerId:p.characterId,items:[p.finalSnapshot],destination:p.destination==='partyLoot'?'partyLoot':'inventory',summary:`Crafted ${p.finalSnapshot.name} (${p.outcome})`,gmApproved:true,currency:{},materialsConsumed:p.materials}); }
    else { const c=chars?.[p.characterId]; if(c){c.inventory=c.inventory||[]; c.inventory.push(p.finalSnapshot); if(typeof saveAsteriaState==='function')saveAsteriaState();} }
    if(calc.xp>0 && typeof adjustCharacterResource==='function'){} // Crafting skill XP hook reserved for Skill System integration.
    addCraftLog({type:'Project Completed',project:p.projectName,character:chars?.[p.characterId]?.name,skill:p.skill,skillRank:p.skillRank,affinityCap:calc.cap,materials:p.materials,tools:p.tools,roll:p.roll,finalRoll:p.finalRoll,outcome:p.outcome,xp:calc.xp,item:p.finalSnapshot.name,stats:`AC ${calc.ac}, Damage +${calc.dmgMod}`,destination:p.destination});
  };
  window.updateCraftPreview=function(){const p=serializeProjectForm('craft'); p.finalRoll=(p.roll||0)+p.skillMod+p.toolMod+p.materialMod+p.environmentMod+p.gmMod; p.outcome=p.outcome||outcomeFromTotal(p.finalRoll); const calc=calcPreview(p); const el=document.getElementById('craftPreview'); if(!el)return; el.innerHTML=`<div class="craft-preview-grid"><div><small>Final Item</small><b>${p.itemName||p.projectName||p.template}</b><span>${p.itemClass} ${p.quality} ${p.material} ${p.template}</span></div><div><small>AC Modifier</small><b>${calc.ac>=0?'+':''}${calc.ac}</b><span>Template + material + class + quality</span></div><div><small>Damage Modifier</small><b>${calc.dmgMod>=0?'+':''}${calc.dmgMod}</b><span>Base ${calc.template.baseDamage}</span></div><div><small>Crafting XP</small><b>${calc.xp}</b><span>${calc.tier.xp} × outcome + ${p.skillRank}</span></div><div><small>Affinity Cap</small><b>${calc.cap}</b><span>Affinity ${p.affinity}</span></div><div><small>Outcome</small><b>${p.outcome}</b><span>Final roll ${p.finalRoll||0}</span></div></div><p class="muted smallnote">${calc.tier.desc}</p>`;};

  function craftingFormHTML(prefix='craft'){
    return `<input type="hidden" id="${prefix}Id"><input type="hidden" id="${prefix}Status" value="Draft"><div class="craft-form-grid">
      <label>Project Name<input id="${prefix}ProjectName" placeholder="Rare Steel Sword"></label><label>Final Item Name<input id="${prefix}ItemName" placeholder="Optional custom name"></label><label>Character<select id="${prefix}Character">${Object.keys(chars||{}).map(id=>`<option value="${id}" ${id===currentCharId()?'selected':''}>${chars[id].name}</option>`).join('')}</select></label>
      <label>Item Template<select id="${prefix}Template" onchange="updateCraftPreview()">${opt(BASE_TEMPLATES)}</select></label><label>Base Material<select id="${prefix}Material" onchange="updateCraftPreview()">${opt(BASE_MATERIALS,'Steel')}</select></label><label>Item Class / Rarity<select id="${prefix}Class" onchange="updateCraftPreview()">${opt(ITEM_CLASSES,'Common')}</select></label>
      <label>Item Quality<select id="${prefix}Quality" onchange="updateCraftPreview()">${opt(ITEM_QUALITIES,'Average')}</select></label><label>Craft Tier<select id="${prefix}Tier" onchange="updateCraftPreview()">${opt(CRAFT_TIERS,'Simple')}</select></label><label>Risk Level<select id="${prefix}Risk"><option>Low</option><option>Moderate</option><option>High</option><option>Severe</option></select></label>
      <label>Required Skill<input id="${prefix}Skill" value="Smithing"></label><label>Skill Rank<select id="${prefix}SkillRank" onchange="updateCraftPreview()">${opt(SKILL_RANK_BONUS,'Initiate')}</select></label><label>Skill Affinity<input id="${prefix}Affinity" type="number" min="1" max="100" value="50" oninput="updateCraftPreview()"></label>
      <label>Required Tools<input id="${prefix}Tools" placeholder="Smithing tools, forge..."></label><label>Required Materials<textarea id="${prefix}Materials" placeholder="2 steel ingots, leather wrap..."></textarea></label><label>Optional Components<textarea id="${prefix}Optional" placeholder="Soul stone, monster bone..."></textarea></label>
      <label>Crafting Time<input id="${prefix}Time" placeholder="4 hours, 3 days..."></label><label>Destination<select id="${prefix}Destination"><option value="inventory">Inventory / Bag</option><option value="partyLoot">Party Loot</option><option value="unsorted">Unsorted Loot</option></select></label><label class="checkline"><input id="${prefix}Approval" type="checkbox"> GM approval required</label>
    </div><details><summary>Potion Output</summary><div class="craft-form-grid"><label>Strength<select id="${prefix}PotionStrength">${optArr(POTION_STRENGTH,'Processed')}</select></label><label>Level<select id="${prefix}PotionLevel">${optArr(POTION_LEVEL,'Basic')}</select></label><label>Effect Value<input id="${prefix}PotionEffect" placeholder="2d6 healing, +10 MP..."></label><label>Duration<input id="${prefix}PotionDuration" placeholder="1 hour"></label><label>Side Effects<input id="${prefix}PotionSide" placeholder="Nausea, mana burn..."></label></div></details>
    <details><summary>Soul Stone Fields</summary><div class="craft-form-grid"><label>Rank<select id="${prefix}SoulRank">${optArr(SOUL_STONE_RANKS,'Basic')}</select></label><label>Soul Points<input id="${prefix}SoulPoints" type="number" value="0"></label><label>Selling Price<input id="${prefix}SoulSell" placeholder="10 Crowns"></label><label>Purchase Price<input id="${prefix}SoulBuy" placeholder="25 Crowns"></label></div></details>
    <details open><summary>Manual d100 Crafting Check</summary><div class="craft-form-grid compact"><label>Base d100 Roll<input id="${prefix}Roll" type="number" min="1" max="100" value="0" oninput="updateCraftPreview()"></label><label>Skill Mod<input id="${prefix}SkillMod" type="number" value="0" oninput="updateCraftPreview()"></label><label>Tool Mod<input id="${prefix}ToolMod" type="number" value="0" oninput="updateCraftPreview()"></label><label>Material Mod<input id="${prefix}MaterialMod" type="number" value="0" oninput="updateCraftPreview()"></label><label>Environment Mod<input id="${prefix}EnvMod" type="number" value="0" oninput="updateCraftPreview()"></label><label>GM Mod<input id="${prefix}GmMod" type="number" value="0" oninput="updateCraftPreview()"></label><label>Outcome Override<select id="${prefix}Outcome" onchange="updateCraftPreview()"><option value="">Auto from roll</option><option>Success</option><option>Partial Success</option><option>Major Failure</option><option>Catastrophic Failure</option></select></label></div></details>
    <div id="craftPreview" class="craft-preview"></div><div class="craft-button-row"><button onclick="updateCraftPreview()">Preview Final Stats</button><button onclick="saveCraftProject()">Save Draft</button><button onclick="startCraftProject()" class="primary">Start Project</button><button onclick="requestCraftApproval(document.getElementById('${prefix}Id').value||'')">Request GM Approval</button></div>`;
  }
  function renderCraftingPanels(){
    const s=state();
    const list=document.getElementById('craftProjectList'); if(list) list.innerHTML=(s.projects||[]).map(projectCard).join('')||'<p class="muted smallnote">No crafting projects yet.</p>';
    const gl=document.getElementById('craftGMProjectList'); if(gl) gl.innerHTML=(s.projects||[]).map(projectCard).join('')||'<p class="muted smallnote">No crafting projects yet.</p>';
    const ap=document.getElementById('craftApprovalQueue'); if(ap) ap.innerHTML=(s.approvals||[]).map(a=>`<article class="approval-row"><div><b>${a.projectName}</b><small>${chars?.[a.characterId]?.name||'Unknown'} • ${a.status}</small></div><div><button class="primary" onclick="approveCraftProject('${a.id}')">Approve</button><button class="danger" onclick="rejectCraftProject('${a.id}')">Reject</button></div></article>`).join('')||'<p class="muted smallnote">No crafting approvals pending.</p>';
    const log=document.getElementById('craftTransactionLog'); if(log) log.innerHTML=(s.log||[]).slice(0,20).map(l=>`<div class="craft-log-row"><b>${l.type}</b><span>${l.project||''}</span><small>${new Date(l.time).toLocaleString()} • ${l.outcome||''} ${l.xp!==undefined?'• XP '+l.xp:''}</small></div>`).join('')||'<p class="muted smallnote">No crafting log entries.</p>';
  }
  function installPlayerCraftingPanel(){return;}
  function installGMCraftingPanel(){
    const gmPanels=document.querySelector('#gm .gm-panels'); if(!gmPanels||document.getElementById('gmCraftingPanel'))return;
    const card=document.createElement('section'); card.className='card gm-crafting-panel'; card.id='gmCraftingPanel'; card.dataset.gmSystem='crafting';
    card.innerHTML=`<div class="section-head"><div><p class="eyebrow">Crafting Manager</p><h3>Item Creation + Crafting Pipeline</h3></div><span class="pill">${VERSION}</span></div><p class="muted smallnote">Approve projects, apply modifiers, force outcomes, manage consequences, and route crafted items through transactions.</p><div class="craft-gm-grid"><section><h4>Project Approval Queue</h4><div id="craftApprovalQueue"></div></section><section><h4>Project Manager</h4><div id="craftGMProjectList"></div></section></div><details><summary>GM Crafting Override Tools</summary>${craftingFormHTML('craft')}<div class="craft-button-row"><button class="primary" onclick="saveCraftProject()">Save / Override Project</button><button onclick="completeCraftProject(document.getElementById('craftId').value)">Force Complete</button></div></details><h4>Crafting Transaction Log</h4><div id="craftTransactionLog"></div>`;
    gmPanels.appendChild(card); renderCraftingPanels(); updateCraftPreview();
  }
  function installCompendiumCraftingTables(){
    // Adds live table pages to existing compendium/content navigation if the host page exists.
    const data=window.contentManifest||window.CONTENT_MANIFEST;
    window.ASTERIA_CRAFTING_COMPENDIUM={
      itemClassTable:ITEM_CLASSES,itemQualityTable:ITEM_QUALITIES,craftTierTable:CRAFT_TIERS,potionStrengthTable:POTION_STRENGTH,potionLevelTable:POTION_LEVEL,soulStoneRanks:SOUL_STONE_RANKS
    };
  }
  function patchGMSystems(){
    try{ if(Array.isArray(asteriaGMSystems)&&!asteriaGMSystems.find(s=>s.id==='crafting')) asteriaGMSystems.splice(Math.max(0,asteriaGMSystems.findIndex(s=>s.id==='rewards')+1),0,{id:'crafting',label:'Crafting',hint:'Projects, approvals, materials, item creation'}); }catch(e){}
  }
  function installAll(){patchGMSystems(); installCompendiumCraftingTables(); installPlayerCraftingPanel(); installGMCraftingPanel(); renderCraftingPanels(); updateCraftPreview(); const b=document.querySelector('.version-badge'); if(b)b.textContent=VERSION; if(typeof applyGMSystemPanel==='function')applyGMSystemPanel();}
  window.AsteriaViewHooks?.afterPlayerLoad('crafting-system', () => installAll());
  window.AsteriaViewHooks?.afterGMRender('crafting-system', () => installAll());
  window.AsteriaViewHooks?.afterView('crafting-system', 'overview', () => installAll());
  document.addEventListener('DOMContentLoaded',()=>setTimeout(installAll,700));
  window.renderCraftingPanels=renderCraftingPanels;
})();

/* =====================================================
   Asteria v1.7.2.9 — Material System v1
   Fully integrated into Item System, Crafting Pipeline, Inventory, Shops/Loot, GM Panel, Player Dashboard, Session Log.
   ===================================================== */
(function(){
  const VERSION='v1.7.3.5.9 • Unusual Metal Expansion';
  const STORE='asteriaMaterialSystemV1';
  const ITEM_CLASSES=['Common','Uncommon','Unusual','Rare','Epic','Mythic','Legendary','Relic'];
  const ENCHANTMENT_RANKS={
    I:'Rank I — Weak',II:'Rank II — Minor',III:'Rank III — Greater',IV:'Rank IV — Strengthened',V:'Rank V — Enhanced',VI:'Rank VI — Superior',VII:'Rank VII — Grand',VIII:'Rank VIII — World'
  };
  const CLASS_COLOURS={Common:'#8b8f98',Uncommon:'#22c55e',Unusual:'#3b82f6',Rare:'#ef4444',Epic:'#f97316',Mythic:'#a855f7',Legendary:'#f5c542',Relic:'#d6f6ff'};
  const MATERIAL_TYPES=['Metal','Wood','Cloth','Crystal','Essence','Organic','Stone','Hybrid'];
  const AFFINITIES=['Fire','Frost','Storm','Earth','Void','Light','Shadow','Water','Life','Death','Blood','Chaos','Eldritch','Fae','Fate','Space','Spirit','Time','Abyssal','Mana Flow'];
  const DEFAULT_MATERIALS={
    iron:{id:'iron',name:'Iron',description:'Reliable common metal used for everyday weapons, armour, tools, and fittings.',itemClass:'Common',materialType:'Metal',hardness:3,durability:1,weight:1.1,flexibility:'Low',conductivity:'Physical High / Magical Low',craftMod:0,requiredRank:'Initiate',compatible:['Weapons','Armour','Tools','Shields'],refinement:true,processing:'Refined',maxEnchantRank:'II',affinity:['Earth'],magicalCapacity:2,stability:'High',runes:true,runeLimit:1,soulAllowed:['Poor','Weak','Basic'],soulMinimum:'Poor',risk:'Low',failure:'Material loss',baseValue:5,rarityWeight:60,regions:'Most settled regions',shopTier:'Common smiths and outfitters',sources:'Mines, salvaged arms, blacksmith stock',lore:'Iron is trusted because it is honest. It bends before it betrays.'},
    steel:{id:'steel',name:'Steel',description:'Refined iron alloy with strong balance between hardness, durability, and cost.',itemClass:'Uncommon',materialType:'Metal',hardness:4,durability:2,weight:1,flexibility:'Medium',conductivity:'Physical High / Magical Medium',craftMod:1,requiredRank:'Apprentice',compatible:['Weapons','Armour','Tools','Shields'],refinement:true,processing:'Refined',maxEnchantRank:'III',affinity:['Earth','Storm'],magicalCapacity:3,stability:'High',runes:true,runeLimit:2,soulAllowed:['Weak','Basic','Common'],soulMinimum:'Weak',risk:'Low',failure:'Material loss',baseValue:15,rarityWeight:45,regions:'Cities, militaries, trade roads',shopTier:'Professional smiths',sources:'Smiths, armouries, military contracts',lore:'Steel marks the boundary between village craft and professional war.'},
    silverwood:{id:'silverwood',name:'Silverwood',description:'Pale living timber that holds enchantments without losing its natural flexibility.',itemClass:'Rare',materialType:'Wood',hardness:3,durability:1,weight:.7,flexibility:'High',conductivity:'Physical Medium / Magical High',craftMod:2,requiredRank:'Journeyman',compatible:['Staves','Bows','Wands','Foci','Light Shields'],refinement:true,processing:'Treated',maxEnchantRank:'V',affinity:['Life','Light','Fae','Spirit'],magicalCapacity:6,stability:'High',runes:true,runeLimit:3,soulAllowed:['Common','Luminous','Brilliant'],soulMinimum:'Common',risk:'Medium',failure:'Null result',baseValue:120,rarityWeight:12,regions:'Sacred groves, fae-touched forests',shopTier:'Rare magical woodworkers',sources:'Ancient trees, druidic rewards, fae markets',lore:'A branch of Silverwood remembers every sunrise that ever warmed it.'},
    mythril:{id:'mythril',name:'Mythril',description:'Light, bright metal prized for mana flow, flexibility, and high enchantment potential.',itemClass:'Epic',materialType:'Metal',hardness:6,durability:4,weight:.55,flexibility:'Medium-High',conductivity:'Physical High / Magical Very High',craftMod:4,requiredRank:'Adept',compatible:['Weapons','Armour','Foci','Runic Frames','Artifice'],refinement:true,processing:'Enchanted Base',maxEnchantRank:'VI',affinity:['Mana Flow','Light','Storm','Space'],magicalCapacity:8,stability:'Medium',runes:true,runeLimit:4,soulAllowed:['Luminous','Brilliant','Special'],soulMinimum:'Luminous',risk:'High',failure:'Explosion',baseValue:900,rarityWeight:4,regions:'Deep leyline veins, fallen star seams',shopTier:'High arcane merchants only',sources:'Leyline mines, major quest rewards, elite shops',lore:'Mythril does not merely conduct magic; it invites it to sing.'},
    dragonbone:{id:'dragonbone',name:'Dragonbone',description:'Dense organic material carrying ancestral elemental memory and predatory resilience.',itemClass:'Mythic',materialType:'Organic',hardness:6,durability:5,weight:.85,flexibility:'Medium',conductivity:'Physical High / Magical High',craftMod:5,requiredRank:'Master',compatible:['Weapons','Armour','Foci','Talismans','Relic Frames'],refinement:true,processing:'Treated',maxEnchantRank:'VII',affinity:['Fire','Frost','Storm','Earth'],magicalCapacity:9,stability:'Volatile',runes:true,runeLimit:4,soulAllowed:['Brilliant','Special','Resplendent'],soulMinimum:'Brilliant',risk:'Severe',failure:'Mutation',baseValue:3500,rarityWeight:2,regions:'Dragon lairs, ancient battlefields',shopTier:'Black market or royal vault',sources:'Dragon encounters, mythic hunts, sovereign rewards',lore:'Dragonbone remembers the sky, the flame, and the arrogance of kings.'},
    voidglass:{id:'voidglass',name:'Voidglass',description:'Black reflective crystal that drinks light and stores unstable abyssal pressure.',itemClass:'Legendary',materialType:'Crystal',hardness:5,durability:2,weight:.9,flexibility:'Brittle',conductivity:'Physical Low / Magical Extreme',craftMod:6,requiredRank:'Grandmaster',compatible:['Foci','Daggers','Relic Cores','Arcane Lenses'],refinement:true,processing:'Enchanted Base',maxEnchantRank:'VIII',affinity:['Void','Shadow','Abyssal','Space'],magicalCapacity:11,stability:'Volatile',runes:true,runeLimit:5,soulAllowed:['Special','Resplendent'],soulMinimum:'Special',risk:'Severe',failure:'Corruption',baseValue:9000,rarityWeight:1,regions:'Shattered Zones, void scars, forbidden vaults',shopTier:'Not normally sold',sources:'Boss rewards, Shattered Zone discoveries, GM events',lore:'Voidglass shows your reflection a heartbeat before you make it.'},
    reliccore:{id:'reliccore',name:'Relic Core',description:'World-defining material fragment capable of holding Rank VIII enchantment structures.',itemClass:'Relic',materialType:'Hybrid',hardness:8,durability:7,weight:1.3,flexibility:'Variable',conductivity:'Physical Unknown / Magical World-Class',craftMod:8,requiredRank:'Grandmaster',compatible:['Relics','World Items','Unique Foci','Legendary Constructs'],refinement:true,processing:'Enchanted Base',maxEnchantRank:'VIII',affinity:['Fate','Time','Space','Eldritch','Spirit'],magicalCapacity:14,stability:'Volatile',runes:true,runeLimit:6,soulAllowed:['Resplendent'],soulMinimum:'Resplendent',risk:'Extreme',failure:'Corruption',baseValue:50000,rarityWeight:.1,regions:'GM-level events only',shopTier:'Never sold normally',sources:'Shattered Zone anchors, divine bargains, world events',lore:'A Relic Core is not found. It is survived.'},
    'antimony-ore':{"id": "antimony-ore", "name": "Antimony Ore", "description": "Antimony Ore is a brittle, crystalline metal-bearing ore that enhances hardness and structural integrity when alloyed. It is rarely used alone but is critical in reinforcing softer metals.  ---", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Antimony Ingot", "refinementRatio": "4:1", "hardness": 2, "durability": 0, "weight": 0.8, "flexibility": "Low", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "I", "affinity": ["Light", "Mana Flow", "Earth"], "magicalCapacity": 1, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "3 Marks", "rarityWeight": 80, "regions": "Common mining regions, smithing settlements, trade stock", "shopTier": "Mining suppliers, smiths, material merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock", "lore": "Known as the *“Bone of the Earth,”* antimony was believed by ancient smiths to give metals their “spine.” While fragile in isolation, it grants resilience to those it strengthens.  ---", "traits": "- Brittle and unstable in raw form  \n- Breaks easily under stress  \n- Essential for strengthening alloys  \n- Requires careful refinement  \n\n---", "refinementNotes": "- Smelts into: [[Antimony Ingot]]\n- Ratio: 4 Ore → 1 Ingot\n- Notes: Fragile structure leads to material loss if overheated\n\n---", "alloyUse": "- [[Pewter Ingot]]\n- Future reinforced alloys\n\n---", "enchantmentUse": "- Slightly improves structural stability of enchanted items  \n- Helps prevent deformation under magical stress  \n\n---", "quote": "It does not endure — it ensures that others do."},
    'copper-ore':{"id": "copper-ore", "name": "Copper Ore", "description": "Copper Ore contains trace conductive veins that respond strongly to heat and energy. When refined, it produces a metal highly suited for elemental channeling and early enchantment work.  ---", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Copper Ingot", "refinementRatio": "4:1", "hardness": 2, "durability": 0, "weight": 0.8, "flexibility": "Low", "conductivity": "Physical Medium / Magical Medium", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "II", "affinity": ["Fire", "Earth"], "magicalCapacity": 2, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "2 Marks", "rarityWeight": 80, "regions": "Common mining regions, smithing settlements, trade stock", "shopTier": "Mining suppliers, smiths, material merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock", "lore": "Known as the *“First Flame Ore,”* copper was the first material mortals learned to draw from the earth and shape with fire. It represents the birth of craft and the beginning of all metallurgy.  ---", "traits": "- Easily mined and refined  \n- High impurity content → refinement loss  \n- Strong elemental conductivity (Fire / Lightning)  \n- Core material for early crafting systems  \n\n---", "refinementNotes": "- Smelts into: [[Copper Ingot]]\n- Ratio: 4 Ore → 1 Ingot\n- Notes: Standard impurity loss during smelting\n\n---", "alloyUse": "- [[Bronze Ingot]]\n- [[Brass Ingot]]\n\n---", "enchantmentUse": "- Enhances low-tier elemental enchantments  \n- Improves mana flow in crafted items  \n\n---", "quote": "From the earth’s spark, all craft begins."},
    'gold-ore':{"id": "gold-ore", "name": "Gold Ore", "description": "Gold Ore is rich in magical conductivity, making it one of the most valuable materials for enchantment despite its softness.  ---", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Gold Ingot", "refinementRatio": "4:1", "hardness": 2, "durability": 0, "weight": 1.0, "flexibility": "Low", "conductivity": "Physical Low / Magical High", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "IV", "affinity": ["Light", "Celestial", "Mana Flow", "Earth"], "magicalCapacity": 4, "stability": "High", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Medium", "failure": "Material loss", "baseValue": "10 Marks", "rarityWeight": 80, "regions": "Common mining regions, smithing settlements, trade stock", "shopTier": "Mining suppliers, smiths, material merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock", "lore": "Known as the *“Tears of the Dawn,”* gold is believed to be crystallised sunlight buried within the earth.  ---", "traits": "- Rare and valuable  \n- Soft and easily refined  \n- Highly magical  \n\n---", "refinementNotes": "- Smelts into: [[Gold Ingot]]\n- Ratio: 4 Ore → 1 Ingot\n\n---", "alloyUse": "- [[Sunsteel]] (future)\n- Reinforcement alloys\n\n---", "enchantmentUse": "- Exceptional for divine and celestial magic  \n- Stabilises high-tier enchantments  \n\n---", "quote": "Gold does not fade — it remembers the light."},
    'iron-ore':{"id": "iron-ore", "name": "Iron Ore", "description": "Iron Ore is dense and impurity-rich, requiring proper smelting to unlock its strength. Once refined, it forms the backbone of most weapons and armor.  ---", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Iron Ingot", "refinementRatio": "4:1", "hardness": 3, "durability": 1, "weight": 1.0, "flexibility": "Low", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "I", "affinity": ["Mana Flow", "Earth"], "magicalCapacity": 1, "stability": "High", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "3 Marks", "rarityWeight": 80, "regions": "Common mining regions, smithing settlements, trade stock", "shopTier": "Mining suppliers, smiths, material merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock", "lore": "Called the *“Blood of the World,”* iron runs deep beneath the earth. Civilizations rose and fell by their ability to mine and shape it.  ---", "traits": "- Dense and widely available  \n- Requires stronger heat to refine  \n- Reliable base material for combat equipment  \n\n---", "refinementNotes": "- Smelts into: [[Iron Ingot]]\n- Ratio: 4 Ore → 1 Ingot\n- Notes: Requires stable heat for proper refinement\n\n---", "alloyUse": "- [[Steel Ingot]]\n\n---", "enchantmentUse": "- Neutral magical properties  \n- Supports basic rune and enchantment structures  \n\n---", "quote": "From stone and fire, strength is born."},
    'lead-ore':{"id": "lead-ore", "name": "Lead Ore", "description": "Lead Ore absorbs magical energy, making it valuable for anti-magic crafting and containment.  ---", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Lead Ingot", "refinementRatio": "4:1", "hardness": 3, "durability": 1, "weight": 1.4, "flexibility": "Low", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "I", "affinity": ["Mana Flow", "Void"], "magicalCapacity": 1, "stability": "High", "runes": false, "runeLimit": 0, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "2 Marks", "rarityWeight": 80, "regions": "Common mining regions, smithing settlements, trade stock", "shopTier": "Mining suppliers, smiths, material merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock", "lore": "Called the *“Veil Stone,”* lead is said to silence magic itself.  ---", "traits": "- Dense and heavy  \n- Toxic if mishandled  \n- Used in containment crafting  \n\n---", "refinementNotes": "- Smelts into: [[Lead Ingot]]\n- Ratio: 4 Ore → 1 Ingot\n\n---", "alloyUse": "- Anti-magic alloys (future)\n\n---", "enchantmentUse": "- Suppresses magic  \n- Blocks magical detection  \n\n---", "quote": "Where magic ends, lead remains."},
    'nickel-ore':{"id": "nickel-ore", "name": "Nickel Ore", "description": "Nickel Ore contains balanced metallic properties that allow it to stabilise and reinforce other materials when refined and alloyed. It is rarely used alone but is essential in improving durability and magical consistency.  ---", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Nickel Ingot", "refinementRatio": "4:1", "hardness": 3, "durability": 1, "weight": 1.0, "flexibility": "Low", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "I", "affinity": ["Mana Flow"], "magicalCapacity": 1, "stability": "High", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "3 Marks", "rarityWeight": 80, "regions": "Common mining regions, smithing settlements, trade stock", "shopTier": "Mining suppliers, smiths, material merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock", "lore": "Known as the *“Silent Binder,”* nickel was long overlooked until master smiths discovered its ability to unify stronger metals without weakening them. It is said to be the metal that prevents failure before it happens.  ---", "traits": "- Moderate density and durability  \n- Resistant to corrosion  \n- Stabilises alloy structures  \n- Commonly found near iron deposits  \n\n---", "refinementNotes": "- Smelts into: [[Nickel Ingot]]\n- Ratio: 4 Ore → 1 Ingot\n- Notes: Stable refinement with low material loss\n\n---", "alloyUse": "- Reinforcement alloys\n- Stability-focused metals\n\n---", "enchantmentUse": "- Improves enchantment stability  \n- Reduces failure or backlash in enchanted items  \n\n---", "quote": "It is not seen in the blade — but without it, the blade fails."},
    'silver-ore':{"id": "silver-ore", "name": "Silver Ore", "description": "Silver Ore carries strong spiritual resonance, making it ideal for crafting anti-entity and divine-aligned materials.  ---", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Silver Ingot", "refinementRatio": "4:1", "hardness": 3, "durability": 1, "weight": 0.8, "flexibility": "Low", "conductivity": "Physical Low / Magical High", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "III", "affinity": ["Light", "Celestial", "Spirit", "Mana Flow", "Earth"], "magicalCapacity": 3, "stability": "High", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Medium", "failure": "Material loss", "baseValue": "6 Marks", "rarityWeight": 80, "regions": "Common mining regions, smithing settlements, trade stock", "shopTier": "Mining suppliers, smiths, material merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock", "lore": "Known as *“Moon-Touched Stone,”* silver is said to form where celestial light touches the earth.  ---", "traits": "- Rare compared to other common metals  \n- High magical purity  \n- Used in sacred crafting  \n\n---", "refinementNotes": "- Smelts into: [[Silver Ingot]]\n- Ratio: 4 Ore → 1 Ingot\n\n---", "alloyUse": "- Often combined with stronger metals for weapons\n\n---", "enchantmentUse": "- Strong affinity with Light and Spirit magic  \n- Effective against undead and cursed beings  \n\n---", "quote": "Where light lingers, silver forms."},
    'tin-ore':{"id": "tin-ore", "name": "Tin Ore", "description": "Tin Ore is a soft, low-density material with minimal standalone use, but it plays a crucial role in stabilising alloys and enabling stronger metal compositions.  ---", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Tin Ingot", "refinementRatio": "4:1", "hardness": 2, "durability": 0, "weight": 0.8, "flexibility": "Low", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "I", "affinity": ["Earth"], "magicalCapacity": 1, "stability": "High", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "1 Marks", "rarityWeight": 80, "regions": "Common mining regions, smithing settlements, trade stock", "shopTier": "Mining suppliers, smiths, material merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock", "lore": "Called the *“Silent Catalyst,”* tin lacks strength but enables greatness in others. Entire ages of advancement depended on its quiet presence in alloy crafting.  ---", "traits": "- Very soft and easy to refine  \n- High impurity loss during smelting  \n- Essential for alloy creation  \n- Common training material  \n\n---", "refinementNotes": "- Smelts into: [[Tin Ingot]]\n- Ratio: 4 Ore → 1 Ingot\n- Notes: High loss due to impurities\n\n---", "alloyUse": "- [[Bronze Ingot]]\n\n---", "enchantmentUse": "- Minimal direct use  \n- Stabilises enchantments in alloys  \n\n---", "quote": "It does not shine — but it makes others stronger."},
    'zinc-ore':{"id": "zinc-ore", "name": "Zinc Ore", "description": "Zinc Ore is a reactive and volatile material that plays a critical role in alloy creation. While weak on its own, it enhances flexibility, resonance, and thermal response when combined with other metals.  ---", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Zinc Ingot", "refinementRatio": "4:1", "hardness": 2, "durability": 0, "weight": 0.8, "flexibility": "Low", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "I", "affinity": ["Earth"], "magicalCapacity": 1, "stability": "High", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "2 Marks", "rarityWeight": 80, "regions": "Common mining regions, smithing settlements, trade stock", "shopTier": "Mining suppliers, smiths, material merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock", "lore": "Known as the *“Breath of the Forge,”* zinc was discovered not for its strength, but for how it transformed other metals. Ancient artificers prized it for its ability to “awaken” dormant properties within alloys.  ---", "traits": "- Low structural strength  \n- Highly reactive when heated  \n- Vaporises at high temperatures if mishandled  \n- Essential for alloy crafting  \n\n---", "refinementNotes": "- Smelts into: [[Zinc Ingot]]\n- Ratio: 4 Ore → 1 Ingot\n- Notes: Requires controlled heat to prevent material loss\n\n---", "alloyUse": "- [[Brass Ingot]]\n\n---", "enchantmentUse": "- Minimal direct use  \n- Enhances resonance in alloys  \n\n---", "quote": "It is not the strength of zinc, but what it awakens in others."},
    'aluminum-ore':{"id": "aluminum-ore", "name": "Aluminum Ore", "description": "Aluminum Ore is unusually light and responsive to energy, making it valuable for crafting materials focused on speed, movement, and agility.\n\n---", "itemClass": "Uncommon", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Aluminum Ingot", "refinementRatio": "4:1", "hardness": 2, "durability": 0, "weight": 0.45, "flexibility": "Medium", "conductivity": "Physical Medium / Magical High", "craftMod": 1, "requiredRank": "Initiate", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "III", "affinity": ["Air", "Storm", "Mana Flow"], "magicalCapacity": 4, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic", "Common", "Luminous"], "soulMinimum": "Weak", "risk": "Medium", "failure": "Material loss", "baseValue": "4 Marks", "rarityWeight": 45, "regions": "Uncommon and unusual mining regions, specialised material merchants, quest rewards", "shopTier": "Material merchants, specialised smiths, arcane suppliers", "sources": "Ore veins, mining nodes, quest rewards, shop stock, region-specific deposits", "lore": "Often called *“Sky Ore,”* aluminum is believed to form in regions touched by high winds or lightning storms. Ancient artificers sought it to craft tools that defied weight and gravity.\n\n---", "traits": "- Extremely lightweight compared to other ores  \n- Difficult to extract without loss due to fragility  \n- Highly resistant to corrosion  \n- Found in high-altitude or storm-rich regions  \n\n---", "refinementNotes": "- Smelts into: [[Aluminum Ingot]]\n- Ratio: 4 Ore → 1 Ingot\n- Notes: Requires controlled heat to prevent material degradation\n\n---", "alloyUse": "- Lightweight alloys (future)\n\n---", "enchantmentUse": "- Strong affinity with Air and Lightning magic  \n- Enhances speed and movement-based effects  \n\n---", "quote": "Light as wind, fleeting as a storm."},
    'chromium-ore':{"id": "chromium-ore", "name": "Chromium Ore", "description": "Chromium Ore yields a highly stable metal known for its resistance to corrosion and structural reinforcement. It is essential in crafting advanced alloys that require durability and longevity.\n\n---", "itemClass": "Uncommon", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Chromium Ingot", "refinementRatio": "4:1", "hardness": 5, "durability": 2, "weight": 1.0, "flexibility": "Low", "conductivity": "Physical Very High / Magical Medium", "craftMod": 1, "requiredRank": "Apprentice", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "III", "affinity": ["Earth", "Mana Flow"], "magicalCapacity": 3, "stability": "High", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic", "Common", "Luminous"], "soulMinimum": "Weak", "risk": "Low", "failure": "Material loss", "baseValue": "6 Marks", "rarityWeight": 40, "regions": "Uncommon and unusual mining regions, specialised material merchants, quest rewards", "shopTier": "Material merchants, specialised smiths, arcane suppliers", "sources": "Ore veins, mining nodes, quest rewards, shop stock, region-specific deposits", "lore": "Known as the *“Shield Vein”* of the earth, chromium was first discovered in mineral deposits untouched by rust or decay. Smiths quickly realised its value — not for power, but for endurance.\n\n---", "traits": "- Highly resistant to corrosion and environmental damage  \n- Reinforces structural integrity of alloys  \n- Stable during high-temperature refinement  \n- Often found near iron-rich deposits  \n\n---", "refinementNotes": "- Smelts into: [[Chromium Ingot]]\n- Ratio: 4 Ore → 1 Ingot\n- Notes: Produces a clean, stable refined metal with minimal impurity loss\n\n---", "alloyUse": "- [[High Steel Ingot]]\n\n---", "enchantmentUse": "- Improves durability of enchanted items  \n- Helps prevent degradation under repeated magical use  \n\n---", "quote": "It does not break — it prevents breaking."},
    'platinum-ore':{"id": "platinum-ore", "name": "Platinum Ore", "description": "Platinum Ore contains highly pure metallic veins that conduct magical energy with exceptional stability, making it one of the most valuable refinement materials for enchantment-focused crafting.\n\n---", "itemClass": "Uncommon", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Platinum Ingot", "refinementRatio": "4:1", "hardness": 4, "durability": 2, "weight": 1.0, "flexibility": "Low", "conductivity": "Physical Medium / Magical Very High", "craftMod": 2, "requiredRank": "Apprentice", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "IV", "affinity": ["Light", "Spirit", "Mana Flow"], "magicalCapacity": 6, "stability": "High", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic", "Common", "Luminous"], "soulMinimum": "Weak", "risk": "Medium", "failure": "Null result", "baseValue": "8 Marks", "rarityWeight": 30, "regions": "Uncommon and unusual mining regions, specialised material merchants, quest rewards", "shopTier": "Material merchants, specialised smiths, arcane suppliers", "sources": "Ore veins, mining nodes, quest rewards, shop stock, region-specific deposits", "lore": "Known as the *“Metal of Divinity,”* platinum is said to form where celestial energy seeps into the earth. Some believe it is the crystallised essence of fallen stars.\n\n---", "traits": "- High purity with minimal impurities  \n- Extremely difficult to extract and refine  \n- Resistant to corruption and decay  \n- Found in deep or magically saturated environments  \n\n---", "refinementNotes": "- Smelts into: [[Platinum Ingot]]\n- Ratio: 4 Ore → 1 Ingot\n- Notes: Requires advanced or stable forge conditions\n\n---", "alloyUse": "- High-tier alloys (future)\n\n---", "enchantmentUse": "- Strong affinity with Light and Celestial magic  \n- Maintains enchantment stability under heavy use  \n\n---", "quote": "From the heavens it fell — and to the heavens it answers."},
    'cobalt-ore':{"id": "cobalt-ore", "name": "Cobalt Ore", "description": "Cobalt Ore is infused with latent arcane energy, allowing it to conduct and amplify mana when refined. It serves as a key material for enchantment-focused metals and arcane equipment.\n\n---", "itemClass": "Unusual", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Cobalt Ingot", "refinementRatio": "4:1", "hardness": 5, "durability": 2, "weight": 1.0, "flexibility": "Medium", "conductivity": "Physical High / Magical High", "craftMod": 2, "requiredRank": "Journeyman", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "IV", "affinity": ["Storm", "Frost", "Mana Flow"], "magicalCapacity": 6, "stability": "High", "runes": true, "runeLimit": 2, "soulAllowed": ["Weak", "Basic", "Common", "Luminous", "Brilliant"], "soulMinimum": "Basic", "risk": "Medium", "failure": "Material loss", "baseValue": "12 Marks", "rarityWeight": 20, "regions": "Uncommon and unusual mining regions, specialised material merchants, quest rewards", "shopTier": "Material merchants, specialised smiths, arcane suppliers", "sources": "Ore veins, mining nodes, quest rewards, shop stock, region-specific deposits", "lore": "Deep within storm-touched mountains, cobalt forms where lightning and stone meet. Ancient smiths believed it to be a “sleeping metal,” awakened only through magic and heat.\n\n---", "traits": "- Naturally conductive to magical energy  \n- Stable under high-temperature refinement  \n- Resistant to arcane degradation  \n- Often found near lightning-rich or mana-dense regions  \n\n---", "refinementNotes": "- Smelts into: [[Cobalt Ingot]]\n- Ratio: 4 Ore → 1 Ingot\n- Notes: Responds well to magically stabilised forges\n\n---", "alloyUse": "- Advanced enchantment alloys (future)\n\n---", "enchantmentUse": "- Enhances Lightning and Ice magic  \n- Improves mana flow in crafted items  \n\n---", "quote": "Within the stone sleeps the storm."},
    'thorium-ore':{"id": "thorium-ore", "name": "Thorium Ore", "description": "Thorium Ore radiates stored arcane energy, making it highly reactive during refinement. When properly processed, it produces a metal capable of storing and releasing magical power.\n\n---", "itemClass": "Unusual", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Thorium Ingot", "refinementRatio": "4:1", "hardness": 6, "durability": 3, "weight": 1.2, "flexibility": "Low", "conductivity": "Physical High / Magical Very High", "craftMod": 3, "requiredRank": "Adept", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "V", "affinity": ["Light", "Storm", "Mana Flow"], "magicalCapacity": 7, "stability": "Volatile", "runes": true, "runeLimit": 2, "soulAllowed": ["Weak", "Basic", "Common", "Luminous", "Brilliant"], "soulMinimum": "Basic", "risk": "High", "failure": "Explosion", "baseValue": "15 Marks", "rarityWeight": 15, "regions": "Uncommon and unusual mining regions, specialised material merchants, quest rewards", "shopTier": "Material merchants, specialised smiths, arcane suppliers", "sources": "Ore veins, mining nodes, quest rewards, shop stock, region-specific deposits", "lore": "Forged in the deep veins of the world where lightning once struck the earth’s core, thorium is known as the *“Metal of Living Light.”* It is both revered and feared for its raw power.\n\n---", "traits": "- Emits low levels of magical radiation  \n- Extremely dense and heat-resistant  \n- Difficult to mine and handle safely  \n- Requires skilled refinement to stabilise  \n\n---", "refinementNotes": "- Smelts into: [[Thorium Ingot]]\n- Ratio: 4 Ore → 1 Ingot\n- Notes: Requires controlled environment to prevent instability\n\n---", "alloyUse": "- High-tier magical alloys (future)\n\n---", "enchantmentUse": "- Strong affinity with Radiant and Arcane magic  \n- Stores residual magical energy  \n\n---", "quote": "Power sleeps in its veins — waiting to be awakened."},
    "bismuth-ore":{"id": "bismuth-ore", "name": "Bismuth Ore", "description": "Bismuth Ore forms in unstable crystalline structures that react unpredictably to magical and environmental input. It carries volatile energy that can either amplify or distort magical effects.\n\n---", "itemClass": "Rare", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Bismuth Ingot", "refinementRatio": "4:1", "hardness": 2, "durability": 0, "weight": 0.8, "weightClass": "Light", "flexibility": "Medium", "conductivity": "Physical High / Magical High", "craftMod": 3, "requiredRank": "Adept", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "V", "affinity": ["Chaos", "Mana Flow"], "magicalCapacity": 8, "stability": "Volatile", "runes": true, "runeLimit": 2, "soulAllowed": ["Weak", "Basic", "Common", "Luminous", "Brilliant"], "soulMinimum": "Common", "risk": "High", "failure": "Explosion", "baseValue": "26 Marks", "rarityWeight": 10, "regions": "Rare magical deposits, restricted mines, specialised material merchants, quest rewards", "shopTier": "Specialised smiths, arcane suppliers, restricted merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock, region-specific deposits", "lore": "Bismuth is born in places where magic fractures reality — wild magic zones, broken ley lines, and unstable rifts. Its crystalline patterns constantly shift, reflecting a world that refuses to remain still.", "appearance": "Bismuth Ore forms in jagged, geometric clusters with sharp, stepped edges that resemble fractured crystal structures. Its surface displays shifting iridescent colours — purples, blues, greens, and golds — that change depending on the angle of light.\n\nThe edges of the ore appear unstable, subtly warping or realigning when viewed from different perspectives, as if the structure is never fully fixed.\n\n---", "traits": "- Crystalline metallic structure  \n- Unstable under sustained stress  \n- Difficult to refine without loss  \n- Found in high-risk magical environments", "refinementNotes": "- Smelts into: [[Bismuth Ingot]]  \n- Ratio: 4 Ore → 1 Ingot  \n- Notes: Refinement may produce unstable or imperfect ingots if not carefully controlled", "alloyUse": "- Chaos-based alloys (future)", "enchantmentUse": "- Very high affinity with volatile and chaotic magic  \n- Amplifies power but reduces stability  \n- Can cause unpredictable magical interactions", "quote": "It does not obey — it reacts."},
    "dark-silver-ore":{"id": "dark-silver-ore", "name": "Dark Silver Ore", "description": "Dark Silver Ore is infused with the primordial essence of **Dark itself** — not death, but absence, depth, and shadow. It absorbs light and distorts magical energy, forming a metal that thrives in low-light environments.\n\n---", "itemClass": "Rare", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Dark Silver Ingot", "refinementRatio": "4:1", "hardness": 5, "durability": 2, "weight": 0.8, "weightClass": "Light", "flexibility": "Medium", "conductivity": "Physical High / Magical High", "craftMod": 3, "requiredRank": "Adept", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "V", "affinity": ["Shadow", "Light", "Mana Flow"], "magicalCapacity": 8, "stability": "Medium", "runes": true, "runeLimit": 2, "soulAllowed": ["Weak", "Basic", "Common", "Luminous", "Brilliant"], "soulMinimum": "Common", "risk": "Medium", "failure": "Material loss", "baseValue": "20 Marks", "rarityWeight": 10, "regions": "Rare magical deposits, restricted mines, specialised material merchants, quest rewards", "shopTier": "Specialised smiths, arcane suppliers, restricted merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock, region-specific deposits", "lore": "Dark Silver was not mined — it was *formed*. In places where light was stripped away completely, the essence of Dark condensed into physical form. It is neither evil nor corrupt, but a reflection of balance — the quiet counterpart to Light.", "appearance": "Dark Silver Ore appears as smooth, shadow-toned metal veined through stone, with a muted, almost matte finish that absorbs surrounding light. Its surface reflects very little, giving it a depth that feels more like a void than a solid material.\n\nIn low light, faint ripples of darker shade seem to move across the ore, as though shadows are pooling and shifting within it rather than around it.\n\n---", "traits": "- Absorbs ambient light and magical energy  \n- Strengthens in darkness and shadow-rich environments  \n- Naturally dampens radiant and light-based effects  \n- Stable during refinement despite its unusual origin", "refinementNotes": "- Smelts into: [[Dark Silver Ingot]]  \n- Ratio: 4 Ore → 1 Ingot  \n- Notes: Best refined in low-light or magically controlled environments", "alloyUse": "- Dark-aligned alloys (future)", "enchantmentUse": "- High affinity with **Dark** magic  \n- Supports shadow manipulation and concealment effects  \n- Reduces stability of Light-based enchantments", "quote": "It is not the absence of light — it is what remains when light leaves."},
    "moonstone-ore":{"id": "moonstone-ore", "name": "Moonstone Ore", "description": "Moonstone Ore carries lunar resonance, shifting subtly in response to light cycles and magical presence. It stabilises and harmonises magical energy rather than amplifying or suppressing it.\n\n---", "itemClass": "Rare", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Moonstone Ingot", "refinementRatio": "4:1", "hardness": 5, "durability": 2, "weight": 0.8, "weightClass": "Light", "flexibility": "Medium", "conductivity": "Physical High / Magical High", "craftMod": 3, "requiredRank": "Adept", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "V", "affinity": ["Shadow", "Light", "Mana Flow"], "magicalCapacity": 8, "stability": "High", "runes": true, "runeLimit": 2, "soulAllowed": ["Weak", "Basic", "Common", "Luminous", "Brilliant"], "soulMinimum": "Common", "risk": "Medium", "failure": "Material loss", "baseValue": "24 Marks", "rarityWeight": 10, "regions": "Rare magical deposits, restricted mines, specialised material merchants, quest rewards", "shopTier": "Specialised smiths, arcane suppliers, restricted merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock, region-specific deposits", "lore": "Moonstone forms where celestial light meets the physical world in cycles — waxing and waning with unseen forces. It is said to reflect not just the moon above, but the balance between Light and Dark within the world itself.", "appearance": "Moonstone Ore appears as pale, semi-translucent stone veined with soft silver and faint blue hues. It emits a gentle, diffused glow that subtly brightens and dims, as if responding to an unseen cycle.\n\nWithin the ore, faint patterns resembling drifting light or slow-moving ripples can be seen, giving the impression that the material is quietly alive with lunar energy.\n\n---", "traits": "- Responds to ambient light and magical cycles  \n- Stabilises fluctuating magical energy  \n- Maintains structural integrity under magical stress  \n- Often found in regions touched by celestial influence", "refinementNotes": "- Smelts into: [[Moonstone Ingot]]  \n- Ratio: 4 Ore → 1 Ingot  \n- Notes: Refinement is most stable under controlled or natural light cycles", "alloyUse": "- Celestial or arcane-balanced alloys (future)", "enchantmentUse": "- High affinity with **Celestial and Arcane** magic  \n- Stabilises multi-effect enchantments  \n- Reduces magical volatility", "quote": "It does not choose a side — it reflects them both."},
    "pure-silver-ore":{"id": "pure-silver-ore", "name": "Pure Silver Ore", "description": "Pure Silver Ore is infused with the essence of **Light itself** — not life, but clarity, purity, and illumination. It emits a faint glow and disrupts shadow and corruption.\n\n---", "itemClass": "Rare", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Pure Silver Ingot", "refinementRatio": "4:1", "hardness": 3, "durability": 1, "weight": 0.8, "weightClass": "Light", "flexibility": "Medium", "conductivity": "Physical High / Magical High", "craftMod": 3, "requiredRank": "Adept", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "V", "affinity": ["Light", "Shadow", "Mana Flow"], "magicalCapacity": 8, "stability": "Medium", "runes": true, "runeLimit": 2, "soulAllowed": ["Weak", "Basic", "Common", "Luminous", "Brilliant"], "soulMinimum": "Common", "risk": "High", "failure": "Corruption", "baseValue": "22 Marks", "rarityWeight": 10, "regions": "Rare magical deposits, restricted mines, specialised material merchants, quest rewards", "shopTier": "Specialised smiths, arcane suppliers, restricted merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock, region-specific deposits", "lore": "Unlike common silver, Pure Silver is not simply refined — it is *formed*. Where Light condenses into the physical world, veins of Pure Silver emerge, untouched by impurity. It is said to be the metal that Light chose to inhabit.", "appearance": "Pure Silver Ore appears as bright, pale metal veins running through stone, noticeably cleaner and more luminous than common silver. Its surface reflects light with a soft, steady glow, giving it an almost pristine, untouched quality.\n\nEven in low light, the ore maintains a faint brightness, as though holding onto light rather than reflecting it.\n\n---", "traits": "- Emits a faint glow in darkness  \n- Naturally repels corruption and shadow  \n- Sensitive to impurity during refinement  \n- Requires precise heat control to maintain purity", "refinementNotes": "- Smelts into: [[Pure Silver Ingot]]  \n- Ratio: 4 Ore → 1 Ingot  \n- Notes: Overheating reduces purity and effectiveness", "alloyUse": "- Light-aligned alloys (future)", "enchantmentUse": "- High affinity with **Light** magic  \n- Enhances purification and illumination effects  \n- Reduces effectiveness of Dark-aligned enchantments", "quote": "It does not shine — it reveals."},
    "quicksilver-ore":{"id": "quicksilver-ore", "name": "Quicksilver Ore", "description": "Quicksilver Ore appears to flow and ripple despite remaining solid. It reacts instantly to movement, temperature, and magical presence, making it one of the most responsive metals found in the world.\n\n---", "itemClass": "Rare", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Quicksilver Ingot", "refinementRatio": "4:1", "hardness": 3, "durability": 1, "weight": 0.55, "weightClass": "Very Light", "flexibility": "Medium", "conductivity": "Physical High / Magical High", "craftMod": 3, "requiredRank": "Adept", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "V", "affinity": ["Water", "Storm", "Mana Flow"], "magicalCapacity": 8, "stability": "Medium", "runes": true, "runeLimit": 2, "soulAllowed": ["Weak", "Basic", "Common", "Luminous", "Brilliant"], "soulMinimum": "Common", "risk": "Medium", "failure": "Material loss", "baseValue": "28 Marks", "rarityWeight": 10, "regions": "Rare magical deposits, restricted mines, specialised material merchants, quest rewards", "shopTier": "Specialised smiths, arcane suppliers, restricted merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock, region-specific deposits", "lore": "Quicksilver forms in regions where reality is unstable — areas touched by shifting leylines, arcane storms, or spatial distortion. It is said that the metal never chose a fixed state, existing between motion and stillness.\n\nAncient artificers believed it to be a “thinking metal,” capable of responding to the intent of its wielder before action is taken.\n\n---", "appearance": "Quicksilver Ore has a smooth, mirror-like surface that appears to ripple as if liquid, even when completely still. Light bends across it in unnatural ways, creating shifting reflections that never fully match the environment.\n\nWhen disturbed, the surface briefly “flows” before settling again, as though the metal is reacting to movement rather than being moved by it.\n\n---", "traits": "- Appears fluid but maintains a solid structure  \n- Extremely responsive to external stimuli  \n- Difficult to stabilise during mining and transport  \n- Found in magically unstable or high-energy regions  \n\n---", "refinementNotes": "- Smelts into: [[Quicksilver Ingot]]  \n- Ratio: 4 Ore → 1 Ingot  \n- Notes: Requires controlled refinement to prevent instability  \n\n---", "alloyUse": "- Adaptive alloys (future system)\n\n---", "enchantmentUse": "- High affinity with **Water** and **Air** essences  \n- Enhances:\n  - Flow-based movement  \n  - Speed and reaction effects  \n  - Adaptive enchantments", "quote": "It does not flow — it chooses to move."},
    "tungsten-ore":{"id": "tungsten-ore", "name": "Tungsten Ore", "description": "Tungsten Ore is one of the densest and most heat-resistant materials found in the mortal world. It provides unmatched structural strength but offers little natural affinity for magic.\n\n---", "itemClass": "Rare", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Tungsten Ingot", "refinementRatio": "4:1", "hardness": 6, "durability": 3, "weight": 1.3, "weightClass": "Heavy", "flexibility": "Low", "conductivity": "Physical Medium / Magical Medium", "craftMod": 3, "requiredRank": "Adept", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "V", "affinity": ["Mana Flow"], "magicalCapacity": 8, "stability": "Medium", "runes": true, "runeLimit": 2, "soulAllowed": ["Weak", "Basic", "Common", "Luminous", "Brilliant"], "soulMinimum": "Common", "risk": "Medium", "failure": "Material loss", "baseValue": "25 Marks", "rarityWeight": 10, "regions": "Rare magical deposits, restricted mines, specialised material merchants, quest rewards", "shopTier": "Specialised smiths, arcane suppliers, restricted merchants", "sources": "Ore veins, mining nodes, quest rewards, shop stock, region-specific deposits", "lore": "Deep within the earth, far below ordinary mining veins, tungsten forms under immense pressure and heat. Dwarven records call it *“The Bones of the World,”* a material that does not bend, yield, or forget.", "appearance": "Tungsten Ore appears as dark, dense rock threaded with dull grey metallic veins. Unlike most ores, it has very little shine, instead absorbing light and giving off a heavy, matte presence.\n\nThe metal within the stone looks compact and tightly packed, with almost no visible impurities, as if compressed under immense pressure deep within the earth.\n\n---", "traits": "- Extremely dense and heavy  \n- Highly resistant to heat and pressure  \n- Difficult to mine and refine  \n- Requires advanced or high-temperature forging methods", "refinementNotes": "- Smelts into: [[Tungsten Ingot]]  \n- Ratio: 4 Ore → 1 Ingot  \n- Notes: Requires extreme heat or specialised forge conditions", "alloyUse": "- High-density reinforcement alloys (future)", "enchantmentUse": "- Low affinity with magic  \n- Best used for physical durability over magical enhancement", "quote": "It was not made to move — only to endure."},
    "arricallium-ore":{"id": "arricallium-ore", "name": "Arricallium Ore", "description": "Arricallium Ore is a naturally occurring metal infused with raw energy, allowing it to conduct and stabilise magical flow with exceptional efficiency.", "itemClass": "Epic", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Arricallium Ingot", "refinementRatio": "4:1", "hardness": 5, "durability": 2, "weight": 0.9, "weightClass": "Medium-Light", "flexibility": "Medium", "conductivity": "Physical High / Magical High", "craftMod": 5, "requiredRank": "Master", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "VI", "affinity": ["Storm", "Fire", "Mana Flow"], "magicalCapacity": 10, "stability": "High", "runes": true, "runeLimit": 2, "soulAllowed": ["Basic", "Common", "Luminous", "Brilliant", "Special"], "soulMinimum": "Luminous", "risk": "High", "failure": "Material loss", "baseValue": "220–350 Marks (Restricted Trade)", "rarityWeight": 4, "regions": "Epic-grade deposits, restricted trade, leyline regions, GM rewards", "shopTier": "Restricted trade, high-tier guilds, royal vaults, GM approval", "sources": "Ore veins, mining nodes, quest rewards, shop stock, region-specific deposits", "lore": "Arricallium forms in areas where intense energy interacts with the natural world — often near leyline intersections, storm-scarred regions, or sites of magical convergence.\n\nUnlike most metals, it is born already attuned to energy, making it highly sought after by artificers and spellcasters.", "appearance": "Arricallium Ore appears as a dark metallic stone threaded with glowing veins of electric blue and faint orange light. These veins pulse intermittently, as if carrying energy through the material.\n\nWhen exposed to magical sources, the glow intensifies and spreads across the surface.", "traits": "- Naturally conducts magical energy  \n- Stable under magical strain  \n- Difficult to mine safely due to energy discharge  \n- Reacts to nearby magical activity", "refinementNotes": "- Smelts into: [[Arricallium Ingot]]  \n- Ratio: 4 Ore → 1 Ingot  \n- Requires energy-stabilised forge", "alloyUse": "", "enchantmentUse": "- High affinity with **Air** and **Fire**  \n- Enhances:\n  - Energy flow  \n  - Spellcasting stability  \n  - Channeling effects", "quote": "It does not hold power — it lets it flow.\"*v"},
    "duranium-ore":{"id": "duranium-ore", "name": "Duranium Ore", "description": "Duranium Ore is a dense, energy-reactive metal that forms in regions of extreme pressure and force. It naturally absorbs and stabilises incoming energy, making it highly resilient to both physical and environmental stress.", "itemClass": "Epic", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Duranium Ingot", "refinementRatio": "4:1", "hardness": 6, "durability": 3, "weight": 1.5, "weightClass": "Very Heavy", "flexibility": "Low", "conductivity": "Physical High / Magical High", "craftMod": 5, "requiredRank": "Master", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "VI", "affinity": ["Earth", "Storm", "Mana Flow"], "magicalCapacity": 10, "stability": "Volatile", "runes": true, "runeLimit": 2, "soulAllowed": ["Basic", "Common", "Luminous", "Brilliant", "Special"], "soulMinimum": "Luminous", "risk": "High", "failure": "Material loss", "baseValue": "250–380 Marks (Restricted Trade)", "rarityWeight": 4, "regions": "Epic-grade deposits, restricted trade, leyline regions, GM rewards", "shopTier": "Restricted trade, high-tier guilds, royal vaults, GM approval", "sources": "Ore veins, mining nodes, quest rewards, shop stock, region-specific deposits", "lore": "Duranium forms deep beneath the surface of the world or within areas of intense energy convergence. These environments compress and fuse energy into physical form, creating a metal that responds to force rather than resisting it.\n\nIt is rare and difficult to extract due to its density and reactive nature.", "appearance": "Duranium Ore appears as a dark grey metallic stone with faint, shifting patterns beneath its surface. These patterns move slowly, like energy being redistributed through the material.\n\nWhen struck, subtle ripples travel across the ore before fading.", "traits": "- Extremely dense and heavy  \n- Absorbs and redistributes energy  \n- Stable under high pressure and force  \n- Difficult to mine and transport", "refinementNotes": "- Smelts into: [[Duranium Ingot]]  \n- Ratio: 4 Ore → 1 Ingot  \n- Requires high-energy or pressure-stable forge", "alloyUse": "", "enchantmentUse": "- Moderate affinity with **Earth** and **Air**  \n- Enhances:\n  - Stability  \n  - Defensive effects  \n  - Energy control", "quote": "It does not break — it changes how the world strikes it."},
    "ebony-ore":{"id": "ebony-ore", "name": "Ebony Ore", "description": "Ebony Ore is a naturally occurring shadow-infused metal that absorbs light and ambient energy. It suppresses presence and reduces magical visibility, making it ideal for stealth and concealment.", "itemClass": "Epic", "materialType": "Metal", "materialForm": "Ore", "refinesInto": "Ebony Ingot", "refinementRatio": "4:1", "hardness": 5, "durability": 2, "weight": 1.0, "weightClass": "Medium", "flexibility": "Medium", "conductivity": "Physical High / Magical High", "craftMod": 5, "requiredRank": "Master", "compatible": ["Crafting Materials", "Alloys", "Refinement", "Smithing"], "refinement": true, "processing": "Raw", "maxEnchantRank": "VI", "affinity": ["Shadow", "Death", "Mana Flow"], "magicalCapacity": 10, "stability": "Medium", "runes": true, "runeLimit": 2, "soulAllowed": ["Basic", "Common", "Luminous", "Brilliant", "Special"], "soulMinimum": "Luminous", "risk": "High", "failure": "Material loss", "baseValue": "220–350 Marks (Restricted Trade)", "rarityWeight": 4, "regions": "Epic-grade deposits, restricted trade, leyline regions, GM rewards", "shopTier": "Restricted trade, high-tier guilds, royal vaults, GM approval", "sources": "Ore veins, mining nodes, quest rewards, shop stock, region-specific deposits", "lore": "Ebony forms deep within the Netherworld and other shadow-aligned regions, where light cannot reach and death energy accumulates over time.\n\nIt is often associated with ancient entities and forgotten places, and those who mine it report an unnatural silence surrounding the material.", "appearance": "Ebony Ore appears as deep black stone with a matte surface that absorbs surrounding light. Faint violet undertones can be seen within its structure when exposed to magical energy.\n\nIts edges seem to blur slightly in low light, as though the material is partially merging with shadow.", "traits": "- Absorbs light and ambient energy  \n- Dampens sound and presence  \n- Stable under shadow and death energy  \n- Difficult to detect in low-light environments", "refinementNotes": "- Smelts into: [[Ebony Ingot]]  \n- Ratio: 4 Ore → 1 Ingot  \n- Requires shadow-aligned forge or controlled environment", "alloyUse": "", "enchantmentUse": "- Strong affinity with **Dark** and **Death**  \n- Enhances:\n  - Stealth effects  \n  - Energy drain  \n  - Suppression abilities", "quote": "Where light ends, it begins."},
    'aluminum-ingot':{"id": "aluminum-ingot", "name": "Aluminum Ingot", "description": "Aluminum is an extremely lightweight metal that enhances speed, mobility, and responsiveness. It sacrifices durability for agility, making it ideal for fast-paced combat styles and aerial or evasive gear.", "itemClass": "Uncommon", "materialType": "Metal", "materialForm": "Ingot", "source": "Aluminum Ore", "weightClass": "Very Light", "durabilityLabel": "Low", "enchantmentAffinity": "25% (+2 dice)", "damageModifier": "1", "armorModifier": "1", "marketValue": "18 Marks", "hardness": 3, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Medium", "craftMod": 1, "requiredRank": "Apprentice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "III", "affinity": ["Mana Flow"], "magicalCapacity": 3, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic", "Common"], "soulMinimum": "Weak", "risk": "Low", "failure": "Material loss", "baseValue": "18 Marks", "rarityWeight": 35, "regions": "Uncommon trade routes, smiths, material merchants, specialist suppliers", "shopTier": "Material merchants, smiths, alchemists, specialised shops", "sources": "Aluminum Ore", "traits": "- Extremely lightweight  \n- Highly resistant to corrosion  \n- Poor durability under heavy stress  \n- Excellent electrical conductivity", "craftingUse": "- Light armor\n- Mobility gear\n- Artificer components\n- Flight / movement devices", "alloyUse": "- Lightweight alloys (future)\n- Speed-enhanced equipment", "enchantmentUse": "- Enhances Air and Lightning effects  \n- Boosts movement-based abilities  \n- Reduces activation delay in enchantments", "quote": "Lighter than steel — faster than thought."},
    'cast-iron-ingot':{"id": "cast-iron-ingot", "name": "Cast Iron Ingot", "description": "Cast Iron is a dense and rigid alloy that provides strong structural support but suffers from brittleness under stress. It excels in defensive applications but performs poorly in precision weaponry.", "itemClass": "Uncommon", "materialType": "Metal", "materialForm": "Ingot (Alloy)", "source": "Iron Ingot + Carbon", "weightClass": "Heavy", "durabilityLabel": "Moderate", "enchantmentAffinity": "10% (+0 dice)", "damageModifier": "1", "armorModifier": "2", "marketValue": "20 Marks", "hardness": 3, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Medium", "craftMod": 1, "requiredRank": "Apprentice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "III", "affinity": ["Mana Flow"], "magicalCapacity": 3, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic", "Common"], "soulMinimum": "Weak", "risk": "Low", "failure": "Material loss", "baseValue": "20 Marks", "rarityWeight": 35, "regions": "Uncommon trade routes, smiths, material merchants, specialist suppliers", "shopTier": "Material merchants, smiths, alchemists, specialised shops", "sources": "Iron Ingot + Carbon", "traits": "- Excellent at absorbing blunt force  \n- Brittle under sharp or repeated stress  \n- Difficult to reshape once formed  \n- Dense and heavy", "craftingUse": "- Heavy armor\n- Defensive structures\n- Reinforced components", "alloyUse": "- 1x [[Iron Ingot]]\n- Carbon (high concentration)", "enchantmentUse": "- Weak enchantment compatibility  \n- Slight synergy with Earth-aligned effects", "quote": "Strong enough to stand — until it breaks."},
    'chromium-ingot':{"id": "chromium-ingot", "name": "Chromium Ingot", "description": "Chromium Ingots are used to reinforce metals, increasing durability and resistance to environmental and structural damage. While not suited for raw offensive power, they significantly enhance defensive properties.", "itemClass": "Uncommon", "materialType": "Metal", "materialForm": "Ingot", "source": "Chromium Ore", "weightClass": "Medium", "durabilityLabel": "High", "enchantmentAffinity": "15% (+1 dice)", "damageModifier": "1", "armorModifier": "2", "marketValue": "18 Marks", "hardness": 3, "durability": 2, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Medium", "craftMod": 1, "requiredRank": "Apprentice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "III", "affinity": ["Mana Flow"], "magicalCapacity": 3, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic", "Common"], "soulMinimum": "Weak", "risk": "Low", "failure": "Material loss", "baseValue": "18 Marks", "rarityWeight": 35, "regions": "Uncommon trade routes, smiths, material merchants, specialist suppliers", "shopTier": "Material merchants, smiths, alchemists, specialised shops", "sources": "Chromium Ore", "traits": "- Excellent corrosion resistance  \n- Strengthens alloy integrity  \n- Maintains form under stress  \n- Slightly heavier than standard metals", "craftingUse": "- Armor reinforcement  \n- Structural components  \n- Alloy enhancement (High Steel)  \n- Defensive equipment", "alloyUse": "- [[High Steel Ingot]]", "enchantmentUse": "- Improves enchantment durability  \n- Reduces wear from repeated magical use  \n- Supports defensive enchantments", "quote": "Strength is not in the strike — but in what endures it."},
    'mercury':{"id": "mercury", "name": "Mercury", "description": "Mercury is a liquid metal that cannot be forged into traditional equipment. Instead, it is used in alchemy, transmutation, and ritual crafting.", "itemClass": "Uncommon", "materialType": "Metal", "materialForm": "Liquid", "source": "", "weightClass": "", "durabilityLabel": "", "enchantmentAffinity": "35% (+3 dice)", "damageModifier": "0", "armorModifier": "0", "marketValue": "35 Marks", "hardness": 3, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Medium", "craftMod": 1, "requiredRank": "Apprentice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "III", "affinity": ["Mana Flow"], "magicalCapacity": 3, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic", "Common"], "soulMinimum": "Weak", "risk": "Low", "failure": "Material loss", "baseValue": "35 Marks", "rarityWeight": 35, "regions": "Uncommon trade routes, smiths, material merchants, specialist suppliers", "shopTier": "Material merchants, smiths, alchemists, specialised shops", "sources": "", "traits": "- Liquid state  \n- Highly toxic  \n- Unstable magical resonance", "craftingUse": "- Alchemy\n- Rituals\n- Magical infusion\n- Transformation systems", "alloyUse": "", "enchantmentUse": "- Enhances transformation and mutation effects  \n- Used in cursebinding and ritual magic  \n- Cannot hold standard enchantments", "quote": "It flows — and nothing that touches it remains unchanged."},
    'platinum-ingot':{"id": "platinum-ingot", "name": "Platinum Ingot", "description": "Platinum is a rare and highly stable metal that excels in magical conductivity. It enhances divine and celestial enchantments while maintaining structural integrity.", "itemClass": "Uncommon", "materialType": "Metal", "materialForm": "Ingot", "source": "Platinum Ore", "weightClass": "Medium", "durabilityLabel": "High", "enchantmentAffinity": "40% (+3 dice)", "damageModifier": "1", "armorModifier": "2", "marketValue": "40 Marks", "hardness": 3, "durability": 2, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Medium", "craftMod": 1, "requiredRank": "Apprentice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "III", "affinity": ["Mana Flow"], "magicalCapacity": 3, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic", "Common"], "soulMinimum": "Weak", "risk": "Low", "failure": "Material loss", "baseValue": "40 Marks", "rarityWeight": 35, "regions": "Uncommon trade routes, smiths, material merchants, specialist suppliers", "shopTier": "Material merchants, smiths, alchemists, specialised shops", "sources": "Platinum Ore", "traits": "- Highly resistant to corruption  \n- Extremely stable under magical stress  \n- Difficult to forge without advanced methods", "craftingUse": "- Holy weapons\n- Relics\n- Enchanted armor\n- Magical cores", "alloyUse": "- High-tier enchanted alloys (future)", "enchantmentUse": "- Strong affinity with Light and Celestial magic  \n- Increases enchantment effectiveness  \n- High stability under repeated casting", "quote": "Purity forged into form."},
    'steel-ingot':{"id": "steel-ingot", "name": "Steel Ingot", "description": "Steel is a refined alloy that balances strength, flexibility, and durability. It represents the first major advancement beyond raw metals, providing a reliable foundation for combat equipment and advanced craftsmanship.", "itemClass": "Uncommon", "materialType": "Metal", "materialForm": "Ingot (Alloy)", "source": "Iron Ingot + Carbon", "weightClass": "Medium", "durabilityLabel": "High", "enchantmentAffinity": "20% (+1 dice)", "damageModifier": "2", "armorModifier": "2", "marketValue": "24 Marks", "hardness": 3, "durability": 2, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Medium", "craftMod": 1, "requiredRank": "Apprentice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "III", "affinity": ["Mana Flow"], "magicalCapacity": 3, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic", "Common"], "soulMinimum": "Weak", "risk": "Low", "failure": "Material loss", "baseValue": "24 Marks", "rarityWeight": 35, "regions": "Uncommon trade routes, smiths, material merchants, specialist suppliers", "shopTier": "Material merchants, smiths, alchemists, specialised shops", "sources": "Iron Ingot + Carbon", "traits": "- Stronger and more flexible than Iron  \n- Holds an edge significantly better than base metals  \n- Resistant to warping and fracture under stress  \n- Reliable across both combat and utility applications", "craftingUse": "- Weapons (standard tier)\n- Armor (medium to heavy)\n- Tools and structural components\n- Mechanical frameworks", "alloyUse": "- 1x [[Iron Ingot]]\n- Carbon (Refinement Catalyst)", "enchantmentUse": "- Supports low to mid-tier enchantments  \n- Stable under repeated magical use  \n- Does not amplify magic, but maintains consistency", "quote": "Iron endures — steel perfects."},
    'antimony-ingot':{"id": "antimony-ingot", "name": "Antimony Ingot", "description": "Antimony Ingots are brittle but structurally influential, used to reinforce alloys and improve the rigidity of softer metals.", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ingot", "source": "Antimony Ore", "weightClass": "Light", "durabilityLabel": "Low", "enchantmentAffinity": "12% (+0 dice)", "damageModifier": "0", "armorModifier": "0", "marketValue": "8 Marks", "hardness": 2, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "II", "affinity": ["Basic Crafting"], "magicalCapacity": 2, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "8 Marks", "rarityWeight": 50, "regions": "Common trade routes, smiths, general material merchants", "shopTier": "General smiths, material merchants, crafting suppliers", "sources": "Antimony Ore", "traits": "- Brittle and rigid  \n- Not suitable for direct weapon or armor crafting  \n- Improves hardness and form retention in alloys", "craftingUse": "- Alloy reinforcement\n- Structural balancing in metal crafting\n- Artificer and alchemical components", "alloyUse": "- [[Pewter Ingot]]\n- Advanced alloy systems (future)", "enchantmentUse": "- Enhances durability of enchanted structures  \n- Reduces warping under magical stress", "quote": "Strength is not always what stands — but what prevents collapse."},
    'brass-ingot':{"id": "brass-ingot", "name": "Brass Ingot", "description": "Brass is a flexible, resonance-rich alloy that enhances vibration, sound, and heat-based interactions. It is widely used in mechanisms, constructs, and arcane devices, while still being viable for light equipment.", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ingot (Alloy)", "source": "Copper Ingot + Zinc Ingot", "weightClass": "Light", "durabilityLabel": "Low", "enchantmentAffinity": "20% (+1 dice)", "damageModifier": "0", "armorModifier": "0", "marketValue": "14 Marks", "hardness": 2, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "II", "affinity": ["Basic Crafting"], "magicalCapacity": 2, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "14 Marks", "rarityWeight": 50, "regions": "Common trade routes, smiths, general material merchants", "shopTier": "General smiths, material merchants, crafting suppliers", "sources": "Copper Ingot + Zinc Ingot", "traits": "- Highly flexible and easy to shape  \n- Moderate resistance to corrosion  \n- Excellent sound and heat conductivity  \n- Cannot withstand sustained heavy impact", "craftingUse": "- Mechanical components\n- Artificer constructs\n- Instruments\n- Light weapons\n- Light armor", "alloyUse": "- 1x [[Copper Ingot]]\n- 1x [[Zinc Ingot]]", "enchantmentUse": "- Enhances:\n  - Sound-based effects\n  - Heat / Fire interactions\n  - Vibration-based abilities  \n- Improves responsiveness of triggered enchantments  \n- Less stable under heavy strain", "quote": "Where heat and harmony meet, brass sings."},
    'bronze-ingot':{"id": "bronze-ingot", "name": "Bronze Ingot", "description": "Bronze is the first true crafted alloy, offering improved durability and strength over its base components. It is ideal for early weapons, armor, and durable crafted goods.", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ingot (Alloy)", "source": "Copper Ingot + Tin Ingot", "weightClass": "Medium", "durabilityLabel": "Moderate", "enchantmentAffinity": "20% (+1 dice)", "damageModifier": "0", "armorModifier": "0", "marketValue": "12 Marks", "hardness": 2, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "II", "affinity": ["Basic Crafting"], "magicalCapacity": 2, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "12 Marks", "rarityWeight": 50, "regions": "Common trade routes, smiths, general material merchants", "shopTier": "General smiths, material merchants, crafting suppliers", "sources": "Copper Ingot + Tin Ingot", "traits": "- Stronger than Copper and Tin  \n- Holds shape and edge better  \n- Resistant to corrosion", "craftingUse": "- Weapons\n- Armor\n- Tools\n- Structural components", "alloyUse": "- 1x [[Copper Ingot]]\n- 1x [[Tin Ingot]]", "enchantmentUse": "- Supports basic enchantments  \n- More stable than Copper  \n- Can hold longer-lasting effects", "quote": "Where two weak metals meet, strength is born."},
    'copper-ingot':{"id": "copper-ingot", "name": "Copper Ingot", "description": "A refined metal with excellent conductivity, Copper Ingots are widely used in crafting tools, enchantment bases, and early-stage equipment.", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ingot", "source": "Copper Ore", "weightClass": "Light", "durabilityLabel": "Low", "enchantmentAffinity": "15% (+1 dice)", "damageModifier": "0", "armorModifier": "0", "marketValue": "8 Marks", "hardness": 2, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "II", "affinity": ["Basic Crafting"], "magicalCapacity": 2, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "8 Marks", "rarityWeight": 50, "regions": "Common trade routes, smiths, general material merchants", "shopTier": "General smiths, material merchants, crafting suppliers", "sources": "Copper Ore", "traits": "- Soft and easily shaped  \n- Low durability under stress  \n- High energy conductivity", "craftingUse": "- Used in:\n  - Basic weapons\n  - Magical conduits\n  - Artificer components", "alloyUse": "- [[Bronze Ingot]] (with Tin)\n- [[Brass Ingot]] (with Zinc)", "enchantmentUse": "- Boosts Fire and Lightning effects  \n- Improves low-tier enchantment stability", "quote": "Refined from flame, shaped by will."},
    'gold-ingot':{"id": "gold-ingot", "name": "Gold Ingot", "description": "Gold Ingots are used primarily for enchantment, relic crafting, and high-value items rather than combat equipment.", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ingot", "source": "Gold Ore", "weightClass": "Medium", "durabilityLabel": "Low", "enchantmentAffinity": "35% (+3 dice)", "damageModifier": "0", "armorModifier": "0", "marketValue": "40 Marks", "hardness": 2, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "II", "affinity": ["Basic Crafting"], "magicalCapacity": 2, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "40 Marks", "rarityWeight": 50, "regions": "Common trade routes, smiths, general material merchants", "shopTier": "General smiths, material merchants, crafting suppliers", "sources": "Gold Ore", "traits": "- Extremely soft  \n- High magical conductivity  \n- Corrosion resistant", "craftingUse": "- Relics\n- Enchanted items\n- Currency systems", "alloyUse": "- Reinforces magical items", "enchantmentUse": "- Boosts Light, Celestial, and Divine magic  \n- High enchantment stability", "quote": "Gold carries the memory of the sun."},
    'iron-ingot':{"id": "iron-ingot", "name": "Iron Ingot", "description": "Iron Ingots provide a balanced foundation for weapons and armor, offering durability and structure without advanced properties.", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ingot", "source": "Iron Ore", "weightClass": "Medium", "durabilityLabel": "Moderate", "enchantmentAffinity": "10% (+0 dice)", "damageModifier": "0", "armorModifier": "0", "marketValue": "12 Marks", "hardness": 2, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "II", "affinity": ["Basic Crafting"], "magicalCapacity": 2, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "12 Marks", "rarityWeight": 50, "regions": "Common trade routes, smiths, general material merchants", "shopTier": "General smiths, material merchants, crafting suppliers", "sources": "Iron Ore", "traits": "- Strong and reliable  \n- Moderate weight  \n- Holds form well under stress", "craftingUse": "- Weapons\n- Armor\n- Structural components", "alloyUse": "- [[Steel Ingot]]", "enchantmentUse": "- Basic enchantment compatibility  \n- Stable but not highly receptive", "quote": "The world bends, but iron holds."},
    'lead-ingot':{"id": "lead-ingot", "name": "Lead Ingot", "description": "Lead Ingots are used to suppress and contain magical energy rather than enhance it.", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ingot", "source": "Lead Ore", "weightClass": "Heavy", "durabilityLabel": "Moderate", "enchantmentAffinity": "5% (+0 dice)", "damageModifier": "0", "armorModifier": "0", "marketValue": "8 Marks", "hardness": 2, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "II", "affinity": ["Basic Crafting"], "magicalCapacity": 2, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "8 Marks", "rarityWeight": 50, "regions": "Common trade routes, smiths, general material merchants", "shopTier": "General smiths, material merchants, crafting suppliers", "sources": "Lead Ore", "traits": "- Heavy and dense  \n- Soft but stable  \n- Magic dampening", "craftingUse": "- Anti-magic items\n- Sealed containers\n- Cursed relics", "alloyUse": "", "enchantmentUse": "- Reduces magical output  \n- Blocks magical effects", "quote": "Silence, forged into matter."},
    'nickel-ingot':{"id": "nickel-ingot", "name": "Nickel Ingot", "description": "Nickel Ingots provide structural balance and resilience when used in crafting. While not ideal for standalone weapons or armor, they are highly valued for strengthening and stabilising alloys.", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ingot", "source": "Nickel Ore", "weightClass": "Medium", "durabilityLabel": "Moderate", "enchantmentAffinity": "10% (+0 dice)", "damageModifier": "0", "armorModifier": "0", "marketValue": "10 Marks", "hardness": 2, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "II", "affinity": ["Basic Crafting"], "magicalCapacity": 2, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "10 Marks", "rarityWeight": 50, "regions": "Common trade routes, smiths, general material merchants", "shopTier": "General smiths, material merchants, crafting suppliers", "sources": "Nickel Ore", "traits": "- Flexible yet durable  \n- Corrosion resistant  \n- Maintains integrity under stress", "craftingUse": "- Alloy reinforcement  \n- Tool crafting  \n- Structural components", "alloyUse": "- Used to improve durability and stability in alloys  \n- Supports balanced metal compositions", "enchantmentUse": "- Reduces enchantment instability  \n- Improves consistency of magical effects", "quote": "Strength is not always in force — but in what holds it together."},
    'pewter-ingot':{"id": "pewter-ingot", "name": "Pewter Ingot", "description": "Pewter is a balanced, multi-metal alloy designed for utility, ritual use, and low-tier equipment. While not suited for heavy combat, it offers stability, adaptability, and strong interaction with minor enchantments.", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ingot (Alloy)", "source": "Tin Ingot + Copper Ingot + Lead Ingot + Antimony Ingot", "weightClass": "Light", "durabilityLabel": "Low", "enchantmentAffinity": "15% (+1 dice)", "damageModifier": "0", "armorModifier": "0", "marketValue": "16 Marks", "hardness": 2, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "II", "affinity": ["Basic Crafting"], "magicalCapacity": 2, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "16 Marks", "rarityWeight": 50, "regions": "Common trade routes, smiths, general material merchants", "shopTier": "General smiths, material merchants, crafting suppliers", "sources": "Tin Ingot + Copper Ingot + Lead Ingot + Antimony Ingot", "traits": "- Soft but structurally balanced  \n- Resistant to minor deformation due to antimony reinforcement  \n- Slightly toxic due to lead content  \n- Easy to shape and rework", "craftingUse": "- Trinkets\n- Ritual tools\n- Containers\n- Light gear (limited)\n- Enchanted utility items", "alloyUse": "- 2x [[Tin Ingot]] (Primary Base)\n- 1x [[Copper Ingot]]\n- 1x [[Lead Ingot]]\n- 1x [[Antimony Ingot]]", "enchantmentUse": "- Accepts low-tier enchantments easily  \n- Moderate stability for sustained effects  \n- Does not support high-tier enchantments  \n- Useful for:\n  - Wards\n  - Minor charms\n  - Ritual casting tools", "quote": "Not made for war, but for the quiet work that shapes it."},
    'silver-ingot':{"id": "silver-ingot", "name": "Silver Ingot", "description": "Silver Ingots are prized for their ability to channel divine and spiritual energy, making them ideal for enchanted weapons and relics.", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ingot", "source": "Silver Ore", "weightClass": "Light", "durabilityLabel": "Moderate", "enchantmentAffinity": "30% (+2 dice)", "damageModifier": "0", "armorModifier": "0", "marketValue": "20 Marks", "hardness": 2, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "II", "affinity": ["Basic Crafting"], "magicalCapacity": 2, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "20 Marks", "rarityWeight": 50, "regions": "Common trade routes, smiths, general material merchants", "shopTier": "General smiths, material merchants, crafting suppliers", "sources": "Silver Ore", "traits": "- Soft but magically potent  \n- High purity  \n- Reacts to corruption", "craftingUse": "- Holy weapons\n- Ritual tools\n- Magical components", "alloyUse": "- Reinforces enchanted weapons", "enchantmentUse": "- Boosts Light and Spirit effects  \n- Increased effectiveness vs undead", "quote": "Silver reveals what darkness hides."},
    'tin-ingot':{"id": "tin-ingot", "name": "Tin Ingot", "description": "A refined but weak metal, Tin Ingots are primarily used as a stabilising component in alloy crafting rather than for direct equipment creation.", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ingot", "source": "Tin Ore", "weightClass": "Light", "durabilityLabel": "Low", "enchantmentAffinity": "10% (+0 dice)", "damageModifier": "0", "armorModifier": "0", "marketValue": "4 Marks", "hardness": 2, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "II", "affinity": ["Basic Crafting"], "magicalCapacity": 2, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "4 Marks", "rarityWeight": 50, "regions": "Common trade routes, smiths, general material merchants", "shopTier": "General smiths, material merchants, crafting suppliers", "sources": "Tin Ore", "traits": "- Very soft and flexible  \n- Cannot hold an edge  \n- Supports alloy integrity", "craftingUse": "- Core component for Bronze\n- Used in beginner alloy recipes", "alloyUse": "- [[Bronze Ingot]]", "enchantmentUse": "- Enhances enchantment stability in alloys  \n- Reduces magical backlash", "quote": "Strength is not always found in the metal itself, but in what it allows."},
    'zinc-ingot':{"id": "zinc-ingot", "name": "Zinc Ingot", "description": "Zinc Ingots are rarely used alone but are critical in crafting alloys that require flexibility and responsiveness.", "itemClass": "Common", "materialType": "Metal", "materialForm": "Ingot", "source": "Zinc Ore", "weightClass": "Light", "durabilityLabel": "Low", "enchantmentAffinity": "10% (+0 dice)", "damageModifier": "0", "armorModifier": "0", "marketValue": "6 Marks", "hardness": 2, "durability": 1, "weight": 1, "flexibility": "Medium", "conductivity": "Physical Medium / Magical Low", "craftMod": 0, "requiredRank": "Novice", "compatible": ["Weapons", "Armour", "Tools", "Crafting Materials", "Alloys"], "refinement": true, "processing": "Refined", "maxEnchantRank": "II", "affinity": ["Basic Crafting"], "magicalCapacity": 2, "stability": "Medium", "runes": true, "runeLimit": 1, "soulAllowed": ["Poor", "Weak", "Basic"], "soulMinimum": "Poor", "risk": "Low", "failure": "Material loss", "baseValue": "6 Marks", "rarityWeight": 50, "regions": "Common trade routes, smiths, general material merchants", "shopTier": "General smiths, material merchants, crafting suppliers", "sources": "Zinc Ore", "traits": "- Soft and reactive  \n- Low durability  \n- Enhances alloy flexibility", "craftingUse": "- Alloy component\n- Artificer crafting\n- Mechanical parts", "alloyUse": "- [[Brass Ingot]]", "enchantmentUse": "- Improves energy responsiveness in alloys  \n- Helps distribute magical effects evenly", "quote": "The unseen force behind the perfect alloy."}
  };
  function read(){try{return JSON.parse(localStorage.getItem(STORE)||'null')||{materials:{...DEFAULT_MATERIALS},custom:[],log:[]};}catch(e){return {materials:{...DEFAULT_MATERIALS},custom:[],log:[]};}}
  function write(s){localStorage.setItem(STORE,JSON.stringify(s)); if(window.asteriaDataSync?.saveAppState) window.asteriaDataSync.saveAppState({materials:s});}
  function allMaterials(){const s=read(); return {...DEFAULT_MATERIALS,...(s.materials||{})};}
  function materialByName(name){const mats=allMaterials(); return Object.values(mats).find(m=>m.name===name||m.id===name)||mats.steel;}
  function now(){return new Date().toISOString();}
  function logMaterial(type,msg,data={}){const s=read(); s.log.unshift({id:'mat_'+Date.now().toString(36),time:now(),type,msg,data}); s.log=s.log.slice(0,100); write(s); if(typeof slEvent==='function') slEvent('Materials',msg,data,'Public');}
  function notifyMat(level,title,msg,kind='item'){ if(typeof notify==='function') notify(level,title,msg,kind,{important:level==='major'}); else toast?.(`${title}: ${msg}`); }
  function classBadge(cls){return `<span class="material-class-badge" style="--class-color:${CLASS_COLOURS[cls]||'#999'}">${cls}</span>`;}
  function matCard(m){return `<article class="material-card" data-class="${m.itemClass}" data-type="${m.materialType}" data-affinity="${(m.affinity||[]).join(' ')}"><div class="material-card-head"><div><h4>${m.name}</h4><small>${m.materialType}${m.materialForm?' / '+m.materialForm:''} • Hardness ${m.hardness} • Max ${ENCHANTMENT_RANKS[m.maxEnchantRank]||m.maxEnchantRank}</small></div>${classBadge(m.itemClass)}</div><p>${m.description}</p><div class="material-stat-row"><span>Craft ${m.craftMod>=0?'+':''}${m.craftMod}</span><span>Capacity ${m.magicalCapacity}</span><span>${m.stability}</span><span>${m.risk} Risk</span></div><div class="material-affinities">${(m.affinity||[]).map(a=>`<em>${a}</em>`).join('')}</div><button onclick="openMaterialDetail('${m.id}')">View Material</button></article>`;}
  function materialOptions(selected='steel'){return Object.values(allMaterials()).map(m=>`<option value="${m.name}" ${m.name===selected||m.id===selected?'selected':''}>${m.name} — ${m.itemClass}</option>`).join('');}
  function renderMaterialList(){const host=document.getElementById('materialCompendiumList'); if(!host)return; const q=(document.getElementById('matSearch')?.value||'').toLowerCase(); const cls=document.getElementById('matClassFilter')?.value||''; const type=document.getElementById('matTypeFilter')?.value||''; const aff=document.getElementById('matAffinityFilter')?.value||''; let mats=Object.values(allMaterials()).filter(m=>(!q||(m.name+m.description+(m.affinity||[]).join(' ')).toLowerCase().includes(q))&&(!cls||m.itemClass===cls)&&(!type||m.materialType===type)&&(!aff||(m.affinity||[]).includes(aff))); host.innerHTML=mats.map(matCard).join('')||'<p class="muted smallnote">No materials match those filters.</p>';}
  window.openMaterialDetail=function(id){const m=allMaterials()[id]||materialByName(id); const host=document.getElementById('materialDetailPanel'); if(!host||!m)return; host.innerHTML=`<div class="section-head"><div><p class="eyebrow">Material Detail</p><h3>${m.name}</h3></div>${classBadge(m.itemClass)}</div><p>${m.description}</p><div class="material-detail-grid"><section><h4>Properties</h4><p>Type: <b>${m.materialType}</b></p><p>Hardness: <b>${m.hardness}/8</b></p><p>Durability Modifier: <b>${m.durability}</b></p><p>Weight Modifier: <b>${m.weight}</b></p><p>Flexibility: <b>${m.flexibility}</b></p><p>Conductivity: <b>${m.conductivity}</b></p></section><section><h4>Crafting Uses</h4><p>Required Rank: <b>${m.requiredRank}</b></p><p>Craft Difficulty Modifier: <b>${m.craftMod>=0?'+':''}${m.craftMod}</b></p><p>Compatible: <b>${(m.compatible||[]).join(', ')}</b></p><p>Processing: <b>${m.processing}</b></p><p>Material Form: <b>${m.materialForm||'Material'}</b></p><p>Refines Into: <b>${m.refinesInto||'—'}</b></p><p>Refinement Ratio: <b>${m.refinementRatio||'—'}</b></p><p>Refinement Required: <b>${m.refinement?'Yes':'No'}</b></p></section><section><h4>Enchantment Compatibility</h4><p>Max Rank: <b>${ENCHANTMENT_RANKS[m.maxEnchantRank]||m.maxEnchantRank}</b></p><p>Capacity: <b>${m.magicalCapacity}</b></p><p>Stability: <b>${m.stability}</b></p><p>Rune Compatibility: <b>${m.runes?'Yes — Limit '+m.runeLimit:'No'}</b></p><p>Soul Stone Minimum: <b>${m.soulMinimum}</b></p></section><section><h4>Risk & Economy</h4><p>Risk: <b>${m.risk}</b></p><p>Failure: <b>${m.failure}</b></p><p>Base Value: <b>${m.baseValue} Crowns</b></p><p>Region: <b>${m.regions}</b></p><p>Shop Tier: <b>${m.shopTier}</b></p></section></div><blockquote>${m.lore||''}</blockquote><button onclick="grantMaterialToPlayer('${m.id}')">GM Grant Material</button>`;};
  function renderMaterialCompendium(){const host=document.querySelector('#library .rule-content, #library .content-panel, #library'); if(!host||document.getElementById('materialCompendiumPanel'))return; const panel=document.createElement('section'); panel.className='card material-compendium-panel'; panel.id='materialCompendiumPanel'; panel.innerHTML=`<div class="section-head"><div><p class="eyebrow">Compendium</p><h3>Material System</h3><p class="muted smallnote">Materials use the universal Asteria item class structure and gate crafting, enchantment rank, stability, and item potential.</p></div><span class="pill">Material System v1</span></div><div class="material-filter-grid"><input id="matSearch" placeholder="Search materials..." oninput="renderMaterialList()"><select id="matClassFilter" onchange="renderMaterialList()"><option value="">All Classes</option>${ITEM_CLASSES.map(x=>`<option>${x}</option>`).join('')}</select><select id="matTypeFilter" onchange="renderMaterialList()"><option value="">All Types</option>${MATERIAL_TYPES.map(x=>`<option>${x}</option>`).join('')}</select><select id="matAffinityFilter" onchange="renderMaterialList()"><option value="">All Affinities</option>${AFFINITIES.map(x=>`<option>${x}</option>`).join('')}</select></div><div id="materialCompendiumList" class="material-list"></div><div id="materialDetailPanel" class="material-detail-panel"></div>`; host.appendChild(panel); renderMaterialList();}
  function installPlayerMaterials(){return;}
  function renderPlayerMaterials(){const host=document.getElementById('playerMaterialList'); if(!host)return; const id=(typeof currentPlayerId==='function'?currentPlayerId():selected)||selected; const c=chars?.[id]; const inv=[...(c?.inventory||[]),...(c?.bags||[]).flatMap(b=>b.items||[])]; const mats=inv.filter(i=>/material/i.test(i.type||'')||i.materialSystem); host.innerHTML=mats.length?mats.map(i=>`<div class="material-inventory-row"><b>${i.name}</b><small>${i.itemClass||i.rarity||'Common'} • Qty ${i.qty||1} • ${i.source||'Inventory'}</small></div>`).join(''):'<p class="muted smallnote">No tracked materials in inventory yet.</p>';}
  function materialImpactPreview(){const sel=document.getElementById('craftMaterial')?.value||document.getElementById('craftMaterialSelect')?.value; const m=materialByName(sel); const host=document.getElementById('materialCraftPreview'); if(!host||!m)return; host.innerHTML=`<div class="material-impact-card"><h4>${m.name} Impact</h4><div class="material-stat-row"><span>${classBadge(m.itemClass)}</span><span>Max ${ENCHANTMENT_RANKS[m.maxEnchantRank]||m.maxEnchantRank}</span><span>Craft ${m.craftMod>=0?'+':''}${m.craftMod}</span><span>${m.stability}</span></div><p><b>Risk:</b> ${m.risk} — ${m.failure}</p><p><b>Affinities:</b> ${(m.affinity||[]).join(', ')}</p><p><b>Compatible:</b> ${(m.compatible||[]).join(', ')}</p></div>`;}
  window.updateMaterialCraftPreview=materialImpactPreview;
  function patchCraftingMaterialSelects(){
    document.querySelectorAll('select[id$="Material"]').forEach(sel=>{ if(sel.dataset.materialPatched)return; const current=sel.value; sel.innerHTML=materialOptions(current); sel.dataset.materialPatched='true'; sel.addEventListener('change',()=>{materialImpactPreview(); if(typeof updateCraftPreview==='function') updateCraftPreview();}); });
    document.querySelectorAll('.craft-preview').forEach(prev=>{ if(!prev.parentElement.querySelector('#materialCraftPreview')){ const d=document.createElement('div'); d.id='materialCraftPreview'; d.className='material-craft-preview'; prev.before(d);} });
    materialImpactPreview();
  }
  function patchCraftingTables(){
    if(window.ASTERIA_CRAFTING_TABLES?.BASE_MATERIALS){Object.values(DEFAULT_MATERIALS).forEach(m=>{window.ASTERIA_CRAFTING_TABLES.BASE_MATERIALS[m.name]={ac:Math.max(0,Math.floor((m.hardness-3)/2)),damage:Math.max(0,Math.floor(m.durability/2)),dice:m.materialType==='Wood'?'1d6':m.materialType==='Crystal'?'1d4':'1d8',value:m.baseValue};});}
    window.ASTERIA_MATERIAL_SYSTEM={VERSION,ITEM_CLASSES,ENCHANTMENT_RANKS,CLASS_COLOURS,MATERIAL_TYPES,AFFINITIES,materials:allMaterials(),getMaterial:materialByName};
  }
  window.grantMaterialToPlayer=function(id){const m=allMaterials()[id]||materialByName(id); const player=document.getElementById('gmMaterialGrantPlayer')?.value||selected||Object.keys(chars||{})[0]; const qty=Number(document.getElementById('gmMaterialGrantQty')?.value||1); if(!m||!chars?.[player])return toast?.('No player/material selected.'); const item={id:'mat_'+m.id+'_'+Date.now().toString(36),name:m.name,type:'Material',qty,itemClass:m.itemClass,materialType:m.materialType,materialSystem:true,source:'GM Material Grant',snapshot:{versionRef:'Material System v1',materialId:m.id,createdAt:now(),preserved:true},description:m.description}; if(typeof createTransaction==='function'){createTransaction({source:'GM Material Grant',playerId:player,characterId:player,items:[item],destination:'inventory',visibility:'Public',approvalStatus:m.itemClass==='Legendary'||m.itemClass==='Relic'?'Pending GM Approval':'Approved'});} else {chars[player].inventory=chars[player].inventory||[]; chars[player].inventory.push(item);} logMaterial('Material Granted',`${m.name} x${qty} granted to ${chars[player].name}.`,{material:m,qty,player}); notifyMat(['Legendary','Relic'].includes(m.itemClass)?'major':'medium','Material Granted',`${chars[player].name} received ${m.name} x${qty}.`); saveAsteriaState?.(); renderPlayerMaterials(); renderGM?.(); };
  window.createCustomMaterial=function(){const g=id=>document.getElementById(id); const name=g('gmMatName')?.value?.trim(); if(!name)return toast?.('Material name required.'); const id=name.toLowerCase().replace(/[^a-z0-9]+/g,'-'); const m={id,name,description:g('gmMatDesc')?.value||'Custom Asteria material.',itemClass:g('gmMatClass')?.value||'Common',materialType:g('gmMatType')?.value||'Hybrid',hardness:Number(g('gmMatHard')?.value||3),durability:Number(g('gmMatDur')?.value||0),weight:Number(g('gmMatWeight')?.value||1),flexibility:g('gmMatFlex')?.value||'Medium',conductivity:g('gmMatCond')?.value||'Physical Medium / Magical Medium',craftMod:Number(g('gmMatCraft')?.value||0),requiredRank:g('gmMatRank')?.value||'Initiate',compatible:(g('gmMatCompat')?.value||'Weapons, Armour').split(',').map(x=>x.trim()),refinement:g('gmMatRefine')?.checked??true,processing:g('gmMatProcess')?.value||'Raw',maxEnchantRank:g('gmMatEnchant')?.value||'II',affinity:(g('gmMatAffinity')?.value||'Earth').split(',').map(x=>x.trim()),magicalCapacity:Number(g('gmMatCapacity')?.value||2),stability:g('gmMatStability')?.value||'Medium',runes:g('gmMatRunes')?.checked??true,runeLimit:Number(g('gmMatRuneLimit')?.value||1),soulAllowed:['Poor','Weak','Basic','Common'],soulMinimum:g('gmMatSoulMin')?.value||'Poor',risk:g('gmMatRisk')?.value||'Low',failure:g('gmMatFailure')?.value||'Material loss',baseValue:Number(g('gmMatValue')?.value||10),rarityWeight:Number(g('gmMatWeightLoot')?.value||10),regions:g('gmMatRegions')?.value||'GM-defined',shopTier:g('gmMatShop')?.value||'GM-defined',sources:g('gmMatSources')?.value||'GM-defined',lore:g('gmMatLore')?.value||''}; const s=read(); s.materials=s.materials||{}; s.materials[id]=m; write(s); patchCraftingTables(); patchCraftingMaterialSelects(); renderMaterialList(); renderGMMaterials(); logMaterial('Custom Material',`${name} created by GM.`,m); notifyMat('medium','Material Created',`${name} added to the compendium.`);};
  function gmMaterialForm(){return `<details><summary>Create / Override Custom Material</summary><div class="material-gm-form"><label>Name<input id="gmMatName" placeholder="Star-Iron, Moonthread..."></label><label>Item Class<select id="gmMatClass">${ITEM_CLASSES.map(x=>`<option>${x}</option>`).join('')}</select></label><label>Type<select id="gmMatType">${MATERIAL_TYPES.map(x=>`<option>${x}</option>`).join('')}</select></label><label>Description<textarea id="gmMatDesc"></textarea></label><label>Hardness<input id="gmMatHard" type="number" min="1" max="8" value="3"></label><label>Durability Mod<input id="gmMatDur" type="number" value="0"></label><label>Weight Mod<input id="gmMatWeight" type="number" step="0.1" value="1"></label><label>Flexibility<input id="gmMatFlex" value="Medium"></label><label>Conductivity<input id="gmMatCond" value="Physical Medium / Magical Medium"></label><label>Craft Mod<input id="gmMatCraft" type="number" value="0"></label><label>Required Rank<input id="gmMatRank" value="Initiate"></label><label>Compatible Items<input id="gmMatCompat" value="Weapons, Armour, Tools"></label><label>Processing<select id="gmMatProcess"><option>Raw</option><option>Refined</option><option>Treated</option><option>Enchanted Base</option></select></label><label>Max Enchant Rank<select id="gmMatEnchant">${Object.keys(ENCHANTMENT_RANKS).map(k=>`<option>${k}</option>`).join('')}</select></label><label>Affinities<input id="gmMatAffinity" value="Earth"></label><label>Magical Capacity<input id="gmMatCapacity" type="number" value="2"></label><label>Stability<select id="gmMatStability"><option>Low</option><option>Medium</option><option>High</option><option>Volatile</option></select></label><label>Rune Limit<input id="gmMatRuneLimit" type="number" value="1"></label><label>Soul Minimum<input id="gmMatSoulMin" value="Poor"></label><label>Risk<input id="gmMatRisk" value="Low"></label><label>Failure Consequence<input id="gmMatFailure" value="Material loss"></label><label>Base Value<input id="gmMatValue" type="number" value="10"></label><label>Loot Weight<input id="gmMatWeightLoot" type="number" value="10"></label><label>Regions<input id="gmMatRegions" value="GM-defined"></label><label>Shop Tier<input id="gmMatShop" value="GM-defined"></label><label>Sources<input id="gmMatSources" value="GM-defined"></label><label>Lore<textarea id="gmMatLore"></textarea></label><label class="checkline"><input id="gmMatRefine" type="checkbox" checked> Refinement Required</label><label class="checkline"><input id="gmMatRunes" type="checkbox" checked> Rune Compatible</label></div><button class="primary" onclick="createCustomMaterial()">Save Material</button></details>`;}
  function installGMMaterials(){const gmPanels=document.querySelector('#gm .gm-panels'); if(!gmPanels||document.getElementById('gmMaterialsPanel'))return; const card=document.createElement('section'); card.className='card gm-materials-panel'; card.id='gmMaterialsPanel'; card.dataset.gmSystem='materials'; card.innerHTML=`<div class="section-head"><div><p class="eyebrow">GM Materials</p><h3>Material System</h3><p class="muted smallnote">Spawn materials, create custom materials, assign rarity/regions, and override enchantment limits.</p></div><span class="pill">${VERSION}</span></div><div class="gm-material-tools"><label>Player<select id="gmMaterialGrantPlayer">${Object.keys(chars||{}).map(id=>`<option value="${id}">${chars[id].name}</option>`).join('')}</select></label><label>Material<select id="gmMaterialGrantMaterial">${Object.values(allMaterials()).map(m=>`<option value="${m.id}">${m.name} — ${m.itemClass}</option>`).join('')}</select></label><label>Qty<input id="gmMaterialGrantQty" type="number" min="1" value="1"></label><button class="primary" onclick="grantMaterialToPlayer(document.getElementById('gmMaterialGrantMaterial').value)">Grant Material</button></div>${gmMaterialForm()}<h4>Material Compendium</h4><div id="gmMaterialList" class="material-list compact"></div><h4>Material Log</h4><div id="gmMaterialLog" class="craft-log-row-list"></div>`; gmPanels.appendChild(card); renderGMMaterials();}
  function renderGMMaterials(){const list=document.getElementById('gmMaterialList'); if(list)list.innerHTML=Object.values(allMaterials()).map(matCard).join(''); const log=document.getElementById('gmMaterialLog'); if(log)log.innerHTML=(read().log||[]).slice(0,20).map(l=>`<div class="craft-log-row"><b>${l.type}</b><span>${l.msg}</span><small>${new Date(l.time).toLocaleString()}</small></div>`).join('')||'<p class="muted smallnote">No material events logged yet.</p>';}
  function patchGMSystems(){try{ if(Array.isArray(asteriaGMSystems)&&!asteriaGMSystems.find(s=>s.id==='materials')){const craft=asteriaGMSystems.findIndex(s=>s.id==='crafting'); asteriaGMSystems.splice(craft>=0?craft+1:asteriaGMSystems.length,0,{id:'materials',label:'Materials',hint:'Crafting materials, rarity, enchantment limits'});} }catch(e){}}
  function injectMaterialContentPages(){
    window.ASTERIA_MATERIAL_COMPENDIUM={materials:allMaterials(),itemClasses:ITEM_CLASSES,enchantmentRanks:ENCHANTMENT_RANKS,types:MATERIAL_TYPES,affinities:AFFINITIES};
  }
  function refreshAll(){patchCraftingTables(); patchGMSystems(); injectMaterialContentPages(); installPlayerMaterials(); installGMMaterials(); renderMaterialCompendium(); patchCraftingMaterialSelects(); renderPlayerMaterials(); renderGMMaterials(); const b=document.querySelector('.version-badge'); if(b)b.textContent=VERSION; if(typeof applyGMSystemPanel==='function')applyGMSystemPanel();}
  window.AsteriaViewHooks?.afterPlayerLoad('material-system', () => refreshAll());
  window.AsteriaViewHooks?.afterGMRender('material-system', () => refreshAll());
  window.AsteriaViewHooks?.afterView('material-system', null, id => {if(id!=='gm'&&id!=='player')refreshAll();});
  document.addEventListener('DOMContentLoaded',()=>setTimeout(refreshAll,900));
  window.renderMaterialList=renderMaterialList;
})();

/* =====================================================
   Asteria v1.7.3.0 — Enchantment System v1
   Spell-Linked Binding System integrated into current UI.
   Spells remain source of truth; enchantments reference spells.
   ===================================================== */
(function(){
  const VERSION='v1.7.3.0 • Enchantment System v1';
  const STORE='asteria_enchantment_system_v1';
  const RANKS={I:'Rank I — Weak',II:'Rank II — Minor',III:'Rank III — Greater',IV:'Rank IV — Strengthened',V:'Rank V — Enhanced',VI:'Rank VI — Superior',VII:'Rank VII — Grand',VIII:'Rank VIII — World'};
  const RANK_ORDER=['I','II','III','IV','V','VI','VII','VIII'];
  const BINDINGS=['Weapon Binding','Armor Binding','Wand / Focus Binding','Passive Binding','Triggered Binding','Rune Binding','Consumable Binding','Relic Binding'];
  const INSTABILITY=['Stable','Strained','Unstable','Volatile','Catastrophic'];
  const SOUL_RANKS=['Poor','Weak','Basic','Common','Luminous','Brilliant','Special','Resplendent'];
  const SPELLS={
    fireball:{id:'fireball',name:'Fireball',type:'Fire',rank:'III',summary:'Explosive flame spell with reduced area when bound to weapons or runes.',canEnchant:'Yes',bindings:['Wand / Focus Binding','Weapon Binding','Rune Binding','Triggered Binding','Consumable Binding'],maxRank:'VI',materialAffinity:['Fire','Crystal','Soul Stone'],soul:'Common',skillRank:'Journeyman',stability:'High',restricted:'Rank VII–VIII requires GM approval. Weapon-bound versions reduce area and damage.',notes:'Wands are closest to the cast spell. Weapon bindings become flameburst strikes.'},
    healingLight:{id:'healingLight',name:'Healing Light',type:'Light',rank:'II',summary:'Restorative light spell that can be stored in wands, charms, or triggered armour.',canEnchant:'Yes',bindings:['Wand / Focus Binding','Armor Binding','Triggered Binding','Consumable Binding','Passive Binding'],maxRank:'V',materialAffinity:['Light','Life','Crystal','Silver'],soul:'Basic',skillRank:'Apprentice',stability:'Medium',restricted:'Passive healing requires GM approval beyond Rank IV.',notes:'Can be bound as emergency healing, warded armour, or a focus charge.'},
    shadowStep:{id:'shadowStep',name:'Shadow Step',type:'Dark',rank:'III',summary:'Short-range movement through shadow; dangerous when made passive.',canEnchant:'GM Only',bindings:['Triggered Binding','Passive Binding','Wand / Focus Binding','Relic Binding'],maxRank:'V',materialAffinity:['Shadow','Void','Dark','Obsidian'],soul:'Luminous',skillRank:'Adept',stability:'High',restricted:'Can cause displacement, misfire, or shadow corruption.',notes:'Usually bound as a triggered escape effect, not a constant power.'},
    bloodRite:{id:'bloodRite',name:'Blood Rite',type:'Blood',rank:'II',summary:'Blood-fuelled empowerment. Often costs HP or charges when bound.',canEnchant:'Yes',bindings:['Weapon Binding','Triggered Binding','Consumable Binding','Relic Binding'],maxRank:'VI',materialAffinity:['Blood','Organic','Iron','Soul Stone'],soul:'Common',skillRank:'Journeyman',stability:'High',restricted:'May require HP cost, curse risk, or GM approval.',notes:'Best used for weapon strikes, blood oils, or cursed relics.'},
    fateThread:{id:'fateThread',name:'Fate Thread',type:'Fate',rank:'IV',summary:'Manipulates probability and binding outcomes. Very restricted.',canEnchant:'GM Only',bindings:['Passive Binding','Triggered Binding','Relic Binding'],maxRank:'VIII',materialAffinity:['Fate','Spirit','Relic Core'],soul:'Special',skillRank:'Grandmaster',stability:'Volatile',restricted:'Story-level enchantment; Rank VIII requires world-event approval.',notes:'Often appears as relic, divine, shard, or world-event magic.'}
  };
  function now(){return new Date().toISOString();}
  function uid(p='ench'){return p+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);}
  function read(){try{return JSON.parse(localStorage.getItem(STORE)||'null')||{projects:[],approvals:[],log:[],spellCompat:{}};}catch(e){return {projects:[],approvals:[],log:[],spellCompat:{}};}}
  function write(s){localStorage.setItem(STORE,JSON.stringify(s)); if(window.asteriaDataSync?.saveAppState) window.asteriaDataSync.saveAppState({enchantments:s});}
  function notifyEnch(level,title,msg,type='magic',opts={}){ if(typeof notify==='function') notify(level,title,msg,type,Object.assign({important:level==='major'},opts)); else toast?.(`${title}: ${msg}`); }
  function logEnch(type,msg,data={},visibility='Public'){const s=read(); s.log.unshift({id:uid('enchlog'),time:now(),type,msg,data,visibility}); s.log=s.log.slice(0,120); write(s); if(typeof slEvent==='function') slEvent('Enchantment',msg,data,visibility);}
  function rankIndex(r){return RANK_ORDER.indexOf(String(r||'I').replace('Rank ','').trim());}
  function rankLE(a,b){return rankIndex(a)<=rankIndex(b);}
  function charsOptions(sel){return Object.keys(window.chars||{}).map(id=>`<option value="${id}" ${id===sel?'selected':''}>${chars[id].name}</option>`).join('');}
  function spellOptions(sel){return Object.values(SPELLS).map(sp=>`<option value="${sp.id}" ${sp.id===sel?'selected':''}>${sp.name} — ${sp.type}</option>`).join('');}
  function bindingOptions(sel){return BINDINGS.map(b=>`<option ${b===sel?'selected':''}>${b}</option>`).join('');}
  function rankOptions(sel='I'){return RANK_ORDER.map(r=>`<option value="${r}" ${r===sel?'selected':''}>${RANKS[r]}</option>`).join('');}
  function soulOptions(sel='Basic'){return SOUL_RANKS.map(r=>`<option ${r===sel?'selected':''}>${r}</option>`).join('');}
  function spell(id){return SPELLS[id]||Object.values(SPELLS)[0];}
  function materialFor(name){try{return window.ASTERIA_MATERIAL_SYSTEM?.getMaterial?.(name)||window.ASTERIA_MATERIAL_SYSTEM?.materials?.[name];}catch(e){return null;}}
  function materialOptions(sel='Steel'){try{const mats=Object.values(window.ASTERIA_MATERIAL_SYSTEM?.materials||{}); if(mats.length)return mats.map(m=>`<option value="${m.name}" ${m.name===sel?'selected':''}>${m.name} — ${m.itemClass}</option>`).join('');}catch(e){} return ['Iron','Steel','Silverwood','Mythril','Voidglass','Relic Core'].map(x=>`<option ${x===sel?'selected':''}>${x}</option>`).join('');}
  function instabilityScore(p){const sp=spell(p.sourceSpell); const mat=materialFor(p.material)||{}; let score=0; score+=rankIndex(p.spellRank); if(!rankLE(p.spellRank, mat.maxEnchantRank||sp.maxRank||'III')) score+=3; if(p.itemClass==='Legendary'||p.itemClass==='Relic') score+=1; if(['VII','VIII'].includes(p.spellRank)) score+=3; if(sp.canEnchant==='GM Only') score+=1; if(mat.stability==='Volatile') score+=2; if(mat.stability==='High') score-=1; if(SOUL_RANKS.indexOf(p.soulRank)>=SOUL_RANKS.indexOf(sp.soul||'Basic')) score-=1; return Math.max(0,score);}
  function riskFromScore(score){return score>=9?'Catastrophic':score>=7?'Volatile':score>=5?'Unstable':score>=3?'Strained':'Stable';}
  function validateProject(p){const sp=spell(p.sourceSpell); const mat=materialFor(p.material)||{}; const warnings=[]; if(sp.canEnchant==='No') warnings.push('Source spell cannot normally be enchanted.'); if(sp.canEnchant==='GM Only') warnings.push('Spell is GM-only for enchantment.'); if(!sp.bindings.includes(p.bindingType)) warnings.push('Selected binding type is not normally allowed for this spell.'); if(!rankLE(p.spellRank, sp.maxRank)) warnings.push(`Spell compatibility max is ${RANKS[sp.maxRank]}.`); if(mat.maxEnchantRank && !rankLE(p.spellRank,mat.maxEnchantRank)) warnings.push(`Material cap is ${RANKS[mat.maxEnchantRank]}.`); if(['VII','VIII'].includes(p.spellRank)) warnings.push('Rank VII/VIII requires GM story approval.'); return warnings;}
  function serialize(prefix='ench'){const g=id=>document.getElementById(prefix+id); const p={id:g('Id')?.value||uid('ench'),status:g('Status')?.value||'Draft',name:g('Name')?.value||'Unnamed Enchantment',characterId:g('Character')?.value||selected,sourceSpell:g('Spell')?.value||'fireball',spellRank:g('Rank')?.value||'I',bindingType:g('Binding')?.value||'Weapon Binding',boundItem:g('Item')?.value||'',itemClass:g('Class')?.value||'Common',material:g('Material')?.value||'Steel',requiredSkill:g('Skill')?.value||'Enchanting',requiredRank:g('SkillRank')?.value||'Initiate',soulRank:g('SoulRank')?.value||'Basic',resourceReq:g('Resource')?.value||'',activation:g('Activation')?.value||'Action',trigger:g('Trigger')?.value||'On use',cooldown:g('Cooldown')?.value||'',duration:g('Duration')?.value||'',chargesMax:Number(g('ChargesMax')?.value||0),chargesCurrent:Number(g('ChargesCurrent')?.value||0),effect:g('Effect')?.value||'',gmNotes:g('GMNotes')?.value||'',visibility:g('Visibility')?.value||'Public',roll:Number(g('Roll')?.value||0),skillMod:Number(g('SkillMod')?.value||0),spellMod:Number(g('SpellMod')?.value||0),materialMod:Number(g('MaterialMod')?.value||0),soulMod:Number(g('SoulMod')?.value||0),toolMod:Number(g('ToolMod')?.value||0),envMod:Number(g('EnvMod')?.value||0),gmMod:Number(g('GMMod')?.value||0),outcome:g('Outcome')?.value||''}; p.finalRoll=p.roll+p.skillMod+p.spellMod+p.materialMod+p.soulMod+p.toolMod+p.envMod+p.gmMod; p.warnings=validateProject(p); p.risk=riskFromScore(instabilityScore(p)); p.stability=p.risk; p.updatedAt=now(); return p;}
  function outcome(total){return total>=75?'Success':total>=50?'Partial Success':total>=25?'Major Failure':'Catastrophic Failure';}
  function snapshot(p){const sp=spell(p.sourceSpell); return {id:uid('enchitem'),name:p.boundItem||`${p.name} Item`,type:'Enchanted Item',rarity:p.itemClass,itemClass:p.itemClass,material:p.material,source:'Enchantment Project',enchanted:true,enchantment:{name:p.name,sourceSpellId:sp.id,sourceSpell:sp.name,spellRank:p.spellRank,rankLabel:RANKS[p.spellRank],bindingType:p.bindingType,chargesMax:p.chargesMax,chargesCurrent:p.chargesCurrent,cooldown:p.cooldown,trigger:p.trigger,activation:p.activation,duration:p.duration,stability:p.stability,instabilityRisk:p.risk,effectSummary:p.effect||sp.summary,visibility:p.visibility,gmHidden:p.visibility==='GM-only',soulStone:p.soulRank,sourceSpellVersion:'Spell Page v1',materialVersion:'Material System v1',createdAt:now(),snapshotLocked:true},desc:`${p.bindingType} linked to ${sp.name}. ${p.effect||sp.summary}`};}
  function preview(prefix='ench'){const p=serialize(prefix); const sp=spell(p.sourceSpell); const mat=materialFor(p.material)||{}; const host=document.getElementById(prefix+'Preview'); if(!host)return; host.innerHTML=`<div class="enchant-preview-grid"><div><small>Source Spell</small><b>${sp.name}</b><span>${sp.type} • ${RANKS[p.spellRank]}</span></div><div><small>Binding</small><b>${p.bindingType}</b><span>${p.boundItem||'No item selected'}</span></div><div><small>Material Cap</small><b>${mat.maxEnchantRank?RANKS[mat.maxEnchantRank]:'Unknown'}</b><span>${p.material}</span></div><div><small>Stability</small><b class="risk-${p.risk.toLowerCase()}">${p.risk}</b><span>${p.warnings.length?'Requires review':'Compatible'}</span></div><div><small>Final Roll</small><b>${p.finalRoll}</b><span>${p.outcome||outcome(p.finalRoll)}</span></div><div><small>Charges</small><b>${p.chargesCurrent}/${p.chargesMax}</b><span>${p.activation} • ${p.cooldown||'No cooldown'}</span></div></div>${p.warnings.length?`<div class="enchant-warning"><b>Warnings</b>${p.warnings.map(w=>`<p>⚠ ${w}</p>`).join('')}</div>`:''}<p class="muted smallnote">${sp.notes}</p>`;}
  window.updateEnchantPreview=()=>preview('ench');
  window.saveEnchantProject=function(){const p=serialize('ench'); p.outcome=p.outcome||outcome(p.finalRoll); const s=read(); const i=s.projects.findIndex(x=>x.id===p.id); if(i>=0)s.projects[i]=p; else s.projects.unshift(p); write(s); notifyEnch('small','Enchantment Saved',`${p.name} saved.`); logEnch('Project Saved',`Enchantment project saved: ${p.name}`,p,p.visibility); renderEnchantPanels();};
  window.startEnchantProject=function(){const p=serialize('ench'); p.status='In Review'; p.outcome=p.outcome||outcome(p.finalRoll); const s=read(); s.projects.unshift(p); if(p.warnings.length||['VII','VIII'].includes(p.spellRank)||p.visibility==='GM-only') s.approvals.unshift({id:p.id,projectName:p.name,characterId:p.characterId,status:'Pending GM Approval',rank:p.spellRank,warnings:p.warnings,time:now()}); write(s); notifyEnch('medium','Enchantment Project Started',`${p.name} is ready for GM review.`); logEnch('Project Started',`${p.name} started using ${spell(p.sourceSpell).name}.`,p,p.visibility); renderEnchantPanels();};
  window.approveEnchantProject=function(id){const s=read(); const p=s.projects.find(x=>x.id===id); if(!p)return; p.status='Approved'; p.approvedAt=now(); s.approvals=s.approvals.filter(a=>a.id!==id); write(s); notifyEnch(['VII','VIII'].includes(p.spellRank)?'major':'medium','Enchantment Approved',`${p.name} approved.`); logEnch('GM Approval',`GM approved enchantment: ${p.name}`,p,'GM-only'); renderEnchantPanels();};
  window.rejectEnchantProject=function(id){const s=read(); const p=s.projects.find(x=>x.id===id); if(p)p.status='Rejected'; s.approvals=s.approvals.filter(a=>a.id!==id); write(s); notifyEnch('medium','Enchantment Rejected',`${p?.name||'Project'} rejected.`,'warning'); logEnch('GM Rejection',`GM rejected enchantment: ${p?.name||id}`,p||{},'GM-only'); renderEnchantPanels();};
  window.completeEnchantProject=function(id){const s=read(); const p=s.projects.find(x=>x.id===id); if(!p)return; p.outcome=p.outcome||outcome(p.finalRoll); p.finalSnapshot=snapshot(p); p.status='Completed'; p.completedAt=now(); write(s); const level=p.outcome==='Catastrophic Failure'||['VII','VIII'].includes(p.spellRank)?'major':'medium'; notifyEnch(level,p.outcome==='Success'?'Enchanted Item Created':`Enchantment ${p.outcome}`,`${p.name}: ${p.outcome}.`,p.outcome==='Catastrophic Failure'?'warning':'magic'); logEnch('Project Completed',`${p.name} completed: ${p.outcome}`,{project:p,item:p.finalSnapshot,roll:p.finalRoll,outcome:p.outcome,instability:p.risk},p.visibility); if(p.outcome==='Success'||p.outcome==='Partial Success'){ if(window.asteriaTransaction?.create){window.asteriaTransaction.create({type:'enchantedItem',source:'Enchantment Project',playerId:p.characterId,items:[p.finalSnapshot],destination:'inventory',summary:`Enchanted item created: ${p.finalSnapshot.name}`,gmApproved:p.status==='Approved'});} else if(chars?.[p.characterId]){chars[p.characterId].inventory=chars[p.characterId].inventory||[];chars[p.characterId].inventory.push(p.finalSnapshot);} } saveAsteriaState?.(); renderEnchantPanels(); loadPlayer?.(p.characterId);};
  window.loadEnchantProject=function(id){const p=read().projects.find(x=>x.id===id); if(!p)return; setGMSystemPanel?.('enchantments'); setTimeout(()=>{const map={Id:p.id,Status:p.status,Name:p.name,Character:p.characterId,Spell:p.sourceSpell,Rank:p.spellRank,Binding:p.bindingType,Item:p.boundItem,Class:p.itemClass,Material:p.material,Skill:p.requiredSkill,SkillRank:p.requiredRank,SoulRank:p.soulRank,Resource:p.resourceReq,Activation:p.activation,Trigger:p.trigger,Cooldown:p.cooldown,Duration:p.duration,ChargesMax:p.chargesMax,ChargesCurrent:p.chargesCurrent,Effect:p.effect,GMNotes:p.gmNotes,Visibility:p.visibility,Roll:p.roll,SkillMod:p.skillMod,SpellMod:p.spellMod,MaterialMod:p.materialMod,SoulMod:p.soulMod,ToolMod:p.toolMod,EnvMod:p.envMod,GMMod:p.gmMod,Outcome:p.outcome}; Object.entries(map).forEach(([k,v])=>{const el=document.getElementById('ench'+k); if(el)el.value=v??'';}); preview('ench');},60);};
  window.useEnchantmentCharge=function(itemId,charId){const c=chars?.[charId||selected]; if(!c)return; const inv=c.inventory||[]; const item=inv.find(i=>i.id===itemId); if(!item?.enchantment)return; if(item.enchantment.chargesCurrent<=0){notifyEnch('medium','Charge Depleted',`${item.name} has no charges left.`,'warning');return;} item.enchantment.chargesCurrent--; notifyEnch('small','Enchantment Triggered',`${item.enchantment.sourceSpell} activated from ${item.name}.`); logEnch('Enchantment Triggered',`${c.name} triggered ${item.name}.`,{character:c.name,item:item.name,enchantment:item.enchantment},item.enchantment.visibility||'Public'); saveAsteriaState?.(); loadPlayer?.(charId||selected);};
  function projectCard(p){return `<article class="enchant-project-card"><div><b>${p.name}</b><small>${spell(p.sourceSpell).name} • ${RANKS[p.spellRank]} • ${p.bindingType}</small><span>${p.status||'Draft'} • ${p.outcome||outcome(p.finalRoll||0)} • ${p.risk}</span></div><div><button onclick="loadEnchantProject('${p.id}')">Load</button><button onclick="approveEnchantProject('${p.id}')">Approve</button><button class="primary" onclick="completeEnchantProject('${p.id}')">Complete</button></div></article>`;}
  function approvalCard(a){return `<article class="approval-row"><div><b>${a.projectName}</b><small>${chars?.[a.characterId]?.name||'Unknown'} • ${RANKS[a.rank]||a.rank}</small>${(a.warnings||[]).map(w=>`<em>⚠ ${w}</em>`).join('')}</div><div><button class="primary" onclick="approveEnchantProject('${a.id}')">Approve</button><button class="danger" onclick="rejectEnchantProject('${a.id}')">Reject</button></div></article>`;}
  function spellCompatCard(sp){return `<article class="spell-compat-card"><div><h4>${sp.name}</h4><span class="magic-chip ${sp.type.toLowerCase()}">${sp.type}</span></div><p>${sp.summary}</p><div class="spell-compat-grid"><span>Can enchant: <b>${sp.canEnchant}</b></span><span>Max: <b>${RANKS[sp.maxRank]}</b></span><span>Soul: <b>${sp.soul}</b></span><span>Skill: <b>${sp.skillRank}</b></span></div><p><b>Allowed:</b> ${sp.bindings.join(', ')}</p><p class="muted smallnote">${sp.restricted}</p></article>`;}
  function enchantForm(prefix='ench'){return `<input type="hidden" id="${prefix}Id"><input type="hidden" id="${prefix}Status" value="Draft"><div class="enchant-form-grid"><label>Enchantment Name<input id="${prefix}Name" placeholder="Flameburst Edge"></label><label>Character<select id="${prefix}Character">${charsOptions(selected)}</select></label><label>Source Spell<select id="${prefix}Spell" onchange="updateEnchantPreview()">${spellOptions()}</select></label><label>Spell Rank<select id="${prefix}Rank" onchange="updateEnchantPreview()">${rankOptions('II')}</select></label><label>Binding Type<select id="${prefix}Binding" onchange="updateEnchantPreview()">${bindingOptions()}</select></label><label>Bound Item<input id="${prefix}Item" placeholder="Steel Sword, Wand Core..."></label><label>Item Class<select id="${prefix}Class" onchange="updateEnchantPreview()">${['Common','Uncommon','Unusual','Rare','Epic','Mythic','Legendary','Relic'].map(x=>`<option>${x}</option>`).join('')}</select></label><label>Material<select id="${prefix}Material" onchange="updateEnchantPreview()">${materialOptions()}</select></label><label>Required Skill<input id="${prefix}Skill" value="Enchanting"></label><label>Required Skill Rank<input id="${prefix}SkillRank" value="Initiate"></label><label>Soul Stone Rank<select id="${prefix}SoulRank" onchange="updateEnchantPreview()">${soulOptions('Basic')}</select></label><label>MP / Charge / Resource<input id="${prefix}Resource" placeholder="1 charge, 10 MP, 2 HP..."></label><label>Activation Type<input id="${prefix}Activation" value="Action"></label><label>Trigger Condition<input id="${prefix}Trigger" value="On use"></label><label>Cooldown<input id="${prefix}Cooldown" placeholder="1 round, 1 rest..."></label><label>Duration<input id="${prefix}Duration" placeholder="Instant, 1 minute..."></label><label>Max Charges<input id="${prefix}ChargesMax" type="number" value="3" oninput="updateEnchantPreview()"></label><label>Current Charges<input id="${prefix}ChargesCurrent" type="number" value="3" oninput="updateEnchantPreview()"></label><label>Visibility<select id="${prefix}Visibility"><option>Public</option><option>GM-only</option><option>Hidden Until Revealed</option></select></label><label>Effect Summary<textarea id="${prefix}Effect" placeholder="Reduced fire burst on hit..."></textarea></label><label>GM Notes<textarea id="${prefix}GMNotes" placeholder="Hidden curse, instability consequence..."></textarea></label></div><details open><summary>Manual d100 Enchanting Check</summary><div class="enchant-form-grid compact"><label>Base d100 Roll<input id="${prefix}Roll" type="number" min="1" max="100" value="0" oninput="updateEnchantPreview()"></label><label>Enchanting Skill Mod<input id="${prefix}SkillMod" type="number" value="0" oninput="updateEnchantPreview()"></label><label>Spell Skill Mod<input id="${prefix}SpellMod" type="number" value="0" oninput="updateEnchantPreview()"></label><label>Material Mod<input id="${prefix}MaterialMod" type="number" value="0" oninput="updateEnchantPreview()"></label><label>Soul Stone Mod<input id="${prefix}SoulMod" type="number" value="0" oninput="updateEnchantPreview()"></label><label>Tool Mod<input id="${prefix}ToolMod" type="number" value="0" oninput="updateEnchantPreview()"></label><label>Environment Mod<input id="${prefix}EnvMod" type="number" value="0" oninput="updateEnchantPreview()"></label><label>GM Mod<input id="${prefix}GMMod" type="number" value="0" oninput="updateEnchantPreview()"></label><label>Outcome Override<select id="${prefix}Outcome" onchange="updateEnchantPreview()"><option value="">Auto from roll</option><option>Success</option><option>Partial Success</option><option>Major Failure</option><option>Catastrophic Failure</option></select></label></div></details><div id="${prefix}Preview" class="enchant-preview"></div><div class="enchant-button-row"><button onclick="updateEnchantPreview()">Preview Binding</button><button onclick="saveEnchantProject()">Save Draft</button><button class="primary" onclick="startEnchantProject()">Start Project</button></div>`;}
  function installPlayerEnchantPanel(){return;}
  function installGMEnchantPanel(){const gmPanels=document.querySelector('#gm .gm-panels'); if(!gmPanels||document.getElementById('gmEnchantPanel'))return; const panel=document.createElement('section'); panel.className='card gm-enchant-panel'; panel.id='gmEnchantPanel'; panel.dataset.gmSystem='enchantments'; panel.innerHTML=`<div class="section-head"><div><p class="eyebrow">GM Enchantments</p><h3>Spell-Linked Binding System</h3></div><span class="pill">${VERSION}</span></div><p class="muted smallnote">Approve enchantments, override material or rank limits, apply curses, set charges, and control Rank VII/VIII bindings.</p><div class="craft-gm-grid"><section><h4>Approval Queue</h4><div id="enchantApprovalQueue"></div></section><section><h4>Project Manager</h4><div id="gmEnchantProjectList"></div></section></div><details><summary>GM Enchantment Builder / Override</summary>${enchantForm('ench')}<div class="enchant-button-row"><button onclick="saveEnchantProject()">Save GM Override</button><button class="danger" onclick="notifyEnch('major','Catastrophic Binding Failure','Backlash, curse, explosion, corruption, or wild magic event triggered.','warning')">Force Catastrophic Consequence</button></div></details><h4>Spell Compatibility Source Data</h4><div class="spell-compat-scroll">${Object.values(SPELLS).map(spellCompatCard).join('')}</div><h4>Enchantment Log</h4><div id="enchantLogList"></div>`; gmPanels.appendChild(panel);}
  function renderEnchantPanels(){const s=read(); const list=document.getElementById('enchantProjectList'); if(list) list.innerHTML=(s.projects||[]).map(projectCard).join('')||'<p class="muted smallnote">No enchantment projects yet.</p>'; const gm=document.getElementById('gmEnchantProjectList'); if(gm) gm.innerHTML=(s.projects||[]).map(projectCard).join('')||'<p class="muted smallnote">No enchantment projects yet.</p>'; const ap=document.getElementById('enchantApprovalQueue'); if(ap) ap.innerHTML=(s.approvals||[]).map(approvalCard).join('')||'<p class="muted smallnote">No enchantment approvals pending.</p>'; const log=document.getElementById('enchantLogList'); if(log) log.innerHTML=(s.log||[]).slice(0,30).map(l=>`<div class="craft-log-row"><b>${l.type}</b><span>${l.msg}</span><small>${new Date(l.time).toLocaleString()} • ${l.visibility}</small></div>`).join('')||'<p class="muted smallnote">No enchantment log entries yet.</p>'; renderInventoryEnchantmentBadges();}
  function renderInventoryEnchantmentBadges(){document.querySelectorAll('.inventory-item,.item-row,.slot-item').forEach(el=>{if(el.dataset.enchPatched)return; const txt=el.textContent||''; const id=(currentPlayerId?.()||selected); const c=chars?.[id]; const item=(c?.inventory||[]).find(i=>txt.includes(i.name)&&i.enchantment); if(!item)return; el.dataset.enchPatched='1'; el.insertAdjacentHTML('beforeend',`<div class="ench-inventory-badge"><b>✦ ${item.enchantment.sourceSpell}</b><span>${item.enchantment.rankLabel} • ${item.enchantment.bindingType}</span><small>Charges ${item.enchantment.chargesCurrent}/${item.enchantment.chargesMax}</small><button onclick="useEnchantmentCharge('${item.id}','${id}')">Activate</button></div>`);});}
  function installSpellPageIntegration(){const host=document.querySelector('#library .rule-content, #library .content-panel, #library'); if(!host||document.getElementById('spellEnchantCompatPanel'))return; const panel=document.createElement('section'); panel.className='card spell-enchant-compat-panel'; panel.id='spellEnchantCompatPanel'; panel.innerHTML=`<div class="section-head"><div><p class="eyebrow">Spell Pages</p><h3>Enchantment Compatibility</h3></div><span class="pill">Spell = Source Effect</span></div><p class="muted smallnote">Spell pages now carry compatibility data instead of creating duplicate enchantment pages. Enchantments reference these spell records.</p><div class="spell-compat-scroll">${Object.values(SPELLS).map(spellCompatCard).join('')}</div>`; host.appendChild(panel);}
  function patchGMSystems(){try{ if(Array.isArray(asteriaGMSystems)&&!asteriaGMSystems.find(s=>s.id==='enchantments')){const mat=asteriaGMSystems.findIndex(s=>s.id==='materials'); asteriaGMSystems.splice(mat>=0?mat+1:asteriaGMSystems.length,0,{id:'enchantments',label:'Enchantments',hint:'Spell-linked bindings, approvals, instability, charges'});} }catch(e){}}
  function patchCraftingUI(){const forms=document.querySelectorAll('.crafting-panel details,.gm-crafting-panel details'); forms.forEach(f=>{if(f.querySelector('.craft-add-enchantment-step'))return; const div=document.createElement('div'); div.className='craft-add-enchantment-step'; div.innerHTML=`<h4>Optional Enchantment Step</h4><p class="muted smallnote">Crafting can create mundane items or route into the Spell-Linked Binding System for one primary enchantment.</p><button onclick="document.getElementById('gmEnchantPanel')?.scrollIntoView({behavior:'smooth'})">Open Enchantment Builder</button>`; f.appendChild(div);});}
  function refreshAll(){patchGMSystems(); installPlayerEnchantPanel(); installGMEnchantPanel(); installSpellPageIntegration(); patchCraftingUI(); renderEnchantPanels(); preview('ench'); const b=document.querySelector('.version-badge'); if(b)b.textContent=VERSION; if(typeof applyGMSystemPanel==='function')applyGMSystemPanel(); window.ASTERIA_ENCHANTMENT_SYSTEM={VERSION,RANKS,BINDINGS,SPELLS,read,createSnapshot:snapshot,validateProject};}
  window.AsteriaViewHooks?.afterPlayerLoad('enchantment-system', () => refreshAll());
  window.AsteriaViewHooks?.afterGMRender('enchantment-system', () => refreshAll());
  window.AsteriaViewHooks?.afterView('enchantment-system', null, id => {if(id!=='gm'&&id!=='player')refreshAll();});
  document.addEventListener('DOMContentLoaded',()=>setTimeout(refreshAll,1100));
})();

/* =====================================================
   Asteria v1.7.3.1 — World Economy System v1
   Controlled Dynamic Economy integrated into current UI.
   Economy modifies transaction prices only; compendium base values remain stable.
   ===================================================== */
(function(){
  const VERSION='v1.7.3.1 • World Economy System v1';
  const STORE='asteria_world_economy_v1';
  const WEALTH={Destitute:.6,Poor:.8,Modest:.9,Comfortable:1,Wealthy:1.2,Noble:1.5,Royal:2};
  const SUPPLY={'Oversupply':.75,'High Supply':.9,Balanced:1,'Low Supply':1.25,Scarcity:1.5,'Crisis Shortage':2};
  const DEMAND={'No Demand':.7,'Low Demand':.85,'Normal Demand':1,'High Demand':1.25,'Extreme Demand':1.5,'Panic Demand':2};
  const TRADE={Stable:1,Strained:1.1,Disrupted:1.3,Blockaded:1.75,Collapsed:2.5,'Black Market Only':3};
  const RISK={Safe:1,Guarded:1.05,Risky:1.15,Dangerous:1.35,Deadly:1.75,Corrupted:2};
  const SPEED={Slow:.75,Standard:1,Fast:1.5,Urgent:2.25};
  const ROUTE_STATE={Open:1,Delayed:1.15,Dangerous:1.35,Taxed:1.25,Blockaded:1.85,Closed:99,'Secret / Black Market':2.5};
  const TRENDS=['Falling','Slightly Falling','Stable','Slightly Rising','Rising','Spiking'];
  const EVENTS=['Harvest Season','Poor Harvest','War','Siege','Festival','Trade Boom','Trade Collapse','Monster Attacks','Bandit Activity','Shattered Zone Expansion','Shattered Zone Cleansed','Leyline Surge','Mine Discovery','Mine Collapse','Plague','Royal Tax','Guild Strike','Black Market Surge'];
  const CURRENCY=['Copper / Pennies','Silver / Marks','Gold / Crowns','Platinum Crown','Royal Crown','Royal Platinum'];
  const START={
    settings:{globalInflation:1,globalDeflation:1,resourceScarcity:1,tradeDisruption:1,shippingCost:1,blackMarketPressure:1,freeze:false,hideBreakdown:true},
    regions:{
      greystone:{id:'greystone',name:'Greystone',region:'Raemar / Palladium',wealth:'Comfortable',currencyStrength:1,supply:'Balanced',demand:'Normal Demand',trade:'Stable',risk:'Guarded',shipping:'Road, river, guild caravan',exports:['Worked steel','grain','guild services'],imports:['rare crystals','spices','soul stones'],scarce:['Voidglass','Relic Core'],surplus:['Iron','Common tools'],events:[],notes:'Capital market; reliable but heavily taxed.',visibility:'Public'},
      edenvale:{id:'edenvale',name:'Edenvale',region:'Raemar',wealth:'Modest',currencyStrength:.95,supply:'Low Supply',demand:'High Demand',trade:'Strained',risk:'Risky',shipping:'Forest roads, druidic guides',exports:['Fae wood','herbs','living bark'],imports:['metals','finished weapons'],scarce:['Mythril','Black steel'],surplus:['Silverwood','healing herbs'],events:['Leyline Surge'],notes:'Worldroot and fae influence; magic-sensitive materials fluctuate.',visibility:'Public'},
      eziroth:{id:'eziroth',name:'Zenyrth Markets',region:'Eziroth',wealth:'Wealthy',currencyStrength:1.1,supply:'Scarcity',demand:'Extreme Demand',trade:'Disrupted',risk:'Dangerous',shipping:'Desert caravan',exports:['glass','salt','sunstone'],imports:['water','timber','cloth'],scarce:['Water','Wood','Food'],surplus:['Glass','Fire-aligned crystal'],events:['Bandit Activity'],notes:'Desert trade makes shipping risk a major price driver.',visibility:'Public'}
    },
    routes:{
      greystone_edenvale:{id:'greystone_edenvale',name:'Greystone ↔ Edenvale Forest Road',start:'Greystone',end:'Edenvale',distance:3,method:'Caravan',risk:'Risky',stability:'Delayed',goods:['herbs','wood','food'],restricted:['fate-touched fae goods'],shippingModifier:1.15,state:'Delayed',events:['Fae route permissions'],notes:'Safe when guides are hired.'},
      greystone_eziroth:{id:'greystone_eziroth',name:'Greystone ↔ Eziroth Desert Caravan',start:'Greystone',end:'Zenyrth Markets',distance:8,method:'Caravan',risk:'Dangerous',stability:'Dangerous',goods:['salt','glass','grain'],restricted:['water ration rights'],shippingModifier:1.6,state:'Dangerous',events:['Bandit Activity'],notes:'High reward, high loss chance.'}
    },
    events:[], overrides:{}, priceLog:[]
  };
  function now(){return new Date().toISOString();}
  function uid(p='eco'){return p+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);}
  function read(){try{return Object.assign({},START,JSON.parse(localStorage.getItem(STORE)||'{}')||{});}catch(e){return structuredClone?structuredClone(START):JSON.parse(JSON.stringify(START));}}
  function write(s){localStorage.setItem(STORE,JSON.stringify(s)); if(window.asteriaDataSync?.saveAppState) window.asteriaDataSync.saveAppState({economy:s});}
  function money(n){n=Math.max(0,Math.round(Number(n||0))); if(n>=10000)return (n/10000).toFixed(1)+' Royal Platinum'; if(n>=1000)return (n/1000).toFixed(1)+' Royal Crown'; if(n>=100)return (n/100).toFixed(1)+' Crowns'; if(n>=10)return Math.round(n/10)+' Marks'; return n+' Pennies';}
  function opt(obj,val){return Object.keys(obj).map(k=>`<option ${k===val?'selected':''}>${k}</option>`).join('');}
  function arrText(a){return Array.isArray(a)?a.join(', '):(a||'—');}
  function notifyEco(level,title,msg,type='economy',opts={}){ if(typeof notify==='function') notify(level,title,msg,type,Object.assign({important:level==='major'},opts)); else if(typeof asteriaNotify==='function') asteriaNotify({level,title,message:msg,type}); else toast?.(`${title}: ${msg}`); }
  function logEco(type,msg,data={},visibility='Public'){const s=read(); s.priceLog=s.priceLog||[]; s.priceLog.unshift({id:uid('ecolog'),time:now(),type,msg,data,visibility}); s.priceLog=s.priceLog.slice(0,160); write(s); if(typeof slEvent==='function') slEvent('Economy',msg,Object.assign({type},data),visibility);}
  function region(id){const s=read(); return s.regions[id]||s.regions.greystone||Object.values(s.regions)[0];}
  function modifierBreakdown(base=100, regionId='greystone', extra={}){const s=read(); const r=region(regionId); const gm=Number(extra.gmModifier ?? s.settings.gmModifier ?? 1); const global=Number(s.settings.globalInflation||1)*Number(s.settings.globalDeflation||1)*Number(s.settings.resourceScarcity||1)*Number(s.settings.tradeDisruption||1);
    const parts={base:Number(base||0),wealth:WEALTH[r.wealth]||1,supply:SUPPLY[r.supply]||1,demand:DEMAND[r.demand]||1,trade:TRADE[r.trade]||1,risk:RISK[r.risk]||1,currencyStrength:Number(r.currencyStrength||1),global,gm};
    const final=Math.round(parts.base*parts.wealth*parts.supply*parts.demand*parts.trade*parts.risk*parts.currencyStrength*parts.global*parts.gm);
    let trend='Stable'; if(final>base*1.8) trend='Spiking'; else if(final>base*1.35) trend='Rising'; else if(final>base*1.1) trend='Slightly Rising'; else if(final<base*.7) trend='Falling'; else if(final<base*.9) trend='Slightly Falling';
    return {region:r,parts,final,trend,gmHidden:s.settings.hideBreakdown};
  }
  function shippingCost(opts={}){const s=read(); const route=s.routes[opts.routeId]||Object.values(s.routes)[0]||{}; const distance=Number(opts.distance||route.distance||1); const weight=Number(opts.weight||1); const risk=RISK[opts.risk||route.risk]||1; const routeMod=(ROUTE_STATE[opts.state||route.state]||1)*Number(route.shippingModifier||1); const speed=SPEED[opts.speed||'Standard']||1; const gm=Number(opts.gmModifier||1)*Number(s.settings.shippingCost||1); const closed=(opts.state||route.state)==='Closed'; const cost=closed?null:Math.round(distance*weight*risk*routeMod*speed*gm*10); return {route,cost,speed:opts.speed||'Standard',risk:opts.risk||route.risk||'Safe',state:opts.state||route.state||'Open',eta:closed?'Unavailable':`${Math.max(1,Math.ceil(distance/(speed>.9?2:1)))} day(s)`,delayChance:closed?'Route closed':Math.min(75,Math.round((risk*routeMod-1)*30))+'%',lossChance:closed?'Route closed':Math.min(45,Math.round((risk*routeMod-1)*12))+'%'};}
  function priceCard(item='Iron Ingot',base=25,regionId='greystone',gmMod=1){const x=modifierBreakdown(base,regionId,{gmModifier:gmMod}); const icon=x.trend.includes('Rising')||x.trend==='Spiking'?'▲':x.trend.includes('Falling')?'▼':'◆'; return `<article class="economy-price-card"><div><b>${item}</b><small>${x.region.name} • ${icon} ${x.trend}</small></div><strong>${money(x.final)}</strong><span class="eco-tag ${x.trend.toLowerCase().replace(/\s+/g,'-')}">${x.region.supply}</span><details><summary>GM price breakdown</summary><ul>${Object.entries(x.parts).map(([k,v])=>`<li>${k}: ${typeof v==='number'?v.toFixed(2):v}</li>`).join('')}</ul></details></article>`;}
  function regionCard(r){return `<article class="economy-region-card"><div class="section-head mini"><div><h4>${r.name}</h4><small>${r.region}</small></div><span class="pill">${r.visibility}</span></div><div class="eco-tags"><span>${r.wealth}</span><span>${r.supply}</span><span>${r.demand}</span><span>${r.trade}</span><span>${r.risk}</span></div><p class="muted smallnote"><b>Exports:</b> ${arrText(r.exports)}<br><b>Imports:</b> ${arrText(r.imports)}<br><b>Scarce:</b> ${arrText(r.scarce)}<br><b>Surplus:</b> ${arrText(r.surplus)}</p><button onclick="selectEconomyRegion('${r.id}')">Edit Region</button></article>`;}
  function routeRow(rt){const sc=shippingCost({routeId:rt.id}); return `<div class="trade-route-row"><div><b>${rt.name}</b><small>${rt.state} • ${rt.risk} • ${rt.method}</small></div><span>${money(sc.cost||0)} shipping</span><small>ETA ${sc.eta} • Delay ${sc.delayChance}</small><button onclick="toggleTradeRoute('${rt.id}')">Cycle State</button></div>`;}
  function eventRow(ev){return `<div class="economy-event-row ${ev.visibility==='GM-only'?'gm-only':''}"><div><b>${ev.name}</b><small>${ev.location||'Global'} • ${ev.type}</small></div><span>${ev.impact||'GM-defined impact'}</span><small>${new Date(ev.time).toLocaleString()} • ${ev.visibility}</small></div>`;}
  function renderEconomyPanels(){renderGMEconomy(); renderPlayerEconomyHints(); renderShopEconomy(); renderMaterialEconomy();}
  function renderGMEconomy(){const el=document.getElementById('gmEconomyDashboard'); if(!el)return; const s=read(); const regs=Object.values(s.regions); const routes=Object.values(s.routes); el.innerHTML=`<div class="economy-control-grid"><label>Global Inflation<input id="ecoInflation" type="number" step="0.05" value="${s.settings.globalInflation}"></label><label>Global Deflation<input id="ecoDeflation" type="number" step="0.05" value="${s.settings.globalDeflation}"></label><label>Resource Scarcity<input id="ecoScarcity" type="number" step="0.05" value="${s.settings.resourceScarcity}"></label><label>Trade Disruption<input id="ecoTradeDisruption" type="number" step="0.05" value="${s.settings.tradeDisruption}"></label><label>Shipping Cost<input id="ecoShippingCost" type="number" step="0.05" value="${s.settings.shippingCost}"></label><label>Black Market Pressure<input id="ecoBlackMarket" type="number" step="0.05" value="${s.settings.blackMarketPressure}"></label><label><input id="ecoFreeze" type="checkbox" ${s.settings.freeze?'checked':''}> Freeze Economy Updates</label><label><input id="ecoHideBreakdown" type="checkbox" ${s.settings.hideBreakdown?'checked':''}> Hide Formula From Players</label></div><div class="panel-actions"><button class="primary" onclick="saveEconomySettings()">Save Economy Controls</button><button onclick="triggerEconomicEvent()">Trigger Event</button><button onclick="logEconomyShift()">Log Market Shift</button></div><h4>Price Calculator</h4><div class="economy-calc-grid"><label>Item / Material<input id="ecoCalcItem" value="Iron Ingot"></label><label>Base Value<input id="ecoCalcBase" type="number" value="25"></label><label>Region<select id="ecoCalcRegion">${regs.map(r=>`<option value="${r.id}">${r.name}</option>`).join('')}</select></label><label>GM Modifier<input id="ecoCalcGM" type="number" step="0.05" value="1"></label><button onclick="previewEconomyPrice()">Preview Price</button></div><div id="ecoPricePreview" class="economy-price-list">${priceCard('Iron Ingot',25,'greystone')}</div><h4>Region Economy Profiles</h4><div id="economyRegionEditor" class="economy-region-editor"></div><div class="economy-region-grid">${regs.map(regionCard).join('')}</div><h4>Trade Routes</h4><div class="trade-route-list">${routes.map(routeRow).join('')}</div><h4>Economic Events + Log</h4><div class="economy-log-list">${(s.events||[]).slice(0,12).map(eventRow).join('')||'<p class="muted">No active economic events.</p>'}${(s.priceLog||[]).slice(0,12).map(l=>`<div class="economy-event-row"><div><b>${l.type}</b><small>${new Date(l.time).toLocaleString()}</small></div><span>${l.msg}</span></div>`).join('')}</div>`;}
  function renderPlayerEconomyHints(){const el=document.getElementById('playerEconomyHints'); if(!el)return; const s=read(); const regs=Object.values(s.regions).filter(r=>r.visibility!=='GM-only'); el.innerHTML=regs.map(r=>`<article class="player-economy-hint"><b>${r.name}</b><span>${r.supply}</span><span>${r.trade}</span><small>${r.events?.length?arrText(r.events):'No public crisis'} • ${r.risk}</small></article>`).join('')||'<p class="muted">No public economy hints.</p>';}
  function renderShopEconomy(){const el=document.getElementById('economyShopPreview'); if(!el)return; el.innerHTML=`${priceCard('Steel Longsword',120,'greystone')}${priceCard('Healing Service',30,'greystone')}${priceCard('Water Ration Crate',50,'eziroth')}`;}
  function renderMaterialEconomy(){const el=document.getElementById('materialEconomyPreview'); if(!el)return; const s=read(); const mats=(window.ASTERIA_MATERIAL_SYSTEM?.materials&&Object.values(window.ASTERIA_MATERIAL_SYSTEM.materials).slice(0,6))||[{name:'Iron',baseValue:10},{name:'Mythril',baseValue:500},{name:'Voidglass',baseValue:700}]; el.innerHTML=mats.map(m=>priceCard(m.name,m.baseValue||25,'greystone')).join('');}
  window.saveEconomySettings=function(){const s=read(); const g=id=>document.getElementById(id); Object.assign(s.settings,{globalInflation:Number(g('ecoInflation')?.value||1),globalDeflation:Number(g('ecoDeflation')?.value||1),resourceScarcity:Number(g('ecoScarcity')?.value||1),tradeDisruption:Number(g('ecoTradeDisruption')?.value||1),shippingCost:Number(g('ecoShippingCost')?.value||1),blackMarketPressure:Number(g('ecoBlackMarket')?.value||1),freeze:!!g('ecoFreeze')?.checked,hideBreakdown:!!g('ecoHideBreakdown')?.checked}); write(s); notifyEco('medium','Economy Controls Updated','Global economy modifiers saved.','economy',{visibility:'GM-only'}); logEco('GM Economy Override','Global economy controls updated.',s.settings,'GM-only'); renderEconomyPanels();};
  window.previewEconomyPrice=function(){const g=id=>document.getElementById(id); const el=document.getElementById('ecoPricePreview'); if(el)el.innerHTML=priceCard(g('ecoCalcItem')?.value||'Item',Number(g('ecoCalcBase')?.value||0),g('ecoCalcRegion')?.value||'greystone',Number(g('ecoCalcGM')?.value||1));};
  window.selectEconomyRegion=function(id){const s=read(); const r=s.regions[id]; const el=document.getElementById('economyRegionEditor'); if(!r||!el)return; el.innerHTML=`<h4>Edit ${r.name}</h4><div class="economy-control-grid"><label>Name<input id="ecoRegName" value="${r.name}"></label><label>Region<input id="ecoRegRegion" value="${r.region}"></label><label>Wealth<select id="ecoRegWealth">${opt(WEALTH,r.wealth)}</select></label><label>Supply<select id="ecoRegSupply">${opt(SUPPLY,r.supply)}</select></label><label>Demand<select id="ecoRegDemand">${opt(DEMAND,r.demand)}</select></label><label>Trade<select id="ecoRegTrade">${opt(TRADE,r.trade)}</select></label><label>Risk<select id="ecoRegRisk">${opt(RISK,r.risk)}</select></label><label>Currency Strength<input id="ecoRegCurrency" type="number" step="0.05" value="${r.currencyStrength}"></label><label>Visibility<select id="ecoRegVisibility"><option ${r.visibility==='Public'?'selected':''}>Public</option><option ${r.visibility==='GM-only'?'selected':''}>GM-only</option><option ${r.visibility==='Hidden Until Revealed'?'selected':''}>Hidden Until Revealed</option></select></label></div><label>GM Notes<textarea id="ecoRegNotes">${r.notes||''}</textarea></label><button class="primary" onclick="saveEconomyRegion('${id}')">Save Region</button>`;};
  window.saveEconomyRegion=function(id){const s=read(); const r=s.regions[id]; if(!r)return; const g=x=>document.getElementById(x); Object.assign(r,{name:g('ecoRegName')?.value||r.name,region:g('ecoRegRegion')?.value||r.region,wealth:g('ecoRegWealth')?.value,supply:g('ecoRegSupply')?.value,demand:g('ecoRegDemand')?.value,trade:g('ecoRegTrade')?.value,risk:g('ecoRegRisk')?.value,currencyStrength:Number(g('ecoRegCurrency')?.value||1),visibility:g('ecoRegVisibility')?.value||'Public',notes:g('ecoRegNotes')?.value||''}); write(s); notifyEco(['Collapsed','Black Market Only'].includes(r.trade)||r.supply==='Crisis Shortage'?'major':'medium','Regional Economy Updated',`${r.name}: ${r.supply}, ${r.demand}, ${r.trade}.`,'economy',{visibility:r.visibility}); logEco('Region Economy Update',`${r.name} economy profile updated.`,r,r.visibility); renderEconomyPanels();};
  window.triggerEconomicEvent=function(){const s=read(); const type=prompt('Economic event type',EVENTS[0]); if(!type)return; const loc=prompt('Location / region affected','Greystone')||'Global'; const impact=prompt('Impact summary','Prices shift by GM modifier; update supply, demand, risk or trade as needed.')||'GM-defined impact'; const ev={id:uid('event'),type,name:type,location:loc,impact,time:now(),visibility:type.includes('Black Market')?'GM-only':'Public'}; s.events.unshift(ev); write(s); const level=/(War|Siege|Collapse|Shattered Zone|Plague|Crisis)/i.test(type)?'major':'medium'; notifyEco(level,type,`${loc}: ${impact}`,'warning',{visibility:ev.visibility}); logEco('Economic Event',`${type} triggered in ${loc}.`,ev,ev.visibility); renderEconomyPanels();};
  window.logEconomyShift=function(){logEco('Market Shift','GM logged a calendar/world-state economy shift.',{source:'GM Economy Dashboard'},'GM-only'); notifyEco('small','Economy Logged','Market shift added to timeline/session log.','economy',{visibility:'GM-only'}); renderEconomyPanels();};
  window.toggleTradeRoute=function(id){const s=read(); const rt=s.routes[id]; if(!rt)return; const states=Object.keys(ROUTE_STATE); rt.state=states[(states.indexOf(rt.state)+1)%states.length]; rt.stability=rt.state; write(s); const level=['Blockaded','Closed'].includes(rt.state)?'major':rt.state==='Open'?'medium':'medium'; notifyEco(level,`Trade Route ${rt.state}`,rt.name,'travel',{visibility:'Public'}); logEco('Trade Route Change',`${rt.name} is now ${rt.state}.`,rt,'Public'); renderEconomyPanels();};
  window.asteriaEconomy={VERSION,read,write,calculatePrice:modifierBreakdown,shippingCost,money,log:logEco};
  function installGMEconomy(){const gmPanels=document.querySelector('#gm .gm-panels'); if(!gmPanels||document.getElementById('gmEconomyPanel'))return; const card=document.createElement('section'); card.className='card economy-dashboard-panel'; card.id='gmEconomyPanel'; card.dataset.gmSystem='economy'; card.innerHTML=`<div class="section-head"><div><p class="eyebrow">World Economy</p><h3>Controlled Dynamic Economy</h3><p class="muted smallnote">Dynamic, but not chaotic. Prices, stock, shipping and scarcity are system-driven but GM-controlled.</p></div><span class="pill">${VERSION}</span></div><div id="gmEconomyDashboard"></div>`; gmPanels.appendChild(card);}
  function installPlayerEconomy(){return;}
  function installShopMaterialPanels(){const lib=document.querySelector('#library .content-panel, #library .rule-content, #library'); if(lib&&!document.getElementById('economyShopPanel')){const s=document.createElement('section'); s.className='card economy-shop-panel'; s.id='economyShopPanel'; s.innerHTML=`<div class="section-head"><div><p class="eyebrow">Shop Economy</p><h3>Regional Prices + Shipping</h3></div><span class="pill">Transaction Linked</span></div><div id="economyShopPreview" class="economy-price-list"></div>`; lib.appendChild(s);} const mat=document.getElementById('materialCompendiumPanel'); if(mat&&!mat.closest('#player')&&!document.getElementById('materialEconomyPanel')){const m=document.createElement('section'); m.className='card material-economy-panel'; m.id='materialEconomyPanel'; m.innerHTML=`<div class="section-head"><div><p class="eyebrow">Material Economy</p><h3>Regional Material Values</h3></div><span class="pill">Material System Linked</span></div><div id="materialEconomyPreview" class="economy-price-list"></div>`; mat.after?mat.after(m):mat.appendChild(m);}}
  function patchGMSystems(){try{ if(Array.isArray(asteriaGMSystems)&&!asteriaGMSystems.find(s=>s.id==='economy')){const idx=asteriaGMSystems.findIndex(s=>s.id==='campaign'); asteriaGMSystems.splice(idx>=0?idx+1:asteriaGMSystems.length,0,{id:'economy',label:'Economy',hint:'Prices, trade routes, shipping, scarcity'});} }catch(e){}}
  function patchTransactions(){if(window.asteriaTransaction&& !window.asteriaTransaction.__economyWrapped){const oldCreate=window.asteriaTransaction.create; window.asteriaTransaction.create=function(input={}){ if(input.baseValue&&!input.economy){const reg=input.regionId||'greystone'; const p=modifierBreakdown(input.baseValue,reg,{gmModifier:input.gmModifier||1}); input.economy={region:reg,baseValue:input.baseValue,finalValue:p.final,trend:p.trend,modifiers:p.parts}; input.summary=(input.summary||input.source||'Transaction')+` • Economy value ${money(p.final)}`;} const tx=oldCreate(input); try{if(input.economy)logEco('Transaction Economy',`${input.summary||'Transaction'} used economy pricing.`,input.economy,input.visibility||'Public');}catch(e){} return tx;}; window.asteriaTransaction.__economyWrapped=true;}}
  function patchCrafting(){const host=document.getElementById('gmCraftingPanel'); if(host&&!host.querySelector('.craft-economy-note')){const n=document.createElement('div'); n.className='craft-economy-note'; n.innerHTML='<h4>Economy Cost Preview</h4><p class="muted smallnote">Crafting material costs now use regional material values, shipping/import costs, and GM economy modifiers when enabled.</p><div class="economy-price-list">'+priceCard('Crafting Materials Estimate',75,'greystone')+'</div>'; host.appendChild(n);}}
  function refreshAll(){patchGMSystems(); installGMEconomy(); installPlayerEconomy(); installShopMaterialPanels(); patchTransactions(); patchCrafting(); renderEconomyPanels(); const b=document.querySelector('.version-badge'); if(b)b.textContent=VERSION; if(typeof applyGMSystemPanel==='function')applyGMSystemPanel();}
  window.AsteriaViewHooks?.afterPlayerLoad('economy-system', () => refreshAll());
  window.AsteriaViewHooks?.afterGMRender('economy-system', () => refreshAll());
  window.AsteriaViewHooks?.afterView('economy-system', null, id => {if(id!=='gm'&&id!=='player')refreshAll();});
  document.addEventListener('DOMContentLoaded',()=>setTimeout(refreshAll,1250));
})();


/* =====================================================
   Asteria GM Dashboard v1
   Restores the integrated GM workspace without duplicating dashboards.
   ===================================================== */
(function(){
  const GM_DASHBOARD_VERSION='GM Dashboard v1';
  const GM_SYSTEMS=[
    {id:'gm-main',label:'GM Main',hint:'Encounter control, initiative, enemies, and rewards'},
    {id:'quests',label:'Quests',hint:'Quest updates, hooks, and campaign objectives'},
    {id:'gm-notes',label:'GM Notes',hint:'Private prep, live notes, and session logs'},
    {id:'economy',label:'Economy',hint:'Prices, trade routes, shipping, and scarcity'},
    {id:'crafting',label:'Crafting',hint:'Projects, approvals, materials, and enchantments'},
    {id:'campaign-manager',label:'Campaign Manager',hint:'Campaign settings, GM tools, and utilities'}
  ];
  const GM_SYSTEM_ALIASES={
    actions:'gm-main',
    encounter:'gm-main',
    rewards:'gm-main',
    builder:'gm-main',
    session:'gm-notes',
    notes:'gm-notes',
    campaign:'campaign-manager',
    tools:'campaign-manager',
    materials:'crafting',
    enchantments:'crafting'
  };
  const originalSetGMSystemPanel=typeof setGMSystemPanel==='function'?setGMSystemPanel:null;
  setGMSystemPanel=function(id){
    const next=GM_SYSTEM_ALIASES[id]||id||'gm-main';
    asteriaGMActiveSystem=next;
    localStorage.setItem('asteriaGMActiveSystem',next);
    if(typeof applyGMSystemPanel==='function') applyGMSystemPanel();
    else originalSetGMSystemPanel?.(next);
  };
  function normaliseGMSystems(){
    if(!Array.isArray(asteriaGMSystems)) return;
    const storedActive=localStorage.getItem('asteriaGMActiveSystem');
    if(storedActive && GM_SYSTEMS.some(s=>s.id===storedActive)) asteriaGMActiveSystem=storedActive;
    const byId={};
    asteriaGMSystems.forEach(s=>{ if(s?.id && s.id!=='dice') byId[s.id]=Object.assign({},s); });
    GM_SYSTEMS.forEach(s=>{ byId[s.id]=Object.assign({},byId[s.id]||{},s); });
    asteriaGMSystems.splice(0,asteriaGMSystems.length,...GM_SYSTEMS.map(s=>byId[s.id]));
    if(!asteriaGMSystems.some(s=>s.id===asteriaGMActiveSystem)){
      asteriaGMActiveSystem='gm-main';
      localStorage.setItem('asteriaGMActiveSystem',asteriaGMActiveSystem);
    }
  }
  function syncMeta(){
    try{return JSON.parse(localStorage.getItem('asteria-v170-last-checkpoint')||'{}')||{};}catch(e){return {};}
  }
  function lastSyncText(){
    const meta=syncMeta();
    return meta.savedAt ? new Date(meta.savedAt).toLocaleString() : 'Not saved yet';
  }
  window.asteriaGMSaveCheckpoint=function(){
    if(typeof v170SaveCheckpoint==='function') v170SaveCheckpoint();
    else {
      saveAsteriaState?.();
      localStorage.setItem('asteria-v170-last-checkpoint',JSON.stringify({savedAt:Date.now(),label:GM_DASHBOARD_VERSION}));
      toast?.('GM sync checkpoint saved.');
    }
    renderGMSyncPanel();
  };
  window.asteriaGMExportSession=function(){
    if(typeof exportSessionMarkdown==='function') return exportSessionMarkdown();
    if(typeof v170ExportSessionLog==='function') return v170ExportSessionLog();
    if(typeof generateSessionLog==='function') return generateSessionLog();
    toast?.('No session log is ready to export yet.');
  };
  function renderGMSyncPanel(){
    const panel=document.getElementById('gmSyncStatusPanel');
    if(!panel) return;
    panel.innerHTML=`<b>Sync Status: Local browser sync active</b><small>Last checkpoint: ${lastSyncText()}</small><button onclick="asteriaGMSaveCheckpoint()">Save Sync Checkpoint</button><button onclick="asteriaGMExportSession()">Export Session</button>`;
  }
  function ensureGMHero(){
    const hero=document.querySelector('#gm .gm-hero');
    if(!hero) return;
    document.getElementById('v170SyncPanel')?.remove();
    hero.classList.add('gm-dashboard-hero-v1');
    const actions=hero.querySelector('.gm-actions');
    if(actions){
      actions.innerHTML=`<button class="primary" onclick="startSession()">Start Session</button><button class="danger" onclick="endSession()">End Session</button>`;
    }
    let sync=hero.querySelector('#gmSyncStatusPanel');
    if(!sync){
      sync=document.createElement('aside');
      sync.id='gmSyncStatusPanel';
      sync.className='gm-sync-card';
      hero.appendChild(sync);
    }
    renderGMSyncPanel();
  }
  function ensureGMMenu(){
    normaliseGMSystems();
    ensureGMRightMenu?.();
    document.querySelector('#gm .gm-menu-bar-actions')?.remove();
    const buttons=document.querySelector('#gm .gm-menu-bar .gm-system-buttons');
    if(buttons){
      buttons.innerHTML=asteriaGMSystems.map(s=>`<button class="gm-system-btn ${s.id===asteriaGMActiveSystem?'active':''}" onclick="setGMSystemPanel('${s.id}')"><b>${s.label}</b><small>${s.hint}</small></button>`).join('');
    }
  }
  function classifyGMPanels(){
    const assign=(selector,system)=>document.querySelectorAll(selector).forEach(el=>{el.dataset.gmSystem=system;});
    assign('#gmActionPanel','gm-hidden');
    assign('#gmCampaignCharacterPanel,#gmEncounterWorkspace,#gm .gm-xp-split,#gm .transaction-pipeline-panel,#gm #partyLootManagerPanel','gm-main');
    assign('#gm .active-encounter,#gm .initiative,#gm .encounter,#gm .combat-system-panel','gm-hidden');
    assign('#gm .gm-session-control,#gm .gm-session-log-builder,#gm #sessionLedgerPanel,#gm .session-ledger-panel,#gm .session-log-system-panel,#gm .manual-roll-card,#gm .gm-view-toggle,#gm .gm-dice-log-panel','gm-notes');
    document.querySelectorAll('#gm .gm-placeholder-panel').forEach(el=>{el.dataset.gmSystem=el.querySelector('#gmQuestUpdates')?'quests':'gm-notes';});
    assign('#gm #gmQuestUpdates','quests');
    document.querySelectorAll('#gm #gmQuestUpdates').forEach(el=>{const card=el.closest('.card'); if(card) card.dataset.gmSystem='quests';});
    document.querySelectorAll('#gm textarea[placeholder="Persistent campaign notes..."]').forEach(el=>{const card=el.closest('.card'); if(card) card.dataset.gmSystem='campaign-manager';});
    assign('#gm .gm-tools,#gm .notification-settings-panel','campaign-manager');
    assign('#gmCraftingPanel','crafting');
    assign('#gmMaterialsPanel','crafting');
    assign('#gmEnchantPanel','crafting');
    assign('#gmEconomyPanel','economy');
  }
  function restoreGMDashboard(){
    if(!document.getElementById('gm')) return;
    document.getElementById('v170SyncPanel')?.remove();
    ensureGMHero();
    ensureGMMenu();
    classifyGMPanels();
    applyGMSystemPanel?.();
    renderGMSyncPanel();
  }
  if(typeof v170RenderSyncPanel==='function'){
    v170RenderSyncPanel=function(){document.getElementById('v170SyncPanel')?.remove();renderGMSyncPanel();};
  }
  window.AsteriaViewHooks?.afterGMRender('gm-dashboard-v1-restore',()=>setTimeout(restoreGMDashboard,0));
  document.addEventListener('DOMContentLoaded',()=>setTimeout(restoreGMDashboard,1400));
})();

/* =====================================================
   Asteria GM Encounter Workspace v1
   Combines campaign characters, encounter creation, enemy search, and initiative into GM Main.
   ===================================================== */
(function(){
  const ENCOUNTER_STORE='asteria-gm-encounter-workspace-v1';
  const THREAT_XP=[0,25,50,100,200,400,800,1600,3200,6400,12800,25600,51200,102400,204800,409600,819200,1638400,3276800,6553600,13107200];

  function readEncounterState(){
    try{return Object.assign({status:'Ready',round:1,pendingXP:0,selectedCreatureId:''},JSON.parse(localStorage.getItem(ENCOUNTER_STORE)||'{}')||{});}
    catch(e){return {status:'Ready',round:1,pendingXP:0,selectedCreatureId:''};}
  }
  function writeEncounterState(state){
    localStorage.setItem(ENCOUNTER_STORE,JSON.stringify(state));
  }
  function text(value){
    return String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }
  function slug(value){
    return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'entry';
  }
  function threatTierFrom(value){
    const match=String(value?.tier||value?.threatTier||value?.threat||'').match(/(\d+)/);
    return Math.max(1,Math.min(20,Number(match?.[1]||value?.tierNumber||1)));
  }
  function threatLabel(value){
    const tier=threatTierFrom(value);
    return `TT ${tier}`;
  }
  function creatureTypeBonus(type){
    const source=String(type||'').toLowerCase();
    if(source.includes('dragon')) return 1500;
    if(source.includes('monster')||source.includes('monstrous')) return 1000;
    if(source.includes('fae')||source.includes('fiend')||source.includes('celestial')) return 500;
    if(source.includes('beast')) return 150;
    if(source.includes('humanoid')||source.includes('construct')||source.includes('undead')) return 75;
    if(source.includes('plant')) return 50;
    if(source.includes('animal')) return 10;
    return 0;
  }
  function xpForCreature(creature){
    const tier=threatTierFrom(creature);
    const base=THREAT_XP[tier]||THREAT_XP[1];
    return Math.max(1,Math.round(base+creatureTypeBonus(creature?.type)));
  }
  function encounterSources(){
    const base=Object.entries(window.creatures||{}).map(([id,c])=>Object.assign({
      id,
      source:'Creature Database',
      compendiumSlug:id,
      hp:c.hp||50,
      max:c.hp||50,
      ac:c.ac||10,
      initiative:c.initiative||10,
      status:c.status||'None',
      attacks:c.attacks||[],
      notes:c.notes||''
    },c));
    const workspace=(window.AsteriaWorkspace?.entries?.()||[])
      .filter(entry=>{
        const blob=[entry.section,entry.type,entry.category,entry.sourcePath,entry.title].join(' ').toLowerCase();
        return entry.section==='Creatures'||blob.includes('creature')||blob.includes('npc')||blob.includes('monster')||blob.includes('beast');
      })
      .map(entry=>({
        id:`entry-${entry.id||entry.slug||slug(entry.title)}`,
        source:'Compendium',
        entryId:entry.id,
        compendiumSlug:entry.slug||slug(entry.title),
        name:entry.title,
        type:entry.type||entry.category||'Compendium',
        tier:entry.threatTier||entry.tier||'Tier 1 Threat',
        hp:Number(entry.hp||entry.HP||50),
        max:Number(entry.hp||entry.HP||50),
        ac:Number(entry.ac||entry.AC||10),
        initiative:Number(entry.initiative||10),
        status:'None',
        notes:entry.description||entry.summary||'Open the compendium page for full notes.',
        attacks:[]
      }));
    const seen=new Set();
    return base.concat(workspace).filter(item=>{
      const key=slug(item.name||item.id);
      if(seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function sourceById(id){
    return encounterSources().find(item=>item.id===id)||encounterSources().find(item=>item.compendiumSlug===id)||null;
  }
  function ensureEnemyShape(enemy){
    if(!enemy) return enemy;
    const source=(enemy.id&&(window.creatures?.[enemy.id]||sourceById(enemy.id)))||sourceById(enemy.compendiumSlug)||sourceById(enemy.name);
    if(source){
      enemy.name=enemy.name||source.name;
      enemy.type=enemy.type||source.type||'Enemy';
      enemy.tier=enemy.tier||enemy.threatTier||source.tier||source.threatTier||'Tier 1 Threat';
      enemy.threatTier=enemy.threatTier||source.threatTier||source.tier||enemy.tier;
      enemy.ac=Number(enemy.ac||source.ac||10);
      enemy.initiative=Number(enemy.initiative||source.initiative||10);
      enemy.notes=enemy.notes||source.notes||source.description||'';
      enemy.attacks=enemy.attacks||source.attacks||[];
      enemy.compendiumSlug=enemy.compendiumSlug||source.compendiumSlug||source.slug||enemy.id;
      enemy.entryId=enemy.entryId||source.entryId||source.id;
      enemy.max=Number(enemy.max||source.max||source.hp||enemy.hp||50);
      enemy.hp=Number(enemy.hp??source.hp??enemy.max);
    }else{
      enemy.max=Number(enemy.max||enemy.hp||50);
      enemy.hp=Number(enemy.hp??enemy.max);
      enemy.tier=enemy.tier||enemy.threatTier||'Tier 1 Threat';
      enemy.type=enemy.type||'Enemy';
      enemy.ac=Number(enemy.ac||10);
      enemy.initiative=Number(enemy.initiative||10);
    }
    enemy.status=enemy.status||'None';
    enemy.conditions=enemy.conditions||[];
    enemy.xpAward=Number(enemy.xpAward||xpForCreature(enemy));
    return enemy;
  }
  function ensureEncounterData(){
    (window.enemies||[]).forEach(ensureEnemyShape);
  }
  function resourceMini(label,pair,cls){
    const value=Array.isArray(pair)?pair[0]:0;
    const max=Array.isArray(pair)?pair[1]:1;
    const width=Math.max(0,Math.min(100,(value/(max||1))*100));
    return `<div class="gm-mini-resource ${cls}"><span>${label}</span><i><b style="width:${width}%"></b></i><strong>${value}/${max}</strong></div>`;
  }
  function insertPanel(panel, beforeSelector){
    const host=document.querySelector('#gm .gm-panels');
    if(!host) return;
    const before=beforeSelector?host.querySelector(beforeSelector):null;
    if(before) host.insertBefore(panel,before);
    else host.appendChild(panel);
  }
  function ensureCampaignCharacterPanel(){
    if(document.getElementById('gmCampaignCharacterPanel')) return;
    const panel=document.createElement('section');
    panel.id='gmCampaignCharacterPanel';
    panel.className='card gm-campaign-character-panel';
    panel.dataset.gmSystem='gm-main';
    panel.innerHTML='<div class="section-head"><div><p class="eyebrow">Campaign Characters</p><h3>Party Overview</h3></div><span class="pill">Double-click opens sheet</span></div><div id="gmCampaignCharacterCards" class="gm-campaign-character-cards"></div>';
    insertPanel(panel,'.gm-xp-split');
  }
  function ensureEncounterPanel(){
    if(document.getElementById('gmEncounterWorkspace')) return;
    const panel=document.createElement('section');
    panel.id='gmEncounterWorkspace';
    panel.className='card gm-encounter-workspace';
    panel.dataset.gmSystem='gm-main';
    panel.innerHTML=`<div class="section-head"><div><p class="eyebrow">Combat Workspace</p><h3>Create Encounter</h3><p class="muted smallnote">Search creature/NPC data, add enemies, control initiative, and send defeated enemy XP into the XP rewards panel.</p></div><span id="gmEncounterStatusPill" class="pill">Ready</span></div>
      <div class="gm-encounter-toolbar">
        <button class="primary" type="button" onclick="gmStartEncounter()">Start Encounter</button>
        <button type="button" onclick="gmSortEncounterInitiative()">Reorder by Initiative</button>
        <button type="button" onclick="nextTurn()">Next Turn</button>
        <button class="danger-soft" type="button" onclick="gmEndEncounter()">End Encounter</button>
        <button class="outline" type="button" onclick="gmClearEncounter()">Clear</button>
      </div>
      <div class="gm-encounter-summary" id="gmEncounterSummary"></div>
      <div class="gm-encounter-builder-grid">
        <section class="gm-encounter-search-panel">
          <h4>Add Enemy</h4>
          <div class="gm-enemy-search-controls">
            <label>Creature / NPC Search<input id="gmEncounterSearch" type="search" placeholder="Search creature compendium or NPC data..." oninput="renderGMEncounterSearch()"></label>
            <label>Number<input id="gmEncounterQty" type="number" min="1" max="20" value="1"></label>
            <label>Threat Tier<select id="gmEncounterThreatOverride">${Array.from({length:20},(_,i)=>`<option value="${i+1}">TT ${i+1}</option>`).join('')}</select></label>
          </div>
          <div id="gmEnemySearchResults" class="gm-enemy-search-results"></div>
          <details class="gm-manual-enemy">
            <summary>Manual Enemy</summary>
            <div class="gm-manual-enemy-grid">
              <label>Name<input id="gmManualEnemyName" placeholder="Enemy name"></label>
              <label>HP<input id="gmManualEnemyHP" type="number" value="30"></label>
              <label>AC<input id="gmManualEnemyAC" type="number" value="10"></label>
              <label>Initiative<input id="gmManualEnemyInit" type="number" value="10"></label>
              <button class="primary" type="button" onclick="gmAddManualEnemy()">Add Manual Enemy</button>
            </div>
          </details>
        </section>
        <section>
          <h4>Initiative Track</h4>
          <div class="gm-add-initiative-row">
            <input id="gmManualInitName" placeholder="Manual name">
            <input id="gmManualInitRoll" type="number" placeholder="Roll">
            <button type="button" onclick="gmAddManualInitiative()">Add</button>
          </div>
          <div id="gmUnifiedInitiativeRows" class="gm-unified-initiative-rows"></div>
        </section>
      </div>
      <section class="gm-enemy-board-wrap">
        <div class="section-head mini"><h4>Enemy Panel</h4><span class="pill" id="gmEnemyPanelCount">0 Enemies</span></div>
        <div id="gmUnifiedEnemyCards" class="gm-unified-enemy-cards"></div>
      </section>`;
    insertPanel(panel,'.gm-xp-split');
    const search=document.getElementById('gmEncounterSearch');
    if(search) search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();const first=document.querySelector('#gmEnemySearchResults [data-source-id]');if(first) gmAddCreatureToEncounter(first.dataset.sourceId);}});
  }
  function renderCampaignCharacters(){
    const box=document.getElementById('gmCampaignCharacterCards');
    const camp=campaigns?.[activeCampaign];
    if(!box||!camp) return;
    box.innerHTML=(camp.party||[]).map(id=>{
      const c=chars[id];
      if(!c) return '';
      const active=id===selected?' active':'';
      return `<article class="gm-campaign-character-card${active}" onclick="selected='${id}';renderGM()" ondblclick="openGMPlayer('${id}')">
        <div class="gm-character-avatar">${text(c.initial||c.name?.[0]||'?')}</div>
        <div><b>${text(c.name)}</b><small>${text(c.race||'Unselected')} / ${text(c.klass||'Class')} - Level ${c.level||0}</small></div>
        ${resourceMini('HP',c.hp,'hp')}${resourceMini('SP',c.sp,'sp')}${resourceMini('MP',c.mp,'mp')}
      </article>`;
    }).join('');
  }
  function renderSummary(){
    const state=readEncounterState();
    const enemyCount=(enemies||[]).length;
    const defeated=(enemies||[]).filter(e=>e.defeated).length;
    const current=initiative?.[turnIndex]?.name||'No active turn';
    const pending=(enemies||[]).filter(e=>e.defeated).reduce((sum,e)=>sum+Number(e.xpAward||0),0);
    state.pendingXP=pending;
    writeEncounterState(state);
    const pill=document.getElementById('gmEncounterStatusPill');
    if(pill) pill.textContent=state.status||'Ready';
    const summary=document.getElementById('gmEncounterSummary');
    if(summary) summary.innerHTML=[
      ['Status',state.status||'Ready'],
      ['Round',state.round||document.getElementById('roundNo')?.textContent||1],
      ['Current Turn',current],
      ['Enemies',`${enemyCount} total / ${defeated} defeated`],
      ['XP Pending',pending.toLocaleString()]
    ].map(([label,value])=>`<div><small>${label}</small><b>${text(value)}</b></div>`).join('');
  }
  function renderGMEncounterSearch(){
    const box=document.getElementById('gmEnemySearchResults');
    if(!box) return;
    const q=String(document.getElementById('gmEncounterSearch')?.value||'').toLowerCase();
    const sources=encounterSources().filter(item=>{
      const blob=[item.name,item.type,item.tier,item.source,item.notes].join(' ').toLowerCase();
      return !q||blob.includes(q);
    }).slice(0,8);
    box.innerHTML=sources.length?sources.map(item=>`<button type="button" data-source-id="${text(item.id)}" onclick="gmAddCreatureToEncounter('${text(item.id)}')">
      <b>${text(item.name)}</b><small>${text(item.type||'Creature')} - ${text(threatLabel(item))} - ${text(item.source)}</small><span>${xpForCreature(item).toLocaleString()} XP</span>
    </button>`).join(''):'<p class="muted smallnote">No creature or NPC results found.</p>';
  }
  function renderUnifiedInitiative(){
    const box=document.getElementById('gmUnifiedInitiativeRows');
    if(!box) return;
    box.innerHTML=(initiative||[]).map((entry,index)=>{
      const enemy=(enemies||[]).find(e=>e.name===entry.name);
      const defeated=enemy?.defeated?' defeated':'';
      return `<div class="gm-init-row${index===turnIndex?' active':''}${defeated}">
        <span>${index+1}</span>
        <div><b>${text(entry.name)}</b><small>${text(entry.type||'manual')}${index===turnIndex?' - Current turn':''}</small></div>
        <input type="number" value="${Number(entry.roll||0)}" onchange="gmSetInitiativeRoll(${index},this.value)">
        <button type="button" onclick="gmMoveInitiative(${index},-1)">Up</button>
        <button type="button" onclick="gmMoveInitiative(${index},1)">Down</button>
        <button type="button" onclick="gmRemoveInitiative(${index})">Remove</button>
      </div>`;
    }).join('')||'<p class="muted smallnote">No initiative entries yet. Start an encounter or add combatants manually.</p>';
  }
  function renderEnemyCards(){
    const box=document.getElementById('gmUnifiedEnemyCards');
    if(!box) return;
    ensureEncounterData();
    const count=document.getElementById('gmEnemyPanelCount');
    if(count) count.textContent=`${(enemies||[]).length} Enemies`;
    box.innerHTML=(enemies||[]).map((enemy,index)=>{
      const hpWidth=Math.max(0,Math.min(100,(Number(enemy.hp||0)/(Number(enemy.max||1)||1))*100));
      const defeated=enemy.defeated?' defeated':'';
      return `<article class="gm-enemy-card${defeated}" ondblclick="openGMEnemyDetail(${index})">
        <div class="gm-enemy-card-head"><div><b>${text(enemy.name)}</b><small>${text(enemy.type||'Enemy')} - ${text(threatLabel(enemy))}</small></div><span>${Number(enemy.xpAward||xpForCreature(enemy)).toLocaleString()} XP</span></div>
        <div class="gm-enemy-meter"><i style="width:${hpWidth}%"></i></div>
        <div class="gm-enemy-statline"><span>HP ${Number(enemy.hp||0)}/${Number(enemy.max||0)}</span><span>AC ${Number(enemy.ac||10)}</span><span>${text(enemy.status||'None')}</span></div>
        <p>${text(enemy.notes||'Double-click to open creature details.')}</p>
        <div class="gm-enemy-actions">
          <button type="button" onclick="gmEnemyHP(${index},-5)">-5 HP</button>
          <button type="button" onclick="gmEnemyHP(${index},5)">+5 HP</button>
          <button type="button" title="Mark defeated and add XP to rewards" onclick="gmDefeatEnemy(${index})">&#9760;</button>
          <button type="button" onclick="openGMEnemyDetail(${index})">Open</button>
          <button type="button" onclick="gmRemoveEnemy(${index})">Remove</button>
        </div>
      </article>`;
    }).join('')||'<p class="muted smallnote">No enemies in this encounter yet.</p>';
  }
  function refreshEncounterWorkspace(){
    if(!document.getElementById('gm')) return;
    ensureCampaignCharacterPanel();
    ensureEncounterPanel();
    renderCampaignCharacters();
    renderSummary();
    renderGMEncounterSearch();
    renderUnifiedInitiative();
    renderEnemyCards();
    if(typeof applyGMSystemPanel==='function') applyGMSystemPanel();
  }

  window.renderGMEncounterSearch=renderGMEncounterSearch;
  window.gmStartEncounter=function(){
    const state=readEncounterState();
    state.status='Active';
    state.round=Number(document.getElementById('roundNo')?.textContent||state.round||1)||1;
    if(!initiative.length){
      const camp=campaigns?.[activeCampaign];
      (camp?.party||[]).forEach(id=>{
        const c=chars[id];
        if(c) initiative.push({name:c.name,roll:Number(window.playerInitiative?.[id]||10),type:'player'});
      });
    }
    writeEncounterState(state);
    sortInitiative?.();
    renderGM?.();
    refreshEncounterWorkspace();
    toast?.('Encounter started.');
  };
  window.gmEndEncounter=function(){
    const state=readEncounterState();
    state.status='Ended';
    writeEncounterState(state);
    refreshEncounterWorkspace();
    toast?.('Encounter ended. Review XP before applying rewards.');
  };
  window.gmClearEncounter=function(){
    enemies.length=0;
    initiative.length=0;
    turnIndex=0;
    const state=readEncounterState();
    state.status='Ready';
    state.round=1;
    state.pendingXP=0;
    writeEncounterState(state);
    renderGM?.();
    refreshEncounterWorkspace();
    toast?.('Encounter cleared.');
  };
  window.gmSortEncounterInitiative=function(){
    initiative.sort((a,b)=>Number(b.roll||0)-Number(a.roll||0));
    turnIndex=0;
    renderGM?.();
    refreshEncounterWorkspace();
    toast?.('Initiative reordered.');
  };
  window.gmAddCreatureToEncounter=function(id){
    const source=sourceById(id);
    if(!source) return toast?.('Creature not found.');
    const qty=Math.max(1,Math.min(20,Number(document.getElementById('gmEncounterQty')?.value||1)));
    const override=Number(document.getElementById('gmEncounterThreatOverride')?.value||threatTierFrom(source));
    for(let i=0;i<qty;i++){
      const suffix=qty>1?` ${i+1}`:'';
      const enemy=ensureEnemyShape({
        id:source.id,
        source:source.source,
        entryId:source.entryId,
        compendiumSlug:source.compendiumSlug,
        name:`${source.name}${suffix}`,
        type:source.type,
        tier:`Tier ${override} Threat`,
        hp:Number(source.hp||source.max||50),
        max:Number(source.max||source.hp||50),
        ac:Number(source.ac||10),
        initiative:Number(source.initiative||10),
        status:source.status||'None',
        notes:source.notes||'',
        attacks:source.attacks||[],
        conditions:[]
      });
      enemy.xpAward=xpForCreature(enemy);
      enemies.push(enemy);
      initiative.push({name:enemy.name,roll:enemy.initiative,type:'enemy'});
    }
    renderGM?.();
    refreshEncounterWorkspace();
    toast?.(`${source.name} added to encounter.`);
  };
  window.gmAddManualEnemy=function(){
    const name=document.getElementById('gmManualEnemyName')?.value?.trim()||'Manual Enemy';
    const tier=Number(document.getElementById('gmEncounterThreatOverride')?.value||1);
    const enemy=ensureEnemyShape({
      id:'manual-'+slug(name),
      name,
      type:'Manual Enemy',
      tier:`Tier ${tier} Threat`,
      hp:Number(document.getElementById('gmManualEnemyHP')?.value||30),
      max:Number(document.getElementById('gmManualEnemyHP')?.value||30),
      ac:Number(document.getElementById('gmManualEnemyAC')?.value||10),
      initiative:Number(document.getElementById('gmManualEnemyInit')?.value||10),
      status:'None',
      conditions:[],
      notes:'Manual encounter entry.'
    });
    enemy.xpAward=xpForCreature(enemy);
    enemies.push(enemy);
    initiative.push({name:enemy.name,roll:enemy.initiative,type:'enemy'});
    renderGM?.();
    refreshEncounterWorkspace();
  };
  window.gmAddManualInitiative=function(){
    const name=document.getElementById('gmManualInitName')?.value?.trim();
    const roll=Number(document.getElementById('gmManualInitRoll')?.value||0);
    if(!name) return toast?.('Add a name for initiative.');
    initiative.push({name,roll,type:'manual'});
    document.getElementById('gmManualInitName').value='';
    document.getElementById('gmManualInitRoll').value='';
    renderGM?.();
    refreshEncounterWorkspace();
  };
  window.gmSetInitiativeRoll=function(index,value){
    if(!initiative[index]) return;
    initiative[index].roll=Number(value||0);
    renderUnifiedInitiative();
  };
  window.gmMoveInitiative=function(index,delta){
    const next=index+delta;
    if(next<0||next>=initiative.length) return;
    const item=initiative.splice(index,1)[0];
    initiative.splice(next,0,item);
    turnIndex=Math.max(0,Math.min(initiative.length-1,turnIndex));
    renderGM?.();
    refreshEncounterWorkspace();
  };
  window.gmRemoveInitiative=function(index){
    initiative.splice(index,1);
    turnIndex=Math.max(0,Math.min(initiative.length-1,turnIndex));
    renderGM?.();
    refreshEncounterWorkspace();
  };
  window.gmEnemyHP=function(index,amount){
    const enemy=enemies[index];
    if(!enemy) return;
    ensureEnemyShape(enemy);
    enemy.hp=Math.max(0,Math.min(enemy.max,Number(enemy.hp||0)+Number(amount||0)));
    if(enemy.hp<=0) enemy.status='Down';
    renderGM?.();
    refreshEncounterWorkspace();
  };
  window.gmDefeatEnemy=function(index){
    const enemy=enemies[index];
    if(!enemy) return;
    ensureEnemyShape(enemy);
    enemy.defeated=true;
    enemy.hp=0;
    enemy.status='Defeated';
    const xp=Number(enemy.xpAward||xpForCreature(enemy));
    const xpInput=document.getElementById('campaignXPAmount');
    if(xpInput) xpInput.value=Number(xpInput.value||0)+xp;
    const source=document.getElementById('xpSourceType');
    if(source) source.value='Creature defeat';
    const reason=document.getElementById('xpAwardReason');
    if(reason){
      const addition=`Defeated ${enemy.name}`;
      reason.value=reason.value?`${reason.value}; ${addition}`:addition;
    }
    updateXPSplitPreview?.();
    addCombatLog?.(`${enemy.name} defeated. ${xp.toLocaleString()} XP added to reward pool.`,'important');
    renderGM?.();
    refreshEncounterWorkspace();
    toast?.(`${enemy.name} defeated. XP added to rewards.`);
  };
  window.gmRemoveEnemy=function(index){
    const enemy=enemies[index];
    enemies.splice(index,1);
    if(enemy) {
      const idx=initiative.findIndex(entry=>entry.name===enemy.name);
      if(idx>=0) initiative.splice(idx,1);
    }
    renderGM?.();
    refreshEncounterWorkspace();
  };
  window.openGMEnemyDetail=function(index){
    const enemy=enemies[index];
    if(!enemy) return;
    const source=sourceById(enemy.id)||sourceById(enemy.compendiumSlug);
    const slugValue=enemy.compendiumSlug||source?.compendiumSlug||slug(enemy.name);
    if(creatures?.[enemy.id]) return openCreature(enemy.id);
    if(window.AsteriaWorkspace?.openEntryBySlug?.(slugValue)) return;
    if(window.openWorkspaceEntry?.(slugValue)) return;
    toast?.('Creature page not found yet. Use the enemy card summary for now.');
  };

  window.AsteriaViewHooks?.afterGMRender('gm-encounter-workspace-v1',()=>setTimeout(refreshEncounterWorkspace,25));
  document.addEventListener('DOMContentLoaded',()=>setTimeout(refreshEncounterWorkspace,1500));
})();

/* v1.7.3.2 Public Website Layout Helpers */
// Keep version badges out of the public home screen; version logs live in Settings.
buildVersionBadge=function(){};
injectV170RecoveryPanel=function(){};

window.ASTERIA_WEAPON_CRAFTING_DATA = {"version": "v1.7.3.5.9", "system": "Weapon Crafting + Ingot System", "rules": {"ingotRequirementRule": "Metal rarity does not increase ingot requirements. Higher-tier materials increase crafting difficulty, forge requirements, market value, and refinement requirements.", "sizeCategories": [{"category": "Tiny Weapon", "ingots": 1}, {"category": "Light Weapon", "ingots": 2}, {"category": "Standard Weapon", "ingots": 3}, {"category": "Heavy Weapon", "ingots": 4}, {"category": "Massive Weapon", "ingots": "5–6"}], "additionalComponents": ["Wood", "Leather", "Cloth", "Rope", "Resin", "Monster Bone", "Monster Sinew", "Essence Core", "Soul Stone", "Gemstones"], "forgeRequirements": [{"forge": "Standard Forge", "purpose": "Common & Uncommon materials"}, {"forge": "Reinforced Forge", "purpose": "Unusual & Rare materials"}, {"forge": "Celestial Forge", "purpose": "Divine metals"}, {"forge": "Infernal Forge", "purpose": "Infernal metals"}, {"forge": "Astral Forge", "purpose": "Cosmic and mana metals"}, {"forge": "Gloomforge", "purpose": "Void-aligned materials"}, {"forge": "Primordial Forge", "purpose": "Relic materials"}]}, "weapons": [{"category": "Blunt Weapons", "name": "Club", "damage": "1D4 Bludgeoning", "size": "Tiny", "ingots": 1, "complexity": "Basic"}, {"category": "Blunt Weapons", "name": "Great Club", "damage": "1D8 Bludgeoning", "size": "Standard", "ingots": 3, "complexity": "Standard"}, {"category": "Blunt Weapons", "name": "Mace", "damage": "1D6 Bludgeoning", "size": "Light", "ingots": 2, "complexity": "Standard"}, {"category": "Blunt Weapons", "name": "Morning Star", "damage": "1D6 Bludgeoning or 1D6 Piercing", "size": "Light", "ingots": 2, "complexity": "Standard"}, {"category": "Blunt Weapons", "name": "Quarterstaff", "damage": "1D6 Bludgeoning", "size": "Light", "ingots": 1, "complexity": "Basic"}, {"category": "Blunt Weapons", "name": "Picked Hammer", "damage": "1D4 Bludgeoning or 1D4 Piercing", "size": "Tiny", "ingots": 1, "complexity": "Basic"}, {"category": "Blunt Weapons", "name": "Sling", "damage": "1D4 Bludgeoning", "size": "Tiny", "ingots": 0, "complexity": "Basic"}, {"category": "Blunt Weapons", "name": "Flail", "damage": "1D8 Bludgeoning", "size": "Standard", "ingots": 3, "complexity": "Advanced"}, {"category": "Blunt Weapons", "name": "Maul", "damage": "2D6 Bludgeoning", "size": "Heavy", "ingots": 4, "complexity": "Advanced"}, {"category": "Blunt Weapons", "name": "Warhammer", "damage": "1D8 Bludgeoning", "size": "Standard", "ingots": 3, "complexity": "Standard"}, {"category": "Blunt Weapons", "name": "Bo Staff", "damage": "1D4 Bludgeoning", "size": "Light", "ingots": 1, "complexity": "Basic"}, {"category": "Blunt Weapons", "name": "Stave", "damage": "1D6 Bludgeoning", "size": "Light", "ingots": 1, "complexity": "Basic"}, {"category": "Blunt Weapons", "name": "Tonfa", "damage": "1D4 Bludgeoning", "size": "Tiny", "ingots": 1, "complexity": "Basic"}, {"category": "Spears & Polearms", "name": "Javelin", "damage": "1D6 Piercing or 1D4 Slashing", "size": "Light", "ingots": 2, "complexity": "Basic"}, {"category": "Spears & Polearms", "name": "Short Spear", "damage": "1D6 Piercing or 1D4 Slashing", "size": "Light", "ingots": 2, "complexity": "Standard"}, {"category": "Spears & Polearms", "name": "Long Spear", "damage": "1D8 Piercing or 1D4 Slashing", "size": "Standard", "ingots": 3, "complexity": "Standard"}, {"category": "Spears & Polearms", "name": "Pike", "damage": "1D10 Piercing or 1D4 Slashing", "size": "Heavy", "ingots": 4, "complexity": "Advanced"}, {"category": "Spears & Polearms", "name": "Voulge", "damage": "1D6 Piercing or 1D10 Slashing", "size": "Heavy", "ingots": 4, "complexity": "Advanced"}, {"category": "Spears & Polearms", "name": "Fauchard", "damage": "1D6 Piercing or 1D10 Slashing", "size": "Heavy", "ingots": 4, "complexity": "Advanced"}, {"category": "Spears & Polearms", "name": "Partisan", "damage": "1D8 Piercing or 1D8 Slashing", "size": "Standard", "ingots": 3, "complexity": "Advanced"}, {"category": "Spears & Polearms", "name": "Spetum", "damage": "2D6 Piercing or 1D6 Slashing", "size": "Heavy", "ingots": 4, "complexity": "Advanced"}, {"category": "Spears & Polearms", "name": "Lance", "damage": "1D12 Piercing", "size": "Heavy", "ingots": 4, "complexity": "Advanced"}, {"category": "Spears & Polearms", "name": "Poleaxe", "damage": "1D4 Piercing or 1D8 Slashing or 1D4 Bludgeoning", "size": "Heavy", "ingots": 4, "complexity": "Advanced"}, {"category": "Spears & Polearms", "name": "Glaive", "damage": "1D8 Piercing or 1D10 Slashing", "size": "Heavy", "ingots": 4, "complexity": "Advanced"}, {"category": "Spears & Polearms", "name": "Halberd", "damage": "1D8 Piercing or 1D10 Slashing", "size": "Heavy", "ingots": 4, "complexity": "Advanced"}, {"category": "Spears & Polearms", "name": "Ranseur", "damage": "1D10 Piercing or 1D6 Slashing", "size": "Heavy", "ingots": 4, "complexity": "Advanced"}, {"category": "Spears & Polearms", "name": "Trident", "damage": "3D4 Piercing or 1D4 Slashing", "size": "Standard", "ingots": 3, "complexity": "Standard"}, {"category": "Spears & Polearms", "name": "Naginata", "damage": "1D8 Piercing or 1D10 Slashing", "size": "Heavy", "ingots": 4, "complexity": "Advanced"}, {"category": "Spears & Polearms", "name": "Scythe", "damage": "3D6 Piercing or 3D8 Slashing", "size": "Massive", "ingots": 5, "complexity": "Masterwork"}, {"category": "Ammunition", "name": "Arrows (Bundle)", "damage": "1D6 Piercing", "size": "Ammunition", "ingots": 0.25, "complexity": "Basic"}, {"category": "Ammunition", "name": "Bolts (Bundle)", "damage": "1D6 Piercing", "size": "Ammunition", "ingots": 0.25, "complexity": "Basic"}, {"category": "Bows", "name": "Short Bow", "damage": "1D4 Force", "size": "Light", "ingots": 0.5, "complexity": "Standard"}, {"category": "Bows", "name": "Hunting Bow", "damage": "1D6 Force", "size": "Light", "ingots": 1, "complexity": "Standard"}, {"category": "Bows", "name": "Recurve Bow", "damage": "1D8 Force", "size": "Standard", "ingots": 1, "complexity": "Advanced"}, {"category": "Bows", "name": "Long Bow", "damage": "1D10 Force", "size": "Standard", "ingots": 2, "complexity": "Advanced"}, {"category": "Crossbows", "name": "Hand Crossbow", "damage": "1D6 Force", "size": "Light", "ingots": 1, "complexity": "Advanced"}, {"category": "Crossbows", "name": "Arbalest Crossbow", "damage": "1D8 Force", "size": "Standard", "ingots": 2, "complexity": "Advanced"}, {"category": "Crossbows", "name": "Recurve Crossbow", "damage": "1D10 Force", "size": "Standard", "ingots": 2, "complexity": "Masterwork"}, {"category": "Crossbows", "name": "Heavy Crossbow", "damage": "2D8 Force", "size": "Heavy", "ingots": 3, "complexity": "Masterwork"}, {"category": "Swords & Daggers", "name": "Throwing Knives", "damage": "1D4 Piercing or 1D4 Slashing", "size": "Tiny", "ingots": 1, "complexity": "Basic"}, {"category": "Swords & Daggers", "name": "Hunting Knife", "damage": "1D4 Piercing or 1D4 Slashing", "size": "Tiny", "ingots": 1, "complexity": "Basic"}, {"category": "Swords & Daggers", "name": "Daggers", "damage": "1D4 Piercing or 1D4 Slashing", "size": "Tiny", "ingots": 1, "complexity": "Standard"}, {"category": "Swords & Daggers", "name": "Short Sword", "damage": "1D6 Piercing or 1D6 Slashing", "size": "Light", "ingots": 2, "complexity": "Standard"}, {"category": "Swords & Daggers", "name": "Rapier", "damage": "1D8 Piercing or 1D4 Slashing", "size": "Standard", "ingots": 2, "complexity": "Advanced"}, {"category": "Swords & Daggers", "name": "Bastard Sword", "damage": "1D8 Piercing or 1D8 Slashing", "size": "Standard", "ingots": 3, "complexity": "Advanced"}, {"category": "Swords & Daggers", "name": "Long Sword", "damage": "1D10 Piercing or 1D10 Slashing", "size": "Standard", "ingots": 3, "complexity": "Standard"}, {"category": "Swords & Daggers", "name": "Sickle", "damage": "1D4 Piercing or 1D6 Slashing", "size": "Tiny", "ingots": 1, "complexity": "Basic"}, {"category": "Swords & Daggers", "name": "Scimitar", "damage": "1D6 Piercing or 1D6 Slashing", "size": "Light", "ingots": 2, "complexity": "Standard"}, {"category": "Swords & Daggers", "name": "Hook Sword", "damage": "1D6 Slashing", "size": "Light", "ingots": 2, "complexity": "Advanced"}, {"category": "Swords & Daggers", "name": "Great Sword", "damage": "2D8 Piercing or 2D8 Slashing", "size": "Heavy", "ingots": 4, "complexity": "Advanced"}, {"category": "Axes", "name": "Handaxe", "damage": "1D4 Slashing", "size": "Tiny", "ingots": 1, "complexity": "Basic"}, {"category": "Axes", "name": "Hatchet", "damage": "1D6 Slashing", "size": "Light", "ingots": 2, "complexity": "Standard"}, {"category": "Axes", "name": "Short Axe", "damage": "1D8 Slashing", "size": "Standard", "ingots": 3, "complexity": "Standard"}, {"category": "Axes", "name": "Long Handle Axe", "damage": "1D10 Slashing", "size": "Standard", "ingots": 3, "complexity": "Advanced"}, {"category": "Axes", "name": "Battle Axe - Single Head", "damage": "1D12 Slashing", "size": "Heavy", "ingots": 4, "complexity": "Advanced"}, {"category": "Axes", "name": "Battle Axe - Double Head", "damage": "2D8 Slashing", "size": "Heavy", "ingots": 5, "complexity": "Advanced"}]};
