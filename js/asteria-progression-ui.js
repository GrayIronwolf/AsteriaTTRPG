/* Asteria progression UI helpers.
   Keeps CP/TP spending and base talent data out of the main app shell. */

var cpDrafts = {};
var statOrder = ['strength','dexterity','agility','constitution','endurance','intelligence','wisdom','charisma','luck'];

function ensureCPDraft(id){
  cpDrafts[id] = cpDrafts[id] || Object.fromEntries(statOrder.map(key => [key, 0]));
  return cpDrafts[id];
}

function cpPendingTotal(id){
  return Object.values(ensureCPDraft(id)).reduce((total, value) => total + Math.max(0, Number(value || 0)), 0);
}

function renderCharacteristicCP(id = currentPlayerId()){
  const c = chars[id];
  const host = document.getElementById('pStatsLarge');
  if(!c || !host) return;
  ensureProgressionData();

  const draft = ensureCPDraft(id);
  const pending = cpPendingTotal(id);
  if(document.getElementById('cpAvailable')) document.getElementById('cpAvailable').textContent = Math.max(0, (c.cp || 0) - pending);
  if(document.getElementById('cpPending')) document.getElementById('cpPending').textContent = pending;

  host.innerHTML = statOrder.map(key => {
    const value = c.characteristics?.[key] || 0;
    const add = draft[key] || 0;
    const finalValue = value + add;
    const label = key[0].toUpperCase() + key.slice(1);
    return `<div class="stat-card cp-stat"><small>${tierOf(finalValue)}</small><span>${statLabels[key] || label}</span><br><b>${value}</b><p class="muted">${label}</p><div class="cp-stepper"><button onclick="stageCharacteristic('${key}',-1)">-</button><input value="${add}" readonly><button onclick="stageCharacteristic('${key}',1)">+</button></div><em>After apply: ${finalValue}</em></div>`;
  }).join('');
}

function stageCharacteristic(stat, delta){
  const id = currentPlayerId();
  const c = chars[id];
  if(!c) return;
  ensureProgressionData();

  const draft = ensureCPDraft(id);
  const pending = cpPendingTotal(id);
  if(delta > 0 && pending >= (c.cp || 0)) return toast('No CP remaining.');
  draft[stat] = Math.max(0, (draft[stat] || 0) + delta);
  renderCharacteristicCP(id);
}

function applyCharacteristicCP(){
  const id = currentPlayerId();
  const c = chars[id];
  if(!c) return;
  ensureProgressionData();

  const draft = ensureCPDraft(id);
  const pending = cpPendingTotal(id);
  if(!pending) return toast('No characteristic changes staged.');
  if(pending > (c.cp || 0)) return toast('Not enough CP.');

  Object.entries(draft).forEach(([key, value]) => {
    c.characteristics[key] = (c.characteristics[key] || 0) + Number(value || 0);
    draft[key] = 0;
  });
  c.cp -= pending;
  recalcResourceMax(c, true);
  syncAfterResourceChange(id);
  renderCharacteristicCP(id);
  toast(`Applied ${pending} CP to characteristics.`);
  if(typeof addCombatLog === 'function') addCombatLog(`${c.name} applied ${pending} CP to characteristics.`, 'important');
}

function renderTalentTP(id = currentPlayerId()){
  const c = chars[id];
  if(!c || !document.getElementById('tpAvailable')) return;
  ensureProgressionData();
  document.getElementById('tpAvailable').textContent = c.tp || 0;
}

