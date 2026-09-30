import canonicalCompendium from '../data/compendium.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildTalentCatalog,characterClasses,ownedTalents,talentRank,saveTalentRank,reconcileTalentEffects,resetTalentRest,talentEffectActive,prepareForgeTalents,rankDefined} from '../src/state/talentModel.mjs';
import {talentRules,useLearnedTalent} from '../src/state/talentMechanics.mjs';
import {applyCharacteristicPoints,talentRankCost} from '../src/state/liveWorkspaceModel.mjs';
import {applyRest} from '../src/state/specialDamageModel.mjs';
import {calculateCharacterAC} from '../src/systems/armour/armourSystem.mjs';
const entries=canonicalCompendium.entries;
const catalog=buildTalentCatalog({classes:['Spellblade','Cleric','Bloodhunter','Ranger','Paladin','Artificer','Fighter']},entries);
const talent=id=>catalog.find(t=>t.id===id);
const sheet=(id,rank=1,patch={})=>({id:'a',classInfo:{classes:[{title:talent(id).className}]},level:50,tp:100,hp:[100,100],mp:[100,100],sp:[100,100],bp:[0,20],talents:{[talent(id).name]:{rank}},...patch});
const clock={catalog,now:100000,encounter:{status:'active',combatId:'fight',round:1}};

