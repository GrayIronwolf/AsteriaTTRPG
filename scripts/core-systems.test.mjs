import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {collectCharacterEffects,evaluateEffects,characterCheck,effectiveCharacteristicValue} from '../src/state/effectsEngine.mjs';
import {applyResourceChanges,reconcileResources,resourceSnapshot,parseResourceCosts,validateResourceDefinition} from '../src/state/resourceEngine.mjs';
import {makeCondition,applyCondition,activeConditions,removeCondition} from '../src/state/conditionModel.mjs';
import {reconcileCharacterSystems,processCharacterRest} from '../src/state/characterSystems.mjs';
import {buildTalentCatalog,prepareForgeTalents} from '../src/state/talentModel.mjs';
import {talentRules,useLearnedTalent} from '../src/state/talentMechanics.mjs';
import {calculateCharacterAC} from '../src/systems/armour/armourSystem.mjs';
import {ownedGameplayMirrorPatch} from '../src/state/characterIntegrityModel.mjs';
import vm from 'node:vm';
const entries=JSON.parse(fs.readFileSync('data/universal-compendium-index.json','utf8')).entries;
const sheet=patch=>({id:'a',name:'Aster',ownerUid:'alice',hp:[50,100],sp:[20,100],mp:[50,100],bp:[20,20],...patch});
const clock={now:100000,encounter:{status:'active',combatId:'fight',round:1}};
const condition=(patch={})=>makeCondition({name:'Test condition',...patch},'gm',clock,'condition');
test('canonical client mirror preserves private details, replaces maps, and skips unchanged snapshots',async()=>{
  const existing=sheet({name:'Private name',journal:['Private note'],resourceDefinitions:{focus:{reset:{longRest:0}}}});
  const shared=sheet({sharedCampaignId:'c',name:'Old name',journal:[],mp:[30,100],resourceDefinitions:{focus:{}}});
  const patch=ownedGameplayMirrorPatch(existing,shared,'alice','a');
  assert.deepEqual(patch,{mp:[30,100],resourceDefinitions:{focus:{}}});
  assert.deepEqual(ownedGameplayMirrorPatch({...existing,...patch},shared,'alice','a'),{});
  assert.deepEqual(ownedGameplayMirrorPatch(existing,shared,'gm','a'),{});
  assert.deepEqual(ownedGameplayMirrorPatch({...existing,updatedAt:{seconds:2}},{...shared,updatedAt:{seconds:1}},'alice','a'),{});
  const source=fs.readFileSync('js/firebase-auth.js','utf8'),start=source.indexOf('  saveOwnedCharacterSnapshot: async function('),end=source.indexOf('\n  },',start)+4;
  let writes=0;const privateRecord=structuredClone(existing);
  const api=vm.runInNewContext(`({${source.slice(start,end)}})`,{
    db:{},currentUser:{uid:'alice'},ownedGameplayMirrorPatch,doc:(_db,...path)=>path.join('/'),serverTimestamp:()=>123,
    runTransaction:async(_db,callback)=>callback({get:async path=>({exists:()=>true,data:()=>path.startsWith('users/')?privateRecord:shared}),update:(_ref,value)=>{writes++;Object.assign(privateRecord,value);}}),
    reportSyncError:(_scope,error)=>{throw error;}
  });
  // A stale caller cannot overwrite the canonical resource value.
  assert.equal(await api.saveOwnedCharacterSnapshot('a',{...shared,mp:[99,100]}),true);
  assert.deepEqual(privateRecord.mp,[30,100]);assert.equal(privateRecord.name,'Private name');assert.deepEqual(privateRecord.journal,['Private note']);
  assert.equal(await api.saveOwnedCharacterSnapshot('a',shared),true);assert.equal(writes,1);
});
test('structured talents spend and restore custom resources using authored metadata only',()=>{
  const talent={id:'mage:focus',name:'Focus',type:'Active',ranks:{1:'### Effect\nRestore energy.'},metadata:{resourceCosts:{focus:2},restoreResources:{mp:5}}};
  const character=sheet({talents:{Focus:{rank:1}},resources:{focus:[4,8]},resourceDefinitions:{focus:{name:'Focus'}}});
  const used=useLearnedTalent(character,talent,{costs:{focus:0}},clock);
  assert.equal(used.character.resources.focus[0],2);assert.deepEqual(used.character.mp,[55,100]);
  assert.throws(()=>useLearnedTalent({...character,resources:{focus:[1,8]}},talent,{},clock),/Not enough/);
  assert.match(talentRules({...talent,metadata:{resourceCosts:'Variable'}}).blocked,/Invalid authored/);
});
test('effect operations are deterministic; strongest groups and advantage cancel correctly',()=>{
  const effects=[['SET',10],['ADD',4],['SUBTRACT',2],['MULTIPLY',2],['MIN',20],['MAX',5]].map(([operation,value],index)=>({id:String(index),target:'AC',operation,value}));
  assert.equal(evaluateEffects(1,'ac',effects).value,20);
  assert.equal(evaluateEffects(1,'ac',effects.reverse()).value,20);
  const stacked=[2,4].map((value,i)=>({id:String(i),target:'checks',operation:'ADD',value,stackGroup:'blessing',stacking:'strongest'}));
  assert.equal(evaluateEffects(0,'checks',stacked).value,4);
  assert.deepEqual(evaluateEffects(0,'checks',[{target:'checks',operation:'ADVANTAGE'},{target:'checks',operation:'DISADVANTAGE'}]).advantage,false);
});
test('race, equipment, talents and conditions share AC while preserving its racial floor',()=>{
  const character=sheet({naturalAC:5,racialTraits:[{name:'Race',effects:[{id:'race',target:'AC',value:1}]}],inventory:[{id:'charm',equipped:true,effects:[{target:'AC',value:2}]}],talents:{Ward:{effects:[{id:'talent',target:'AC',value:3}]}},conditions:[condition({effects:[{target:'AC',operation:'SUBTRACT',value:2}]})]});
  const ac=calculateCharacterAC(character);assert.equal(ac.modifierTotal,4);assert.equal(ac.finalAC,ac.naturalAC+4);
  character.conditions=[condition({effects:[{target:'AC',operation:'SUBTRACT',value:100}]})];assert.equal(calculateCharacterAC(character).finalAC,ac.naturalAC);
});
test('known spells are not active; expired parents and duplicate equipment do not apply twice',()=>{
  const charm={id:'one',equipped:true,effects:[{target:'AC',value:2}]};
  const effects=collectCharacterEffects({inventory:[charm],equipment:{Neck:charm},spells:[{name:'Known',effects:[{target:'AC',value:100}]}],activeEffects:[{expired:true,effects:[{target:'AC',value:10}]}]});
  assert.equal(evaluateEffects(0,'AC',effects).value,2);
});
test('Mana Well plus Concussion modifies MP without compounding or free healing on removal',()=>{
  const character=sheet({klass:'Cleric',talents:{'Mana Well':{rank:1}},conditions:[condition({template:'concussion',name:'Concussion',effects:[{target:'skills',operation:'SUBTRACT',value:3},{target:'mp.maximum',operation:'MULTIPLY',value:.8}]})]});
  const catalog=buildTalentCatalog(character,entries),first=reconcileCharacterSystems(character,catalog,clock);
  assert.deepEqual(first.mp,[50,240]);assert.equal(characterCheck(first,'skills.perception',0,clock).value,-3);
  assert.deepEqual(reconcileCharacterSystems(first,catalog,clock).mp,[50,240]);
  const removed=removeCondition(first,'condition',{isGM:true,uid:'gm',now:clock.now});
  assert.deepEqual(reconcileCharacterSystems(removed,catalog,clock).mp,[50,300]);
});
test('characteristic effects feed resource maxima without changing base CP statistics',()=>{
  const character=sheet({characteristics:{wisdom:10},activeEffects:[{target:'WIS',value:2}]});
  const next=reconcileResources(character,clock);assert.deepEqual(next.mp,[50,120]);assert.equal(next.characteristics.wisdom,10);assert.equal(effectiveCharacteristicValue(next,'wisdom'),12);
  assert.deepEqual(reconcileResources(next,clock).mp,[50,120]);
});
test('spending is atomic across resources; custom minimums, overflow, and restoration are enforced',()=>{
  const character=sheet({resources:{focus:{current:5,maximum:8,note:'retain'}},resourceDefinitions:{focus:{minimum:1,name:'Focus'}}});
  assert.throws(()=>applyResourceChanges(character,{costs:{mp:10,focus:5}}),/Not enough/);assert.equal(character.mp[0],50);
  const next=applyResourceChanges(character,{costs:{mp:10,focus:2},restore:{hp:80,bp:5}});
  assert.deepEqual(next.hp,[100,100]);assert.deepEqual(next.bp,[25,20]);assert.equal(next.resources.focus.current,3);assert.equal(next.resources.focus.note,'retain');
  assert.equal(resourceSnapshot(next,'focus').minimum,1);
});
test('cost and rule validation reject malformed or untrusted resource data',()=>{
  assert.deepEqual(parseResourceCosts('2 Zeal Points + 3 MP','mp',true),{zp:2,mp:3});
  assert.deepEqual(parseResourceCosts('0 MP','mp',true),{});
  assert.deepEqual(parseResourceCosts({mp:'Variable',description:'GM review'}),{});
  assert.throws(()=>parseResourceCosts('variable MP','mp',true));assert.throws(()=>applyResourceChanges(sheet(),{costs:{unknown:2}}));
  assert.throws(()=>validateResourceDefinition({id:'focus',maximum:4,minimum:5}));
  assert.throws(()=>validateResourceDefinition({id:'focus',maximum:4,recovery:{short:{mode:'fraction',value:2}}}));
  assert.throws(()=>validateResourceDefinition({id:'constructor',maximum:10}));
  assert.throws(()=>validateResourceDefinition({id:'focus',maximum:4,reset:{anything:0}}));
});
test('conditions support legacy records, stacking, controlled removal and timed expiry',()=>{
  assert.equal(activeConditions({conditions:['Poison']}).length,1);
  const timed=condition({duration:{unit:'minutes',value:2}});
  let next=applyCondition(sheet(),timed,clock);next=applyCondition(next,{...timed,id:'second'},clock);
  assert.equal(activeConditions(next,clock).length,1);assert.equal(next.conditions[0].id,'condition');
  assert.throws(()=>removeCondition(next,'condition',{uid:'alice'}),/Only the GM/);
  assert.equal(activeConditions(next,{now:220000}).length,0);
  assert.equal(activeConditions(removeCondition(next,'condition',{isGM:true,uid:'gm'})).length,0);
});
test('round duration expires on encounter progress or end, never on unrelated wall time',()=>{
  const row=condition({duration:{unit:'rounds',value:2}}),character={conditions:[row]};
  assert.equal(activeConditions(character,{...clock,now:99999999}).length,1);
  assert.equal(activeConditions(character,{...clock,encounter:{...clock.encounter,round:3}}).length,0);
  assert.equal(activeConditions(character,{...clock,encounter:{status:'ended'}}).length,0);
  assert.throws(()=>makeCondition({name:'Round',duration:{unit:'rounds',value:1}},'gm',{encounter:{status:'ready'}},'x'));
});
test('rests expire conditions before recovery and reset only matching talent scopes',()=>{
  const character=sheet({mp:[20,100],specialDamage:{soul:20},conditions:[condition({duration:{unit:'long-rest'},effects:[{target:'MP',operation:'MULTIPLY',value:.5}]})],talentUsage:{short:{reset:'short-rest',count:2},long:{reset:'long-rest',count:2},session:{reset:'session',count:1}}});
  const active=reconcileCharacterSystems(character,[],clock);assert.equal(active.mp[1],50);
  const short=processCharacterRest(active,'short',[],clock).entity;assert.deepEqual(short.sp,[55,100]);assert.deepEqual(short.bp,[15,20]);assert.equal(short.talentUsage.long.count,2);
  const long=processCharacterRest(active,'long',[],clock).entity;assert.deepEqual(long.mp,[70,100]);assert.deepEqual(long.hp,[80,100]);assert.deepEqual(long.sp,[100,100]);assert.deepEqual(long.bp,[0,20]);assert.equal(long.talentUsage.long.count,0);assert.equal(long.talentUsage.session.count,1);
});
test('regeneration is lazy, does not compound, and does not bank paused combat time',()=>{
  const character=sheet({resources:{focus:[0,20]},resourceDefinitions:{focus:{regeneration:{amount:2,intervalMs:1000}}}});
  const start=reconcileResources(character,{now:1000,encounter:{status:'ready'}});
  const recovered=reconcileResources(start,{now:4000,encounter:{status:'ready'}});assert.equal(recovered.resources.focus[0],6);
  assert.equal(reconcileResources(recovered,{now:4000,encounter:{status:'ready'}}).resources.focus[0],6);
  const combat=reconcileResources(recovered,{now:5000,encounter:clock.encounter});const end=reconcileResources(combat,{now:20000,encounter:{status:'ended'}});assert.equal(end.resources.focus[0],6);
});
test('learned Paladin Zeal supplies a capped resource and canonical technique costs',()=>{
  const character=sheet({klass:'Paladin',level:20,talents:{"Paladin's Zeal":{rank:4}}}),catalog=buildTalentCatalog(character,entries),talent=catalog.find(row=>row.id==='paladin:paladin-s-zeal');
  let next=reconcileCharacterSystems(character,catalog,clock);assert.deepEqual(next.zp,[0,15]);
  next=applyResourceChanges(next,{restore:{zp:100}});assert.deepEqual(next.zp,[15,15]);
  const rules=talentRules(talent,4);assert.equal(rules.choices.find(row=>row.id==='divine-guard').costs.zp,4);
  const used=useLearnedTalent(next,talent,{choice:'divine-guard'},{...clock,catalog});assert.equal(used.character.zp[0],11);assert.equal(used.effect.ac,2);
  assert.equal(reconcileCharacterSystems(used.character,catalog,{...clock,encounter:{status:'ended'}}).zp[0],0);
});
test('owner and GM condition controls and recovery rules render in React',async()=>{
  const {createServer}=await import('vite'),React=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
  const server=await createServer({configFile:false,server:{middlewareMode:true}});
  try {
    const {ConditionsPanel,RestRules,RestRequestsPanel}=await server.ssrLoadModule('/src/dashboards/CharacterSystemsPanels.jsx');
    const props={campaignId:'c',character:sheet({conditions:[condition()]}),editable:true,clock};
    const player=renderToStaticMarkup(React.createElement(ConditionsPanel,props));assert.match(player,/Test condition/);assert.doesNotMatch(player,/Remove Test condition|Apply condition or effect/);
    const gm=renderToStaticMarkup(React.createElement(ConditionsPanel,{...props,isGM:true}));assert.match(gm,/Remove Test condition/);assert.match(gm,/Apply condition or effect/);
    assert.match(renderToStaticMarkup(React.createElement(RestRules,{character:sheet()})),/35%/);
    assert.match(renderToStaticMarkup(React.createElement(RestRequestsPanel,{campaignId:'c',characters:{a:sheet({restState:{request:{id:'request',status:'pending'}}})},editable:true})),/Approve Long Rest/);
  } finally {await server.close();}
});
test('shared action hook coalesces immediate clicks and clears loading on failure',async()=>{
  const {createServer}=await import('vite'),React=await import('react'),renderer=await import('react-test-renderer');
  const server=await createServer({configFile:false,server:{middlewareMode:true}});
  try {
    const {useAsyncAction}=await server.ssrLoadModule('/src/components/useAsyncAction.js');let action,finish,calls=0;
    function Probe(){action=useAsyncAction();return null;}
    let root;await renderer.act(async()=>{root=renderer.create(React.createElement(Probe));});
    let first,second;renderer.act(()=>{first=action.run(()=>{calls++;return new Promise(resolve=>{finish=resolve;});});second=action.run(()=>{calls++;return {ok:true};});});
    await Promise.resolve();assert.equal(first,second);assert.equal(calls,1);assert.equal(action.busy,true);
    await renderer.act(async()=>{finish({ok:true});await first;});assert.equal(action.busy,false);
    await renderer.act(async()=>{await action.run(()=>{throw new Error('Offline');});});assert.equal(action.busy,false);assert.equal(action.message,'Offline');root.unmount();
  } finally {await server.close();}
});