var asteriaClassTalentTrees = {
  ranger: { label: 'Ranger', tiers: [
    { name: 'Tier I', unlock: 1, talents: [['Survival Instinct','Passive',5,'Heightened awareness and defensive reflexes'],['Hawk Eye','Passive',5,'Improved vision, range, and precision'],["Nature's Step",'Passive',5,'Move freely through natural and difficult terrain'],['Precision Strike','Active',5,'Deliver carefully aimed, high-impact attacks'],['Camouflage','Passive',5,'Blend into surroundings to avoid detection'],['Stun Shot','Active',5,'Disable enemies with precise ranged attacks']] },
    { name: 'Tier II', unlock: 15, talents: [["Hunter's Mark",'Active',5,'Commit to a target, enhancing pursuit and pressure'],['Ambush Mastery','Passive',5,'Devastating opening strikes and initiative control'],['Ghost Step','Active',5,'Rapid, silent repositioning through combat zones'],["Predator's Patience",'Passive',5,'Gain power by waiting and observing'],['Volley Mastery','Active',5,'Control space with coordinated ranged volleys']] },
    { name: 'Tier III', unlock: 30, talents: [['Kill Zone','Active',5,'Dominate and control a chosen combat area'],['Relentless Pursuit','Active',5,'Prevent enemies from escaping once the hunt begins'],["Trapper's Instinct",'Passive',5,'Prepare terrain and exploit enemy movement'],["Predator's Roar",'Active',5,'Break enemy resolve and seize momentum']] },
    { name: 'Tier IV', unlock: 50, capstone: true, talents: [['Last Arrow','Reaction',5,'Refuse defeat with a final, decisive strike'],['Master of the Long Hunt','Passive',5,'Excel in extended campaigns and relentless pursuits'],['Apex Stalker','Passive',5,'Become the ultimate hunter, exerting constant pressure']] }
  ] },
  druid: { label: 'Druid', tiers: [
    { name: 'Tier I', unlock: 1, talents: [["Nature's Walk",'Passive',5,'Ignore or reduce penalties from natural terrain'],['Rooted Will','Passive',5,'Resist forced movement, fear, and control effects'],['Seed of the Wild','Passive',5,'Plant dormant nature magic that later activates'],['Living Landscape','Passive',5,'The land subtly adapts to your presence'],['Wild Shape','Active',5,'Transform into beasts and primal natural forms'],['Commune with Nature','Active / Ritual',5,'Sense, read, and communicate with the land']] },
    { name: 'Tier II', unlock: 15, talents: [['Path of Thorns','Active',5,'Turn terrain into hostile, reactive ground'],['Verdant Bastion','Active',5,'Raise living plant matter to defend an area'],["Predator's Domain",'Active',5,'Claim territory that reacts to threats'],['Rot and Renewal','Passive / Active',5,'Decay fuels healing and environmental rebirth'],['Stormcalling','Active',5,'Invoke wind, rain, and lightning'],['Feral Communion','Active',5,'Channel primal instincts to empower allies']] },
    { name: 'Tier III', unlock: 30, talents: [['Cycle of Seasons','Passive / Active',5,'Shift environmental effects by seasonal cycle'],["Nature's Wrath",'Active',5,'Nature retaliates violently against enemies'],['Spirit Bloom','Active',5,'Release stored life energy to heal or empower'],['Equilibrium','Passive',5,'Balance extremes of decay, growth, and magic'],['Astral Projection','Active',5,'Separate spirit from body to travel the spirit realm'],['Call of the Spirit Animal','Active',5,'Summon or embody a primal spirit guide']] },
    { name: 'Tier IV', unlock: 50, talents: [['Ancient Avatar','Active',5,'Become a living embodiment of nature'],['Wild Apotheosis','Passive',5,'Permanently alter how nature responds to you'],['Worldroot Manifestation','Active',5,'Bind ley-lines and ancient natural forces'],['Verdant Dominion','Passive',5,'Entire regions fall under your influence'],['Living Myth','Passive',5,'Your presence reshapes ecosystems long-term'],['Primal Convergence','Active',5,'Merge land, storm, beast, and spirit powers']] }
  ] },
  artificer: { label: 'Artificer', tiers: [
    { name: 'Tier I', unlock: 1, talents: [['Smithing Discipline','Passive',5,'Improves durability, balance, and combat reliability'],['Alchemy Discipline','Passive',5,'Potions gain improved consistency and controlled secondary behaviour'],['Enchanting Calibration','Passive',5,'Reduces enchantment instability and unlocks capacity improvements'],['Gem Craft Discipline','Passive',5,'Improves gem focus, socketing reliability, and power flow'],['Construct Creation','Passive',5,'Allows creation and control of constructs']] },
    { name: 'Tier II', unlock: 15, talents: [["Gadgeteer's Gambit",'Active',5,'Add logic, triggers, emergency protocols, and cursed effects'],['Deconstruct Item','Passive',5,'Recover materials and learn construction methods'],['Deconstruct Enchantment','Passive',5,'Chance to learn enchantments when dismantling'],['Resources','Passive',5,'Increased chance to acquire higher-quality materials'],['False Description','Passive',5,'Conceal or misrepresent true properties']] },
    { name: 'Tier III', unlock: 30, talents: [['Heavy Field Deployment Rig','Active',5,'Rapidly deploy complex creations during combat'],['Blueprint Mastery','Passive',5,'Acquire random blueprints'],['Soul-Bond Object','Passive / Progressive',5,'Bond with one creation'],['Improvised Components','Passive',5,'Substitute missing materials and convert failures']] },
    { name: 'Tier IV', unlock: 50, talents: [['Siege Configuration','Active',5,'Push a creation into extreme combat configuration'],['Multi-Channel Design','Passive',5,'Enchantments and gambits coexist'],['Throughput Optimization','Passive',5,'Reduce action cost, setup time, and friction']] }
  ] },
  bloodhunter: { label: 'Bloodhunter', tiers: [
    { name: 'Tier I', unlock: 1, talents: [['Blood Rite','Active',5,'Empower weapons through Sangramancy at health cost'],['Blood Control','Reactive',5,'Harden or redirect blood to mitigate harm'],['Blood Scent','Passive',3,'Sense blood, wounds, corruption, and injured creatures'],["Hunter's Bane",'Passive',3,'Gain advantages against tracked or favoured prey'],['Veinlock','Reactive',5,'Disrupt enemy movement, timing, or reactions'],['Mark of the Quarry','Active / Passive',5,'Bind your hunt to a target through Sangramancy']] },
    { name: 'Tier II', unlock: 15, talents: [['Bloody Reprisal','Reactive',4,'Counterattack when damaged'],['Hardened Soul','Passive',4,'Resistance to fear, charm, and mental backlash'],['Clotted Resolve','Passive',4,'Suppress bleeding and condition escalation'],['Blood Tithe','Passive',3,'Recover minor resources on marked kills'],['Blood Remembers','Passive',4,'Recall and gain bonuses against past prey'],['Scarred Flesh','Passive',4,'Build resilience through repeated wounds']] },
    { name: 'Tier III', unlock: 30, talents: [['Blood Rage','Passive / Toggle',4,'Increased damage while injured'],['Crimson Ritual','Active',4,'Mid-combat blood rituals'],['Pulse Sever','Active',4,'Disrupt circulation, casting, and concentration'],['Bleeding Future','Active',3,'Borrow power from future vitality'],['Crimson Survivor','Passive',3,'Resist death and act while dying']] },
    { name: 'Tier IV', unlock: 50, talents: [['Avatar of the Crimson Path','Active / Capstone',1,'Fully embrace Sangramancy'],['Blood Pact','Active / Narrative',3,'Bind blood to a supernatural force'],['Crimson Debt','Passive / Narrative',3,'Permanent scars, curses, or divine attention']] }
  ] },
  cleric: { label: 'Cleric', tiers: [
    { name: 'Tier I', unlock: 1, talents: [['Divine Rebuke','Active',5,'Condemn a foe with divine authority'],['Sacred Aegis','Reactive',5,'Shield allies at the moment of impact'],['Beacon of Hope','Passive',5,'Steady allies against fear and despair'],['Divine Insight','Passive',5,'Receive guidance through divine whispers'],['Judgment Brand','Active',5,'Mark a creature for divine reckoning']] },
    { name: 'Tier II', unlock: 15, talents: [['Hymn of Restoration','Active',5,'Sustained healing prayer'],['Consecrated Ground','Active',5,'Sanctify an area'],['Sanctuary of Silence','Active',5,'Suppress divine and magical escalation'],['Mana Well','Passive',5,'Increase mana capacity and recovery'],['Blessed Resilience','Passive',5,'Reduce exhaustion and backlash']] },
    { name: 'Tier III', unlock: 30, talents: [['Burden of Faith','Passive',5,'Convert divine backlash into controlled consequences'],['Echoes of the Faithful','Passive / Narrative',5,'Gain power from prayer and belief'],['Divine Guardian','Reactive',5,'Intercept damage meant for allies'],['Hallowed Ground','Active',5,'Create lingering holy zones']] },
    { name: 'Tier IV', unlock: 50, talents: [['Vowbound Miracle','Active / Narrative',5,'Swear vows to invoke miracles'],['Fortified Mind','Passive',5,'Near-absolute spiritual resilience'],['Divine Intervention','Active / Narrative',5,'Call directly on your deity at great cost']] }
  ] },
  paladin: { label: 'Paladin', tiers: [
    { name: 'Core Talents', unlock: 1, talents: [['Aura of Courage','Passive / Aura',5,'Steels allies against fear'],['Aura of Devotion','Passive / Aura',5,'Shields minds from charm and corruption'],['Aura of Protection','Passive / Aura',5,'Reinforces allies defensively'],['Avenging Wrath','Active',5,'Unleashes righteous fury'],['Divine Smite','Active',5,'Channels divine power into a strike'],['Lay on Hands','Active',5,'Restores health and removes ailments'],['Sacred Oath','Passive / Narrative',5,'Defines power, limits, unlocks, and consequences']] },
    { name: 'Expanded Talents', unlock: 15, talents: [['Divine Judgment','Active',5,'Pass divine sentence upon a foe'],['Oathbound Resolve','Passive',5,'Fortifies will and body'],["Martyr's Burden",'Reactive',5,"Take another's suffering"],['Banner of Conviction','Active / Aura',5,'Raise a holy standard'],['Sacred Reprisal','Reaction',5,'Punish those who strike the faithful'],['Unyielding Sentinel','Passive',5,'Become the final line of defence']] }
  ] }
};