test('Forge, object, nested and combined class formats resolve the same current trees',()=>{
  for(const character of [{klass:{name:'Spellblade'}},{classInfo:{classes:[{title:'Spellblade'}]}},{character:{classInfo:{slug:'spellblade'}}},{classes:[{slug:'spellblade'}]},{primaryClass:{title:'Spellblade'}}])assert.equal(buildTalentCatalog(character,entries).length,19);
  assert.deepEqual(characterClasses({klass:'Spellblade / Cleric',classSlugs:['spellblade','cleric']}),['Spellblade','Cleric']);
  assert.equal(buildTalentCatalog({klass:'Spellblade / Cleric'},entries).length,38);
});
test('legacy object maps, arrays and name lists merge highest ranks without granting duplicate multiclass talents',()=>{
  const c={klass:'Spellblade / Cleric',talents:{'Mana Well':{rank:3}},unlockedTalents:[{name:'Mana Well',rank:2}],classTalents:['Mana Well','Arcane Edge']};
  const cat=buildTalentCatalog(c,entries),owned=ownedTalents(c,cat);
  assert.equal(owned.length,2);assert.equal(talentRank(c,talent('spellblade:mana-well'),cat),3);assert.equal(talentRank(c,talent('cleric:mana-well'),cat),0);
  const next=saveTalentRank(c,talent('cleric:mana-well'),1,cat);
  assert.equal(talentRank(next,talent('cleric:mana-well'),cat),1);assert.equal(talentRank(next,talent('spellblade:mana-well'),cat),3);
});
test('rank and tier prices agree; unwritten ranks cannot be purchased',()=>{
  assert.deepEqual([1,2,3,4,5].map(rank=>talentRankCost(rank,1)),[3,6,9,12,15]);
  assert.deepEqual([1,2,3,4,5].map(rank=>talentRankCost(rank,5)),[15,18,21,24,27]);
  assert.equal(rankDefined(talent('fighter:guarded-stance'),1),false);
});
test('Mana Well applies authored base multipliers once, grants only upgrades and preserves CP base changes',()=>{
  let c=sheet('spellblade:mana-well',1,{mp:[50,100],cp:1,characteristics:{wisdom:1}});
  c=reconcileTalentEffects(c,catalog,{grantIncrease:true});assert.deepEqual(c.mp,[250,300]);
  assert.deepEqual(reconcileTalentEffects(c,catalog,{grantIncrease:true}).mp,c.mp);
  c=reconcileTalentEffects(saveTalentRank(c,talent('spellblade:mana-well'),2,catalog),catalog,{grantIncrease:true});assert.deepEqual(c.mp,[550,600]);
  c=reconcileTalentEffects(applyCharacteristicPoints(c,'wisdom',1).character,catalog);assert.deepEqual(c.mp,[550,660]);
  assert.deepEqual(reconcileTalentEffects(c,catalog,{grantIncrease:true}).mp,c.mp);
});
test('Forge edits retain learned ranks, spent mana, temporary effects and base maxima',()=>{
  const existing=reconcileTalentEffects(sheet('spellblade:mana-well',3,{mp:[20,100]}),catalog,{grantIncrease:true});existing.mp[0]=150;
  const next=prepareForgeTalents(existing,{...existing,mp:[100,110],talents:{'Mana Well':{rank:1}}},entries);
  assert.equal(talentRank(next,talent('spellblade:mana-well'),catalog),3);assert.deepEqual(next.mp,[150,990]);
});
test('rank costs use current source payment clauses, never failure costs or kill rewards',()=>{
  for(const [id,key,amounts] of [['ranger:camouflage','mp',[10,15,20,25,30]],['cleric:blessing-aura','mp',[20,25,30,35,40]],['paladin:paladin-s-charge','sp',[15,15,20,25,30]],['spellblade:arcane-pursuit','mp',[20,25,30,35,40]],['bloodhunter:blood-rite','hp',[5,8,12,16,20]]])assert.deepEqual([1,2,3,4,5].map(rank=>talentRules(talent(id),rank).costs[key]),amounts,id);
  assert.deepEqual([1,2,3,4,5].map(rank=>talentRules(talent('bloodhunter:mark-of-the-quarry'),rank).bpGain),[5,10,15,20,25]);
  assert.equal(talentRules(talent('ranger:hunting-shots'),5).choices.length,10);
  assert.deepEqual([1,2,3,4,5].map(rank=>talentRules(talent('spellblade:arcane-catalyst'),rank).uses),[1,2,3,4,5]);
});
test('talent use debits all resources, adds Blood Points, enforces cooldown and leaves HP alive',()=>{
  const t=talent('bloodhunter:blood-shield'),c=sheet(t.id,2),before=JSON.stringify(c);
  const used=useLearnedTalent(c,t,{costs:{mp:0}},clock);assert.deepEqual(used.character.mp,[75,100]);assert.deepEqual(used.character.hp,[92,100]);assert.deepEqual(used.character.bp,[10,20]);assert.equal(JSON.stringify(c),before);
  assert.throws(()=>useLearnedTalent(used.character,t,{},clock),/round/);
  assert.throws(()=>useLearnedTalent({...c,hp:[8,100]},t,{},clock),/1 HP/);
  assert.throws(()=>useLearnedTalent({...c,mp:[1,100]},t,{},clock),/MP/);
});
test('Blood Tithe and Mystic Recovery honor choices, maxima and Soul Damage',()=>{
  const tithe=talent('bloodhunter:blood-tithe'),c=sheet(tithe.id,2,{bp:[15,20],sp:[90,100]});
  const used=useLearnedTalent(c,tithe,{choice:'sp'},clock).character;
  assert.deepEqual(used.sp,[100,100]);assert.deepEqual(used.hp,[85,100]);assert.deepEqual(used.bp,[5,20]);assert.throws(()=>useLearnedTalent(c,tithe,{choice:'hp'},clock));
  const recovery=talent('spellblade:mystic-recovery'),r=sheet(recovery.id,5,{hp:[78,100],specialDamage:{soul:{value:20}}});
  const restored=useLearnedTalent(r,recovery,{choice:'sp-hp'},clock).character;
  assert.deepEqual(restored.hp,[80,100]);assert.deepEqual(restored.sp,[99,100]);
});
test('AC effects expire or dismiss without stacking and reactions do not alter global AC',()=>{
  const t=talent('bloodhunter:blood-shield'),used=useLearnedTalent(sheet(t.id,1),t,{},clock);
  let c=reconcileTalentEffects(used.character,catalog,clock);assert.equal(c.acModifiers[0].value,2);assert.equal(c.acModifiers.length,1);
  assert.equal(reconcileTalentEffects(c,catalog,clock).acModifiers.length,1);
  const expired={...clock,encounter:{...clock.encounter,round:3}};assert.equal(talentEffectActive(used.effect,expired),false);assert.equal(reconcileTalentEffects(c,catalog,expired).acModifiers.length,0);
  assert.equal(talentRules(talent('spellblade:arcane-reflex'),5).selfAC,0);
  assert.equal(calculateCharacterAC({...c,naturalAC:5}).finalAC,7);
});
test('passive BP limits, recovery and rest counters apply without replenishing uses from other scopes',()=>{
  const blood=reconcileTalentEffects(sheet('bloodhunter:blood-control',3),catalog);assert.deepEqual(blood.bp,[0,35]);
  const recovery=reconcileTalentEffects(sheet('spellblade:mystic-recovery',5,{sp:[0,100]}),catalog);assert.deepEqual(applyRest(recovery,'short').entity.sp,[53,100]);
  const counts={talentUsage:{a:{reset:'short-rest',count:2},b:{reset:'long-rest',count:2},c:{reset:'session',count:1}}};
  assert.equal(resetTalentRest(counts,'short').talentUsage.b.count,2);assert.equal(resetTalentRest(counts,'long').talentUsage.c.count,1);
});
test('React renders mirrored disks with all tier controls and existing owned rank actions',async()=>{
  const {createServer}=await import('vite'),React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
  globalThis.window={ASTERIA_UNIVERSAL_COMPENDIUM_INDEX:{entries},AsteriaFirebase:{},AsteriaInventory:{catalogEntries:()=>[]}};
  const server=await createServer({configFile:false,server:{middlewareMode:true}});
  try{
    const {TalentsTab}=await server.ssrLoadModule('/src/dashboards/ClassTalentTree.jsx');
    const html=renderToStaticMarkup(React.createElement(TalentsTab,{campaignId:'c',character:{...sheet('spellblade:mana-well',3),klass:'Spellblade / Cleric'},editable:false}));
    assert.match(html,/<svg/);assert.match(html,/react-tree-ranks/);assert.match(html,/Mana Well, Rank 3, purchased/);assert.match(html,/Cleric: Tier V/);assert.match(html,/orientation-top/);assert.match(html,/orientation-bottom/);assert.doesNotMatch(html,/Fit to view/);
    const data=await server.ssrLoadModule('/src/dashboards/characterWorkspaceData.js');assert.equal(data.unlockedClassTalents(sheet('bloodhunter:blood-shield',2))[0].rank,2);
  }finally{await server.close();delete globalThis.window;}
});

