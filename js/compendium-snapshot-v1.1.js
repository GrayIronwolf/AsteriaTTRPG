/* =========================================================
   Asteria Character Forge Snapshot System v1.1
   Compendium Linking + Snapshot Logic
   Integrated for website build v1.7.2.4
   ---------------------------------------------------------
   Compendium pages remain source of truth. Character sheets
   use locked snapshots after approval.
   ========================================================= */
(function(){
  const VERSION_LABEL = 'v1.7.2.4 • Character Forge v1.1 Linked Snapshots';
  const SOURCE_DATE = '2026-05-05';

  const SOURCE = {
    races: [
      { id:'human', type:'race', name:'Human', version:'race-human-v1.0', updated:SOURCE_DATE, sourcePath:'content/Races/Playable Races/Playable Races Overview.md', summary:'Adaptable peoples with broad cultural range and flexible starting growth.', size:'Medium', movement:'30 ft', languages:['Common','Regional'], modifiers:{}, traits:['Adaptable Lineage','Bonus Starting Skill'], abilities:['Versatile Start'], variants:['Regional Human','Fae-Touched Human'], startingRules:'May choose one bonus skill focus or minor cultural trait.' },
      { id:'pixie', type:'race', name:'Pixie', version:'race-pixie-v1.0', updated:SOURCE_DATE, sourcePath:'content/Races/Playable Races/Playable Races Overview.md', summary:'Tiny fae-blooded folk with high agility and natural magical sensitivity.', size:'Tiny', movement:'20 ft / Fly 30 ft', languages:['Common','Fae'], modifiers:{agility:2,dexterity:1,strength:-1}, traits:['Tiny Frame','Fae Wings','Glimmer Sense'], abilities:['Short Flight','Fae Spark'], variants:['Woodland Pixie','Court Pixie'], startingRules:'Uses Tiny size dice and may begin with a minor fae trick.' },
      { id:'urgal', type:'race', name:'Urgal', version:'race-urgal-v1.0', updated:SOURCE_DATE, sourcePath:'content/Races/Playable Races/Playable Races Overview.md', summary:'Powerful large-bodied peoples built for endurance and close combat.', size:'Large', movement:'30 ft', languages:['Common','Urgal'], modifiers:{strength:2,endurance:2,agility:-1}, traits:['Powerful Build','Iron Stomach'], abilities:['Heavy Push'], variants:['Mountain Urgal','Clan Urgal'], startingRules:'Uses Large size dice. GM may restrict narrow spaces and tiny gear.' },
      { id:'beastkin', type:'race', name:'Beastkin', version:'race-beastkin-v1.0', updated:SOURCE_DATE, sourcePath:'content/Races/Playable Races/Playable Races Overview.md', summary:'Animal-aspected lineages with keen senses and instinctive movement.', size:'Medium', movement:'30 ft', languages:['Common','Beast Cant'], modifiers:{agility:1,wisdom:1}, traits:['Keen Senses','Natural Instinct'], abilities:['Beast Aspect'], variants:['Wolfkin','Catkin','Bearkin','Hawkkin'], startingRules:'Choose one beast aspect trait at creation.' }
    ],
    classes: [
      { id:'ranger', type:'class', name:'Ranger', version:'class-ranger-v1.0', updated:SOURCE_DATE, sourcePath:'content/Asteria Handbook/Class Talent Trees/Ranger Talent Tree.md', role:'Scout / Marksman / Survivalist', resourceFocus:'SP', proficiencies:['Bows','Light Armour','Survival Tools'], startingTalents:['Keen Instinct','Nature\'s Bond'], talentTree:'Ranger Talent Tree', startingEquipment:['Longbow','Stamina Draught','Iron Rations'], recommended:['Dexterity','Agility','Wisdom'], mechanics:['Hunter tracking','Terrain awareness','Ranged pressure'] },
      { id:'bloodhunter', type:'class', name:'Bloodhunter', version:'class-bloodhunter-v1.0', updated:SOURCE_DATE, sourcePath:'content/Asteria Handbook/Class Talent Trees/Bloodhunter Talent Tree.md', role:'Monster hunter / Blood curse striker', resourceFocus:'HP / SP', proficiencies:['Longswords','Light Armour','Monster Lore'], startingTalents:['Hunter\'s Bane','Blood Scent'], talentTree:'Bloodhunter Talent Tree', startingEquipment:['Iron Longsword','Minor Health Potion'], recommended:['Strength','Dexterity','Wisdom'], mechanics:['Hunter\'s Bane selection','Sangramancy costs','Blood rites'] },
      { id:'cleric', type:'class', name:'Cleric', version:'class-cleric-v1.0', updated:SOURCE_DATE, sourcePath:'content/Asteria Handbook/Class Talent Trees/Cleric Talent Tree.md', role:'Healer / Divine support', resourceFocus:'MP', proficiencies:['Holy Focus','Shields','Rituals'], startingTalents:['Healing Light','Blessing of Light'], talentTree:'Cleric Talent Tree', startingEquipment:['Wooden Shield','Mana Vial','Minor Health Potion'], recommended:['Wisdom','Charisma','Constitution'], mechanics:['Divine channeling','Ritual support','Mana healing'] },
      { id:'druid', type:'class', name:'Druid', version:'class-druid-v1.0', updated:SOURCE_DATE, sourcePath:'content/Asteria Handbook/Class Talent Trees/Druid Talent Tree.md', role:'Nature caster / Shapeshifter', resourceFocus:'MP / SP', proficiencies:['Nature Tools','Herbalism','Light Armour'], startingTalents:['Commune With Nature','Nature\'s Aura'], talentTree:'Druid Talent Tree', startingEquipment:['Traveller Cloak','Minor Health Potion','Iron Rations'], recommended:['Wisdom','Endurance','Agility'], mechanics:['Nature connection','Wild shaping','Balance effects'] },
      { id:'artificer', type:'class', name:'Artificer', version:'class-artificer-v1.0', updated:SOURCE_DATE, sourcePath:'content/Asteria Handbook/Class Talent Trees/Artificer Talent Tree.md', role:'Crafter / Construct support', resourceFocus:'SP / MP', proficiencies:['Crafting Tools','Construct Tools','Light Armour'], startingTalents:['Constructs','Craft Creation'], talentTree:'Artificer Talent Tree', startingEquipment:['Mana Vial','Iron Rations'], recommended:['Intelligence','Dexterity','Wisdom'], mechanics:['Gadgets','Charges','Construct utility'] },
      { id:'paladin', type:'class', name:'Paladin', version:'class-paladin-v1.0', updated:SOURCE_DATE, sourcePath:'content/Asteria Handbook/Class Talent Trees/Paladin Talent Tree.md', role:'Defender / Divine warrior', resourceFocus:'HP / MP', proficiencies:['Heavy Weapons','Shields','Armour'], startingTalents:['Sacred Oath','Blessed Resilience'], talentTree:'Paladin Talent Tree', startingEquipment:['Iron Longsword','Wooden Shield','Iron Breastplate','Minor Health Potion'], recommended:['Strength','Constitution','Charisma'], mechanics:['Personal oath','Defensive resilience','Divine senses'] }
    ],
    talents: [
      { id:'keen-instinct', name:'Keen Instinct', tier:1, rank:1, version:'talent-keen-instinct-r1-v1.0', updated:SOURCE_DATE, sourcePath:'content/Asteria Handbook/Class Talent Trees/Ranger Talent Tree.md', tpCost:3, effects:'+10 to perception/survival style awareness checks.', requirements:'Ranger Tier 1', resourceCosts:{sp:0,mp:0,hp:0}, cooldown:'None', duration:'Passive' },
      { id:'natures-bond', name:"Nature's Bond", tier:1, rank:1, version:'talent-natures-bond-r1-v1.0', updated:SOURCE_DATE, sourcePath:'content/Asteria Handbook/Class Talent Trees/Ranger Talent Tree.md', tpCost:3, effects:'Gain a minor nature-linked benefit chosen by GM/player.', requirements:'Ranger Tier 1', resourceCosts:{sp:0,mp:0,hp:0}, cooldown:'None', duration:'Passive' },
      { id:'hunters-bane', name:"Hunter's Bane", tier:1, rank:1, version:'talent-hunters-bane-r1-v1.0', updated:SOURCE_DATE, sourcePath:'content/Asteria Handbook/Class Talent Trees/Bloodhunter Talent Tree.md', tpCost:3, effects:'Choose a bane path: Fey, Fiend, Undead, Aberrant, or Draconic.', requirements:'Bloodhunter Tier 1', resourceCosts:{sp:0,mp:0,hp:0}, cooldown:'None', duration:'Passive' },
      { id:'healing-light', name:'Healing Light', tier:1, rank:1, version:'talent-healing-light-r1-v1.0', updated:SOURCE_DATE, sourcePath:'content/Asteria Handbook/Class Talent Trees/Cleric Talent Tree.md', tpCost:3, effects:'Unlocks minor divine healing action. Cost determined by spell/talent use.', requirements:'Cleric Tier 1', resourceCosts:{mp:10}, cooldown:'GM defined', duration:'Instant' }
    ],
    items: [
      { id:'longbow', name:'Longbow', type:'Weapon', version:'item-longbow-v1.0', updated:SOURCE_DATE, sourcePath:'content/Items/Weapons & Ammunition/Weapons & Ammunition.md', damage:'1d8', defence:0, effects:'Ranged weapon. Damage rolled physically; website shows dice reference only.', weight:'2 kg', value:'25 Marks', description:'A dependable bow used by scouts and rangers.', tags:['weapon','ranged','bow'] },
      { id:'iron-longsword', name:'Iron Longsword', type:'Weapon', version:'item-iron-longsword-v1.0', updated:SOURCE_DATE, sourcePath:'content/Items/Weapons & Ammunition/Weapons & Ammunition.md', damage:'1d8', defence:0, effects:'Melee weapon. Damage reference only.', weight:'1.5 kg', value:'30 Marks', description:'A standard iron blade.', tags:['weapon','melee','sword'] },
      { id:'wooden-shield', name:'Wooden Shield', type:'Shield', version:'item-wooden-shield-v1.0', updated:SOURCE_DATE, sourcePath:'content/Items/Armour & Protection/Armour & Protection.md', damage:'—', defence:'+1 Shield', effects:'Adds shield bonus when equipped.', weight:'3 kg', value:'10 Marks', description:'A simple strapped shield.', tags:['shield','defence'] },
      { id:'iron-breastplate', name:'Iron Breastplate', type:'Armour', version:'item-iron-breastplate-v1.0', updated:SOURCE_DATE, sourcePath:'content/Items/Armour & Protection/Armour & Protection.md', damage:'—', defence:'+4 Armour', effects:'Adds armour bonus when equipped.', weight:'8 kg', value:'90 Marks', description:'Reliable torso protection.', tags:['armour','defence'] },
      { id:'mana-vial', name:'Mana Vial', type:'Consumable', version:'item-mana-vial-v1.0', updated:SOURCE_DATE, sourcePath:'content/Items/Consumables/Consumables.md', damage:'—', defence:0, effects:'Restores MP if GM allows.', weight:'0.1 kg', value:'15 Marks', description:'A small vial of refined mana.', tags:['consumable','mana'] },
      { id:'minor-health-potion', name:'Minor Health Potion', type:'Consumable', version:'item-minor-health-potion-v1.0', updated:SOURCE_DATE, sourcePath:'content/Items/Consumables/Consumables.md', damage:'—', defence:0, effects:'Restores HP if GM allows.', weight:'0.2 kg', value:'12 Marks', description:'A basic red healing potion.', tags:['consumable','healing'] },
      { id:'stamina-draught', name:'Stamina Draught', type:'Consumable', version:'item-stamina-draught-v1.0', updated:SOURCE_DATE, sourcePath:'content/Items/Consumables/Consumables.md', damage:'—', defence:0, effects:'Restores SP if GM allows.', weight:'0.2 kg', value:'12 Marks', description:'A green draught for stamina recovery.', tags:['consumable','stamina'] },
      { id:'iron-rations', name:'Iron Rations', type:'Supply', version:'item-iron-rations-v1.0', updated:SOURCE_DATE, sourcePath:'content/Items/Tools & Equipment/Tools & Equipment.md', damage:'—', defence:0, effects:'Travel food supply.', weight:'1 kg', value:'3 Marks', description:'Compact hard rations.', tags:['supply','travel'] }
    ]
  };

  window.ASTERIA_COMPENDIUM_V11 = SOURCE;
  function byId(list,id){ return (list||[]).find(x=>x.id===id) || (list||[])[0]; }
  function esc(v){ return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function deepClone(o){ return JSON.parse(JSON.stringify(o||{})); }
  function versionRef(entry){ return { id:entry.id, name:entry.name, version:entry.version, sourcePath:entry.sourcePath, updated:entry.updated }; }
  function linkedBadge(entry){ return `<span class="comp-linked">⛓ Linked to Compendium</span><span class="comp-version">${esc(entry.version)}</span><small>${esc(entry.updated)} • ${esc(entry.sourcePath)}</small>`; }
  function currentAccountKey(){ return (window.session?.uid || window.session?.account || window.session?.user || 'local'); }
  function draftKey(){ return `asteria-v11-character-draft-${currentAccountKey()}`; }
  function getDraft(){ try{return JSON.parse(localStorage.getItem(draftKey())||'{}')}catch(e){return {}} }
  function setDraft(d){ localStorage.setItem(draftKey(),JSON.stringify(d||{})); }
  function allStats(){ return ['strength','dexterity','agility','constitution','endurance','intelligence','wisdom','charisma','luck']; }
  function normId(name){ return String(name||'character').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || ('char-'+Date.now()); }

  function buildSnapshot(draft, status='pending_approval'){
    const race=byId(SOURCE.races,draft.raceId||'human');
    const klass=byId(SOURCE.classes,draft.classId||'ranger');
    const classTalentNames = (klass.startingTalents||[]);
    const talents = SOURCE.talents.filter(t=>classTalentNames.some(n=>String(t.name).toLowerCase()===String(n).toLowerCase()));
    const itemIds = klass.startingEquipment||[];
    const items = SOURCE.items.filter(it=>itemIds.some(n=>String(it.name).toLowerCase()===String(n).toLowerCase() || it.id===n));
    const characteristics = Object.assign({strength:0,dexterity:0,agility:0,constitution:0,endurance:0,intelligence:0,wisdom:0,charisma:0,luck:0}, draft.characteristics||{});
    Object.entries(race.modifiers||{}).forEach(([k,v])=>{ characteristics[k]=(Number(characteristics[k])||0)+Number(v||0); });
    const hp=10+(Number(characteristics.constitution)||0), sp=10+(Number(characteristics.endurance)||0), mp=10+(Number(characteristics.wisdom)||0);
    return {
      schema:'asteria-character-snapshot-v1.1',
      status,
      locked: status==='approved',
      approvedBy: status==='approved' ? (window.session?.user||'GM') : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceSystem:'Character Forge Snapshot System v1.1 — Compendium Linking + Snapshot Logic',
      race: versionRef(race),
      class: versionRef(klass),
      selectedTalents: talents.map(versionRef),
      startingEquipment: items.map(versionRef),
      sourcePageVersions: [versionRef(race),versionRef(klass),...talents.map(versionRef),...items.map(versionRef)],
      appliedStatModifiers: deepClone(race.modifiers||{}),
      characteristics,
      resourceCalculations:{ hp:{base:10,mod:characteristics.constitution||0,max:hp}, sp:{base:10,mod:characteristics.endurance||0,max:sp}, mp:{base:10,mod:characteristics.wisdom||0,max:mp} },
      abilitiesGranted:[...(race.abilities||[]),...(race.traits||[]),...(klass.mechanics||[])],
      updatePolicy:{ autoApply:false, requiresGMApproval:true, deletedSourcesSafe:true },
      ignoredUpdates:[],
      overrides:[]
    };
  }

  function createCharacterFromSnapshot(snapshot,draft){
    const name=(draft.name||'New Character').trim();
    const idBase=normId(name); let id=idBase, i=2; while(window.chars?.[id]) id=`${idBase}-${i++}`;
    const inv=(snapshot.startingEquipment||[]).map(ref=>{ const src=byId(SOURCE.items,ref.id); return Object.assign({qty:1,equipped:false,slot:src.type==='Weapon'?'weapon':(src.type==='Armour'?'armor':(src.type==='Shield'?'shield':'quick'))}, deepClone(src)); });
    window.chars[id]={
      initial:(window.characterInitial?window.characterInitial(name):name[0]||'C'), name,
      race:snapshot.race.name, klass:snapshot.class.name, age:draft.age||'', size:byId(SOURCE.races,draft.raceId).size,
      level:0, hp:[snapshot.resourceCalculations.hp.max,snapshot.resourceCalculations.hp.max], sp:[snapshot.resourceCalculations.sp.max,snapshot.resourceCalculations.sp.max], mp:[snapshot.resourceCalculations.mp.max,snapshot.resourceCalculations.mp.max],
      xp:0,xpMax:5000,campaign:'Unassigned',session:'No active session',conditions:[],cp:0,tp:0,resourceMods:{hp:0,sp:0,mp:0},
      characteristics:snapshot.characteristics, inventory:inv, classTalents:(snapshot.selectedTalents||[]).map(x=>x.name), racialTraits:(snapshot.abilitiesGranted||[]).filter(Boolean),
      snapshot, snapshotStatus:snapshot.status, compendiumUpdateAvailable:false
    };
    const account=window.session?.account||window.session?.user||window.session?.uid;
    if(account && window.accountUsers?.[account]){ window.accountUsers[account].characters=window.accountUsers[account].characters||[]; if(!window.accountUsers[account].characters.includes(id)) window.accountUsers[account].characters.push(id); }
    window.selected=id; if(window.session) window.session.character=id;
    window.saveAccountState?.(); window.saveAsteriaState?.(); window.saveUserAppState?.();
    return id;
  }

  window.renderCharacterCreatorClean=function(){ renderLinkedCharacterCreator(); };
  window.renderLinkedCharacterCreator=function(){
    const host=document.getElementById('characterCreator'); if(!host) return;
    const draft=Object.assign({name:'',age:'',raceId:'human',classId:'ranger',characteristics:{}}, getDraft());
    const race=byId(SOURCE.races,draft.raceId); const klass=byId(SOURCE.classes,draft.classId); const snap=buildSnapshot(draft,'draft');
    host.innerHTML=`
      <div class="linked-creator-head"><div><h3>Character Forge</h3><p class="muted smallnote">Character Forge v1.1 reads Race, Class, Talent, and Item data from the Compendium source, then saves a locked snapshot when approved.</p></div><span class="comp-linked">Compendium Source of Truth</span></div>
      <div class="creator-grid enhanced">
        <label>Character Name<input id="newCharName" value="${esc(draft.name)}" oninput="ccV11Draft('name',this.value)" placeholder="New character name"></label>
        <label>Age<input id="newCharAge" value="${esc(draft.age)}" oninput="ccV11Draft('age',this.value)" placeholder="Age"></label>
        <label>Race<select id="ccRaceSelect" onchange="ccV11Draft('raceId',this.value)">${SOURCE.races.map(r=>`<option value="${r.id}" ${r.id===race.id?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label>
        <label>Class<select id="ccClassSelect" onchange="ccV11Draft('classId',this.value)">${SOURCE.classes.map(c=>`<option value="${c.id}" ${c.id===klass.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
      </div>
      <div class="creator-linked-grid">
        <section class="creator-source-card"><h4>Race Source</h4>${linkedBadge(race)}<p>${esc(race.summary)}</p><p><b>Size:</b> ${esc(race.size)} • <b>Move:</b> ${esc(race.movement)}</p><p><b>Traits:</b> ${(race.traits||[]).map(esc).join(', ')}</p><p><b>Languages:</b> ${(race.languages||[]).map(esc).join(', ')}</p></section>
        <section class="creator-source-card"><h4>Class Source</h4>${linkedBadge(klass)}<p><b>Role:</b> ${esc(klass.role)}</p><p><b>Resource:</b> ${esc(klass.resourceFocus)}</p><p><b>Talents:</b> ${(klass.startingTalents||[]).map(esc).join(', ')}</p><p><b>Equipment:</b> ${(klass.startingEquipment||[]).map(esc).join(', ')}</p></section>
      </div>
      <section class="creator-stat-panel"><div class="section-head mini"><h4>Characteristics</h4><span class="pill">Race modifiers applied in snapshot</span></div><div id="creatorStatsGrid" class="creator-stats-grid">${allStats().map(k=>`<label class="creator-stat"><span>${esc((window.statLabels?.[k]||k).toString())}</span><small>${race.modifiers?.[k]?`Race ${race.modifiers[k]>0?'+':''}${race.modifiers[k]}`:'No race mod'}</small><input type="number" min="0" value="${Number(draft.characteristics?.[k]||0)}" onchange="ccV11Stat('${k}',this.value)"></label>`).join('')}</div></section>
      <section class="snapshot-preview-panel"><div class="section-head mini"><h4>Snapshot Preview</h4><span class="snapshot-status draft">Draft</span></div>${snapshotHTML(snap)}<div class="creator-actions"><button onclick="ccV11SaveDraft()">Save Draft</button><button class="primary" onclick="ccV11SubmitCharacter()">Submit for GM Approval</button><button onclick="ccV11ApproveNow()">GM Approve Now</button></div></section>`;
  };

  function snapshotHTML(snap){
    const refs=(snap.sourcePageVersions||[]).map(r=>`<li><b>${esc(r.name)}</b> <span>${esc(r.version)}</span><small>${esc(r.sourcePath)}</small></li>`).join('');
    return `<div class="snapshot-box"><p><b>Race:</b> ${esc(snap.race.name)} (${esc(snap.race.version)})</p><p><b>Class:</b> ${esc(snap.class.name)} (${esc(snap.class.version)})</p><p><b>Resources:</b> HP ${snap.resourceCalculations.hp.max} • SP ${snap.resourceCalculations.sp.max} • MP ${snap.resourceCalculations.mp.max}</p><p><b>Policy:</b> Compendium changes do not auto-apply. GM approval required.</p><details><summary>Source Page Version References</summary><ul class="snapshot-ref-list">${refs}</ul></details></div>`;
  }
  window.ccV11Draft=function(key,val){ const d=getDraft(); d[key]=val; setDraft(d); renderLinkedCharacterCreator(); };
  window.ccV11Stat=function(k,v){ const d=getDraft(); d.characteristics=d.characteristics||{}; d.characteristics[k]=Math.max(0,Number(v)||0); setDraft(d); };
  window.ccV11SaveDraft=function(){ const d=getDraft(); d.status='draft'; d.updatedAt=new Date().toISOString(); setDraft(d); window.toast?.('Draft saved locally and ready for account sync.'); window.saveUserAppState?.(); };
  window.ccV11SubmitCharacter=function(){ const d=getDraft(); d.status='pending_approval'; d.submittedAt=new Date().toISOString(); d.snapshotPreview=buildSnapshot(d,'pending_approval'); setDraft(d); const id=createCharacterFromSnapshot(d.snapshotPreview,d); window.chars[id].snapshotStatus='pending_approval'; window.chars[id].snapshot.locked=false; window.saveAsteriaState?.(); window.renderPlayerHome?.(); window.toast?.('Character submitted for GM approval.'); window.openAccountCharacter?.(id); };
  window.ccV11ApproveNow=function(){ const d=getDraft(); const snap=buildSnapshot(d,'approved'); const id=createCharacterFromSnapshot(snap,d); window.toast?.('Character approved and snapshot locked.'); window.openAccountCharacter?.(id); };

  function addSheetSnapshotPanel(){
    document.getElementById('snapshotStatusPanelV11')?.remove();
    return;
    const c=window.chars?.[window.currentPlayerId?.()||window.selected]; if(!c) return;
    const parent=document.querySelector('.player-main-panel .campaign-session-panel'); if(!parent) return;
    let box=document.getElementById('snapshotStatusPanelV11'); if(!box){ box=document.createElement('section'); box.id='snapshotStatusPanelV11'; box.className='card snapshot-status-panel'; parent.insertAdjacentElement('afterend',box); }
    const snap=c.snapshot; if(!snap){ box.innerHTML='<h3>Character Snapshot</h3><p class="muted">No linked snapshot yet. Older character or manual character.</p>'; return; }
    const upd=c.compendiumUpdateAvailable;
    box.innerHTML=`<div class="section-head mini"><h3>Character Snapshot</h3><span class="snapshot-status ${snap.locked?'locked':'draft'}">${snap.locked?'Locked / Approved':'Draft / Pending'}</span></div><p><b>${esc(c.name)}</b> uses stored snapshot data for gameplay.</p><p>Race: ${esc(snap.race.name)} <small>${esc(snap.race.version)}</small> • Class: ${esc(snap.class.name)} <small>${esc(snap.class.version)}</small></p>${upd?'<div class="update-warning">Update Available — GM approval required before applying.</div>':'<p class="muted smallnote">No compendium updates pending.</p>'}<details><summary>Version References</summary><ul class="snapshot-ref-list">${(snap.sourcePageVersions||[]).map(r=>`<li><b>${esc(r.name)}</b> <span>${esc(r.version)}</span><small>${esc(r.sourcePath)}</small></li>`).join('')}</ul></details>`;
  }

  function gmSnapshotPanel(){
    const c=window.chars?.[window.selected]; if(!c) return '';
    const snap=c.snapshot;
    if(!snap) return `<section class="card gm-snapshot-tools"><h3>Character Snapshot Tools</h3><p class="muted">Selected character has no v1.1 snapshot.</p></section>`;
    return `<section class="card gm-snapshot-tools"><div class="section-head mini"><h3>Character Snapshot Tools</h3><span class="snapshot-status ${snap.locked?'locked':'draft'}">${snap.status}</span></div><p><b>${esc(c.name)}</b> • ${esc(snap.race.name)} / ${esc(snap.class.name)}</p><div class="gm-snapshot-actions"><button onclick="ccV11GMApproveSelected()">Approve / Lock</button><button onclick="ccV11GMUnlockSelected()">Unlock Sheet</button><button onclick="ccV11MarkUpdateSelected()">Mark Update Available</button><button onclick="ccV11ApplyUpdateSelected()">Apply Update</button><button onclick="ccV11IgnoreUpdateSelected()">Ignore Update</button></div><details><summary>Source Compendium Versions</summary><ul class="snapshot-ref-list">${(snap.sourcePageVersions||[]).map(r=>`<li><b>${esc(r.name)}</b> <span>${esc(r.version)}</span><small>${esc(r.sourcePath)}</small></li>`).join('')}</ul></details><textarea id="ccV11GMNotes" placeholder="Reject notes, override notes, or GM approval comments...">${esc(c.snapshotGMNotes||'')}</textarea></section>`;
  }
  function injectGMTools(){
    const grid=document.querySelector('#gm .gm-grid, #gm .gm-dashboard-grid, #gmSystemPanel, #gm .dashboard-grid');
    if(!grid) return;
    let box=document.getElementById('gmSnapshotToolsV11'); if(!box){ box=document.createElement('div'); box.id='gmSnapshotToolsV11'; grid.appendChild(box); }
    box.outerHTML=`<div id="gmSnapshotToolsV11">${gmSnapshotPanel()}</div>`;
  }
  window.ccV11GMApproveSelected=function(){ const c=window.chars?.[window.selected]; if(!c?.snapshot) return; c.snapshot.status='approved'; c.snapshot.locked=true; c.snapshot.approvedBy=window.session?.user||'GM'; c.snapshot.updatedAt=new Date().toISOString(); c.snapshotStatus='approved'; c.snapshotGMNotes=document.getElementById('ccV11GMNotes')?.value||c.snapshotGMNotes||''; window.saveAsteriaState?.(); window.renderGM?.(); window.toast?.('Character snapshot approved and locked.'); };
  window.ccV11GMUnlockSelected=function(){ const c=window.chars?.[window.selected]; if(!c?.snapshot) return; c.snapshot.locked=false; c.snapshot.status='unlocked_by_gm'; c.snapshotStatus='unlocked_by_gm'; window.saveAsteriaState?.(); window.renderGM?.(); window.toast?.('Character sheet unlocked by GM.'); };
  window.ccV11MarkUpdateSelected=function(){ const c=window.chars?.[window.selected]; if(!c?.snapshot) return; c.compendiumUpdateAvailable=true; window.saveAsteriaState?.(); window.renderGM?.(); window.toast?.('Update available badge added.'); };
  window.ccV11IgnoreUpdateSelected=function(){ const c=window.chars?.[window.selected]; if(!c?.snapshot) return; c.compendiumUpdateAvailable=false; c.snapshot.ignoredUpdates=c.snapshot.ignoredUpdates||[]; c.snapshot.ignoredUpdates.push({date:new Date().toISOString(),by:window.session?.user||'GM'}); window.saveAsteriaState?.(); window.renderGM?.(); window.toast?.('Update ignored for this character.'); };
  window.ccV11ApplyUpdateSelected=function(){ const c=window.chars?.[window.selected]; if(!c?.snapshot) return; const draft={name:c.name,age:c.age,raceId:c.snapshot.race.id,classId:c.snapshot.class.id,characteristics:c.characteristics}; const newSnap=buildSnapshot(draft,'approved'); newSnap.overrides=c.snapshot.overrides||[]; c.snapshot=newSnap; c.snapshotStatus='approved'; c.compendiumUpdateAvailable=false; c.race=newSnap.race.name; c.klass=newSnap.class.name; c.characteristics=newSnap.characteristics; c.hp[1]=newSnap.resourceCalculations.hp.max; c.sp[1]=newSnap.resourceCalculations.sp.max; c.mp[1]=newSnap.resourceCalculations.mp.max; window.saveAsteriaState?.(); window.renderGM?.(); window.toast?.('Compendium update applied to selected character.'); };

  const oldLoad=window.loadPlayer; window.loadPlayer=function(id){ oldLoad?.(id); setTimeout(addSheetSnapshotPanel,0); };
  const oldRenderGM=window.renderGM; window.renderGM=function(){ oldRenderGM?.(); setTimeout(injectGMTools,0); };
  const oldBadge=window.buildVersionBadge; window.buildVersionBadge=function(){ oldBadge?.(); const b=document.querySelector('.version-badge'); if(b)b.textContent=VERSION_LABEL; };
  document.addEventListener('DOMContentLoaded',()=>{ window.buildVersionBadge?.(); setTimeout(()=>{ addSheetSnapshotPanel(); injectGMTools(); },300); });
})();