var talentDrafts = {};

function ensureTalentData(id){
  const c = chars[id];
  if(!c) return;
  c.talents = c.talents || {};
  c.talentClass = c.talentClass || guessTalentClass(c.klass);
  talentDrafts[id] = talentDrafts[id] || {};
}

function guessTalentClass(klass = ''){
  const text = String(klass).toLowerCase();
  if(text.includes('ranger')) return 'ranger';
  if(text.includes('druid')) return 'druid';
  if(text.includes('artificer')) return 'artificer';
  if(text.includes('blood')) return 'bloodhunter';
  if(text.includes('cleric')) return 'cleric';
  if(text.includes('paladin')) return 'paladin';
  return 'ranger';
}

function talentRankCost(nextRank){
  return Math.max(1, Number(nextRank) || 1) * 3;
}

function stagedTalentCost(id){
  const c = chars[id];
  ensureTalentData(id);
  let total = 0;
  Object.entries(talentDrafts[id] || {}).forEach(([name, add]) => {
    const current = c.talents[name]?.rank || 0;
    for(let index = 1; index <= add; index++) total += talentRankCost(current + index);
  });
  return total;
}

function changeTalentClass(){
  const id = currentPlayerId();
  const c = chars[id];
  c.talentClass = document.getElementById('talentClassSelect').value;
  talentDrafts[id] = {};
  renderTalentTreeUI(id);
  saveAsteriaState();
}