test('disks rotate and conceal tiers independently, retain rank selection, and survive character changes',async()=>{
  const {createServer}=await import('vite'),React=await import('react'),Renderer=await import('react-test-renderer');
  const originalObserver=globalThis.ResizeObserver;
  globalThis.ResizeObserver=class {constructor(callback){this.callback=callback;}observe(){this.callback([{contentRect:{width:1000,height:600}}]);}disconnect(){}};
  const server=await createServer({configFile:false,server:{middlewareMode:true}});
  let view;
  try {
    const {TalentGraph}=await server.ssrLoadModule('/src/dashboards/TalentGraph.jsx');
    let selected;
    const props=classes=>({catalog:buildTalentCatalog({classes},entries),character:{id:classes.join('/'),classes,level:20,tp:100},onSelect:value=>{selected=value;}});
    const click=label=>Renderer.act(async()=>{view.root.findByProps({'aria-label':label}).props.onClick();});
    const disk=name=>view.root.findByProps({'aria-label':`${name} talent disk`});
    const ranks=name=>disk(name).findAll(node=>node.type==='button' && node.props['data-node-id']?.startsWith('rank:'));
    await Renderer.act(async()=>{view=Renderer.create(React.createElement(TalentGraph,props(['Bloodhunter','Paladin'])),{createNodeMock:()=>({})});});
    assert.match(disk('Paladin').props.className,/orientation-top/);
    assert.match(disk('Bloodhunter').props.className,/orientation-bottom/);
    await click('Paladin: Tier III');
    await click('Bloodhunter: Tier IV');
    assert.equal(disk('Paladin').props['data-tier'],3);assert.equal(disk('Bloodhunter').props['data-tier'],4);
    assert.equal(ranks('Bloodhunter').length,0);assert.equal(ranks('Paladin').length,20);
    const hidden=props(['Bloodhunter']).catalog.find(t=>t.tier===4).name;
    await Renderer.act(async()=>{view.update(React.createElement(TalentGraph,{...props(['Bloodhunter','Paladin']),query:hidden}));});
    assert.equal(view.root.findAll(node=>node.type==='button' && node.props['aria-label']?.includes(hidden)).length,0);
    assert.equal(view.root.findByProps({'aria-label':'Matching unlocked talents'}).findAllByType('button').length,0);
    await click('Bloodhunter: Tier I');
    await click('Bloodhunter, Blood Rite, Rank 3, locked');
    assert.equal(selected.talent.id,'bloodhunter:blood-rite');assert.equal(selected.rank,3);
    assert.equal(view.root.findByProps({'data-node-id':'rank:bloodhunter:blood-rite:3'}).props['aria-pressed'],true);
    const original=props(['Bloodhunter','Paladin']);
    const purchased=saveTalentRank(original.character,selected.talent,2,original.catalog);
    await Renderer.act(async()=>{view.update(React.createElement(TalentGraph,{...original,character:purchased}));});
    assert.match(view.root.findByProps({'data-node-id':'rank:bloodhunter:blood-rite:2'}).props['aria-label'],/purchased/);
    assert.match(view.root.findByProps({'data-node-id':'rank:bloodhunter:blood-rite:3'}).props['aria-label'],/available/);
    assert.equal(disk('Paladin').props['data-tier'],3);
    await Renderer.act(async()=>{view.root.findAllByType('button').find(b=>b.children.includes('Swap Positions')).props.onClick();});
    assert.match(disk('Paladin').props.className,/orientation-bottom/);assert.equal(disk('Paladin').props['data-tier'],3);
    await Renderer.act(async()=>{view.update(React.createElement(TalentGraph,props(['Spellblade','Cleric'])));});
    assert.equal(view.root.findAllByProps({'data-node-id':'rank:bloodhunter:blood-rite:3'}).length,0);
    assert.equal(view.root.findAllByProps({'data-node-id':'class:spellblade'}).length,1);
    assert.equal(view.root.findAllByProps({'data-node-id':'class:cleric'}).length,1);
    await Renderer.act(async()=>{view.update(React.createElement(TalentGraph,props(['Spellblade'])));});
    assert.equal(view.root.findAllByType('section').length,1);assert.match(disk('Spellblade').props.className,/orientation-bottom/);
  } finally {
    if(view)await Renderer.act(async()=>view.unmount());
    await server.close();globalThis.ResizeObserver=originalObserver;
  }
});