test('Forge edits rebase all core maxima while preserving effects, spent resources and rest state',()=>{
  const existing=reconcileCharacterSystems(sheet({activeEffects:[{id:'hp-buff',target:'hp.maximum',value:20}],restState:{sequence:3},zp:[4,10],specialDamage:{soul:10}}),[],clock);
  existing.zp=[4,10];
  assert.equal(existing.hp[1],120);
  const next=prepareForgeTalents(existing,sheet({hp:[100,100],mp:[100,100],sp:[100,100]}),entries);
  assert.deepEqual(next.hp,[50,120]);assert.deepEqual(next.mp,[50,100]);assert.equal(next.restState.sequence,3);assert.deepEqual(next.zp,[4,10]);assert.equal(next.specialDamage.soul,10);
});
test('core synchronization hook does not create a refresh loop on repeated snapshots',async()=>{
  const {createServer}=await import('vite'),React=await import('react'),renderer=await import('react-test-renderer');
  const server=await createServer({configFile:false,server:{middlewareMode:true}});
  let calls=0;globalThis.window={AsteriaFirebase:{refreshCharacterSystems:async()=>{calls++;return {ok:true};}}};
  try {
    const {useCharacterSystemsSync}=await server.ssrLoadModule('/src/sessions/useCharacterSystemsSync.js');
    function Probe({characters,encounter}){useCharacterSystemsSync('c',characters,encounter,true);return null;}
    const character=sheet();let root;
    await renderer.act(async()=>{root=renderer.create(React.createElement(Probe,{characters:{a:character},encounter:clock.encounter}));});assert.equal(calls,1);
    await renderer.act(async()=>{root.update(React.createElement(Probe,{characters:{a:{...character}},encounter:{...clock.encounter}}));});assert.equal(calls,1);
    await renderer.act(async()=>{root.update(React.createElement(Probe,{characters:{a:{...character,coreStateVersion:1}},encounter:{...clock.encounter,round:2}}));});assert.equal(calls,1);
    await renderer.act(async()=>{root.unmount();});
  } finally {await server.close();delete globalThis.window;}
});