function stageTalent(talent, max, delta){
  const id = currentPlayerId();
  const c = chars[id];
  ensureTalentData(id);

  const current = c.talents[talent]?.rank || 0;
  const staged = talentDrafts[id][talent] || 0;
  if(delta > 0 && current + staged >= max) return toast('Talent is already at max rank.');
  if(delta > 0){
    talentDrafts[id][talent] = staged + 1;
    if(stagedTalentCost(id) > (c.tp || 0)){
      talentDrafts[id][talent] = staged;
      return toast('Not enough TP.');
    }
  } else {
    talentDrafts[id][talent] = Math.max(0, staged - 1);
  }
  renderTalentTreeUI(id);
}

function applyTalentRanks(){
  const id = currentPlayerId();
  const c = chars[id];
  ensureTalentData(id);

  const cost = stagedTalentCost(id);
  if(!cost) return toast('No talent ranks staged.');
  if(cost > (c.tp || 0)) return toast('Not enough TP.');

  Object.entries(talentDrafts[id]).forEach(([name, add]) => {
    if(add > 0){
      c.talents[name] = c.talents[name] || { rank: 0 };
      c.talents[name].rank += add;
    }
  });
  c.tp -= cost;
  talentDrafts[id] = {};
  saveAsteriaState();
  renderTalentTreeUI(id);
  renderTalentTP(id);
  renderUnlockedTalentSummary(id);
  syncAfterResourceChange(id);
  toast('Talent ranks applied.');
  addCombatLog(`${c.name} spent ${cost} TP on talents.`, 'important');
}

function renderTalentTreeUI(id = currentPlayerId()){
  const host = document.querySelector('#talents .talent-tree-page');
  if(!host) return;
  const c = chars[id];
  if(!c) return;
  ensureTalentData(id);
  ensureProgressionData();

  const tree = asteriaClassTalentTrees[c.talentClass] || asteriaClassTalentTrees.ranger;
  const cost = stagedTalentCost(id);
  host.innerHTML = `<div class="section-head"><div><h3>Class Talent Trees</h3><p class="muted">Class talents are purchased with TP. Tier IV / capstone talents should be GM approved.</p></div><div class="tp-box">Available TP <b id="tpAvailable">${c.tp || 0}</b><small>Staged cost: ${cost}</small></div></div><div class="talent-toolbar"><label>Class Tree <select id="talentClassSelect" onchange="changeTalentClass()">${Object.entries(asteriaClassTalentTrees).map(([key, value]) => `<option value="${key}" ${key === c.talentClass ? 'selected' : ''}>${value.label}</option>`).join('')}</select></label><button class="primary" onclick="applyTalentRanks()">Apply Talent Changes</button></div><div class="class-tree-grid">${tree.tiers.map(tier => renderTalentTier(id, tier)).join('')}</div>`;
}

function renderTalentTier(id, tier){
  const c = chars[id];
  const locked = (c.level || 0) < tier.unlock;
  return `<section class="class-tier-card ${locked ? 'locked-tier' : ''}"><div class="tier-head"><h4>${tier.name}</h4><span>${locked ? 'Unlocks Level ' + tier.unlock : 'Unlocked'}${tier.capstone ? ' - Choose ONE' : ''}</span></div>${tier.talents.map(talent => renderTalentCard(id, talent, locked)).join('')}</section>`;
}

function renderTalentCard(id, talent, locked){
  const c = chars[id];
  const [name, type, max, desc] = talent;
  const current = c.talents?.[name]?.rank || 0;
  const staged = talentDrafts[id]?.[name] || 0;
  const safeName = name.replace(/'/g, "\\'");
  return `<article class="talent-card ${locked ? 'locked' : ''}"><div><b>${name}</b><small>${type} - Rank ${current}${staged ? ` + ${staged}` : ''}/${max}</small><p>${desc}</p></div><div class="talent-stepper"><button ${locked ? 'disabled' : ''} onclick="stageTalent('${safeName}',${max},-1)">-</button><span>${current + staged}</span><button ${locked ? 'disabled' : ''} onclick="stageTalent('${safeName}',${max},1)">+</button></div></article>`;
}

function talentSummaryIcon(name, type){
  const text = `${name} ${type}`.toLowerCase();
  if(text.includes('blood')) return '&#9829;';
  if(text.includes('divine') || text.includes('sacred') || text.includes('holy') || text.includes('faith')) return '&#10022;';
  if(text.includes('nature') || text.includes('wild') || text.includes('root') || text.includes('storm')) return '&#10048;';
  if(text.includes('construct') || text.includes('smith') || text.includes('gadget') || text.includes('blueprint')) return '&#9881;';
  if(text.includes('mark') || text.includes('shot') || text.includes('hunt') || text.includes('arrow')) return '&#10148;';
  if(text.includes('aura') || text.includes('guardian') || text.includes('protection') || text.includes('oath')) return '&#9960;';
  if(text.includes('active')) return '&#10022;';
  if(text.includes('react')) return '&#8634;';
  return '&#9673;';
}

function renderUnlockedTalentSummary(id = currentPlayerId()){
  const host = document.getElementById('classTalentsList');
  const c = chars[id];
  if(!host || !c) return;
  ensureTalentData(id);

  const classes = typeof getCharacterTalentClasses === 'function'
    ? getCharacterTalentClasses(c)
    : [c.talentClass || guessTalentClass(c.klass)];
  const legacyUnlocked = new Set((c.classTalents || []).map(name => String(name).toLowerCase()));
  const groups = [];

  classes.forEach(classKey => {
    const tree = asteriaClassTalentTrees[classKey] || asteriaClassTalentTrees.ranger;
    (tree.tiers || []).forEach(tier => {
      const unlocked = (tier.talents || []).map(talent => {
        const [name, type, max, desc] = talent;
        const rank = c.talents?.[name]?.rank || (legacyUnlocked.has(String(name).toLowerCase()) ? 1 : 0);
        return { name, type, max, desc, rank };
      }).filter(talent => talent.rank > 0);
      if(unlocked.length) groups.push({ classLabel: tree.label, tierName: tier.name, talents: unlocked });
    });
  });

  host.classList.add('unlocked-talent-list');
  host.innerHTML = groups.length ? groups.map(group => `
    <section class="talent-tier-summary">
      <div class="talent-tier-heading"><b>${group.classLabel} - ${group.tierName}</b><span>${group.talents.length} unlocked</span></div>
      ${group.talents.map(talent => `
        <article class="unlocked-talent-card">
          <div class="talent-card-image" aria-hidden="true">${talentSummaryIcon(talent.name, talent.type)}</div>
          <div>
            <b>${talent.name}</b>
            <small>${talent.type} - Rank ${talent.rank}/${talent.max}</small>
            <p>${talent.desc}</p>
          </div>
        </article>
      `).join('')}
    </section>
  `).join('') : '<p class="muted smallnote">No class talents are unlocked yet. Spend TP in the Class/Talent Tree tab to add talents here.</p>';
}

window.AsteriaProgressionUI = {
  cpDrafts,
  statOrder,
  ensureCPDraft,
  cpPendingTotal,
  renderCharacteristicCP,
  stageCharacteristic,
  applyCharacteristicCP,
  renderTalentTP,
  talentDrafts,
  asteriaClassTalentTrees,
  ensureTalentData,
  guessTalentClass,
  talentRankCost,
  stagedTalentCost,
  changeTalentClass,
  stageTalent,
  applyTalentRanks,
  renderTalentTreeUI,
  renderUnlockedTalentSummary
};

window.AsteriaViewHooks?.afterPlayerLoad('cp-tp-player-summary', id => {
  renderCharacteristicCP(id);
  renderTalentTP(id);
  renderUnlockedTalentSummary(id);
});
window.AsteriaViewHooks?.afterGMPlayerRender('gm-player-cp-tp-summary', id => {
  const c = chars[id];
  const div = document.querySelector('#gmPlayer .progression-summary');
  if(div && c) div.innerHTML = `<h3>Progression</h3><p>Level ${c.level} - CP <b>${c.cp || 0}</b> - TP <b>${c.tp || 0}</b></p><button onclick="adjustCharacterResource(selected,'xp',1000)">+1000 XP</button>`;
});
window.AsteriaViewHooks?.afterPlayerLoad('talent-tree-ui', id => renderTalentTreeUI(id));

document.addEventListener('DOMContentLoaded', () => {
  renderCharacteristicCP('kael');
  renderTalentTP('kael');
});
