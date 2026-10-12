import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executeAction} from '../functions/handler.mjs';
import {tierBonus,spellAP,rollD20,checkResult,attackResult,counterspellResult,feedback,deathSave,changeCombatHP,mixedDamage,combatOptions,skillCheck} from '../src/state/combatRules.mjs';
import compendium from '../data/compendium.js';

const sheet=(id,ownerUid,patch={})=>({id,ownerUid,sourceCharacterId:id,sharedCampaignId:'c',name:id,klass:'Warrior',hp:[100,100],sp:[100,100],mp:[100,100],characteristics:{agility:20,strength:40,wisdom:20},skills:[{name:'Athletics',rank:3},{name:'Dodging',rank:3}],inventory:[],...patch});
function database(){
  const store=new Map([
    ['campaigns/c',{ownerUid:'gm',playerUids:['alice','bob'],playerCharacterLinks:{a:'alice',b:'bob'}}],
    ['campaigns/c/liveSession/current',{id:'session',status:'active',expiresAt:Date.now()+3600000}],
    ['campaigns/c/systems/encounter',{status:'ready',combatants:[],enemies:[],round:1,turnIndex:0}],
    ['campaigns/c/systems/gmWorkspace',{privateNotes:'Never share this'}]
  ]);
  for(const [id,uid]of [['a','alice'],['b','bob']]){store.set(`campaigns/c/characters/${id}`,sheet(id,uid));store.set(`users/${uid}/characters/${id}`,sheet(id,uid));}
  const ref=path=>({path,id:path.split('/').at(-1)});
  const db={doc:ref,collection:path=>({...ref(path),doc:()=>ref(`${path}/random`)}),runTransaction:async fn=>{
    const next=new Map([...store].map(([k,v])=>[k,structuredClone(v)]));let writing=false;
    const tx={get:async r=>{assert.equal(writing,false,'Firestore reads must precede writes');return {exists:next.has(r.path),data:()=>structuredClone(next.get(r.path)),id:r.id};},set:(r,value,options)=>{writing=true;next.set(r.path,options?.merge?{...next.get(r.path),...structuredClone(value)}:structuredClone(value));},update:(r,value)=>{writing=true;assert.ok(next.has(r.path));next.set(r.path,{...next.get(r.path),...structuredClone(value)});}};
    const result=await fn(tx);store.clear();for(const row of next)store.set(...row);return result;
  }};
  const encounter=()=>store.get('campaigns/c/systems/encounter');
  const command=(uid,actorId,operation,details={},requestId=crypto.randomUUID())=>executeAction(db,uid,{action:'combatCommand',args:['c',actorId,{operation,revision:encounter().combat?.revision||0,...details}],requestId},()=>Date.now());
  const setup=async()=>{assert.equal((await command('gm','encounter','save',{encounter:{combatants:[{id:'player-a',characterId:'a'},{id:'player-b',characterId:'b'}]}})).ok,true);assert.equal((await command('gm','encounter','start')).ok,true);};
  return {db,store,command,encounter,setup,character:id=>store.get(`campaigns/c/characters/${id}`)};
}
test('characteristic tiers, spell AP and explicit canonical owned costs',()=>{
  assert.deepEqual([1,19,20,39,40,59,60,79,80,100,120].map(tierBonus),[0,0,1,1,2,2,3,3,4,4,4]);
  assert.deepEqual(['Weak','Minor','Greater','Strengthened','Enhanced','Superior','Grand','World'].map(spellAP),[1,1,1,1,2,2,3,3]);
  const spells=combatOptions(sheet('a','alice',{spells:[{name:'Heal — Weak',rank:'Weak'}]}),compendium.entries).filter(row=>row.kind==='spell');
  assert.equal(spells.length,1);assert.equal(spells[0].costs.mp,45);assert.equal(spells[0].fields.healing,'1D10');
});
test('checks cancel advantage and use one tier, not raw stat; defence nat20 still must beat attack',()=>{
  assert.deepEqual(rollD20({advantage:true,disadvantage:true},()=>.5),{dice:[11],die:11});
  assert.equal(checkResult({die:20,total:20},100),true);assert.equal(checkResult({die:20,total:30},30,{opposed:true}),false);
  assert.equal(skillCheck(sheet('a','alice'),'Athletics',{catalog:compendium.entries}).modifier,2);
  assert.equal(attackResult({die:20,total:30},100,{die:20,total:30}).hit,true);
  assert.equal(attackResult({die:20,total:30},100,{die:19,total:31}).defended,true);
  assert.equal(attackResult({die:5,total:5},10,{die:1,total:1}).defenceRequired,false);
});
test('Counterspell rank cap, natural results and Feedback do not invent rerolls or extra damage',()=>{
  assert.throws(()=>counterspellResult({die:10,total:20},{die:20,total:30},'World','Superior'),/rank limit/);
  assert.equal(counterspellResult({die:10,total:20},{die:20,total:19},'World','Grand').counterWins,true);
  const both=counterspellResult({die:1,total:9},{die:1,total:10},'Weak','Weak');assert.equal(both.incomingFeedback,true);assert.equal(both.counterFeedback,true);assert.equal(both.reroll,false);
  const c=sheet('a','alice',{hp:[500,500]});let next=feedback(c,'Enhanced',1,1000);assert.equal(next.hp[0],400);next=feedback(next,'Weak',1,1000);assert.equal(next.hp[0],280);assert.equal(next.conditions[0].rank,6);assert.equal(next.conditions[1].rank,undefined);
});
test('Downed tracks damage events, first aid and real recovery; mixed damage rounds only once',()=>{
  let c=changeCombatHP(sheet('a','alice'),100,{damage:true});assert.deepEqual(c.downed,{successes:0,failures:0,dead:false});c=deathSave(c,1);assert.equal(c.downed.failures,2);c=changeCombatHP(c,40,{damage:true});assert.equal(c.downed.dead,true);
  c=changeCombatHP(sheet('a','alice'),100,{damage:true});c=deathSave(deathSave(deathSave(c,10,{firstAid:true}),10),10);assert.equal(c.hp[0],1);assert.equal(c.downed,undefined);
  assert.equal(mixedDamage([{type:'fire',amount:3},{type:'cold',amount:3}],{resistances:[{type:'fire',fraction:.5},{type:'cold',fraction:.5}]}),3);
});
test('turn boundary refreshes exactly once, gives no pre-first-turn AP, and holds unused AP',async()=>{
  const h=database();await h.setup();const first=h.encounter().combatants[0],second=h.encounter().combatants[1];assert.equal(h.encounter().combat.participants[first.id].ap,3);assert.equal(h.encounter().combat.participants[second.id].ap,0);
  const revision=h.encounter().combat.revision;assert.equal((await h.command('gm','encounter','next')).ok,true);assert.equal(h.encounter().combat.participants[first.id].ap,3);assert.equal(h.encounter().combat.participants[second.id].ap,3);
  assert.match((await h.command('gm','encounter','next',{revision})).error,/Combat changed/);
  assert.equal((await h.command('alice','encounter','next')).ok,false);
});
test('player ownership and active turn are checked in the callable; bypass handlers cannot cast freely',async()=>{
  const h=database();await h.setup();const active=h.encounter().combatants[0],waiting=h.encounter().combatants[1];
  assert.equal((await h.command('alice','player-b','declare',{optionId:'basic:command'})).ok,false);
  assert.match((await h.command(waiting.characterId==='a'?'alice':'bob',waiting.id,'declare',{optionId:'basic:command'})).error,/own turn/);
  assert.match((await executeAction(h.db,'eve',{action:'combatCommand',args:['c',active.id,{operation:'declare',optionId:'basic:command'}],requestId:crypto.randomUUID()},()=>1)).error,/membership/);
  assert.match((await executeAction(h.db,'alice',{action:'castCharacterSpell',args:['c','a',{name:'Fake'}],requestId:crypto.randomUUID()},()=>1)).error,/Combat Panel/);
});
test('shared bonus is spent once and request receipts deduplicate retries',async()=>{
  const h=database();await h.setup();const actor=h.encounter().combatants[0],uid=actor.characterId==='a'?'alice':'bob';const request={action:'combatCommand',args:['c',actor.id,{operation:'declare',optionId:'basic:command',revision:h.encounter().combat.revision}],requestId:'same-request'};
  const first=await executeAction(h.db,uid,request,()=>1),second=await executeAction(h.db,uid,request,()=>1);assert.deepEqual(first,second);assert.equal(h.encounter().combat.participants[actor.id].bonus,false);assert.equal(h.encounter().combat.participants[actor.id].ap,3);
  assert.equal((await h.command('gm',actor.id,'resolve',{reason:'Brief command, no check',success:true})).ok,true);
  assert.match((await h.command(uid,actor.id,'declare',{optionId:'basic:command'})).error,/bonus/);
});
test('prepared 2 AP action keeps the same pool, pays full price and expires on own next turn',async()=>{
  const h=database();await h.setup();const actor=h.encounter().combatants[0],uid=actor.characterId==='a'?'alice':'bob';
  assert.equal((await h.command(uid,actor.id,'prepare',{optionId:'basic:dash',trigger:'Gate opens',response:'Dash through gate'})).ok,true);assert.equal(h.encounter().combat.participants[actor.id].ap,3);
  assert.equal((await h.command('gm','encounter','next')).ok,true);
  assert.equal((await h.command('gm',actor.id,'trigger-prepared',{reason:'The gate opens'})).ok,true);
  assert.equal((await h.command('gm',actor.id,'approve',{approval:{checkType:'none',feasible:true}})).ok,true);assert.equal(h.encounter().combat.participants[actor.id].ap,1);
  assert.equal((await h.command('gm',actor.id,'resolve',{reason:'Paid movement completed',success:true})).ok,true);
  assert.equal((await h.command('gm','encounter','next')).ok,true);assert.equal(h.encounter().combat.participants[actor.id].ap,3);assert.equal(h.encounter().combat.participants[actor.id].prepared,null);
});
test('bag potion retrieval and drinking each cost one AP, and GM notes stay out of player state',async()=>{
  const h=database();h.store.set('campaigns/c/characters/a',sheet('a','alice',{inventory:[{id:'potion',name:'Potion',type:'Potion',location:'inventory',qty:1,effect:{resource:'hp',amount:5}}]}));await h.setup();
  if(h.encounter().combatants[0].id!=='player-a')await h.command('gm','encounter','next');
  assert.equal((await h.command('alice','player-a','declare',{optionId:'item:potion'})).ok,true);
  assert.match((await h.command('gm','player-a','approve',{approval:{checkType:'none'}})).error,/Retrieve/);assert.equal(h.encounter().combat.participants['player-a'].ap,3);
  await h.command('gm','player-a','reject');await h.command('alice','player-a','declare',{optionId:'basic:retrieve',itemId:'potion'});assert.equal((await h.command('gm','player-a','approve',{approval:{checkType:'none',feasible:true}})).ok,true);assert.equal((await h.command('gm','player-a','resolve',{reason:'Accessible item in hand',success:true})).ok,true);
  await h.command('alice','player-a','declare',{optionId:'item:potion'});assert.equal((await h.command('gm','player-a','approve',{approval:{checkType:'none'}})).ok,true);assert.equal(h.encounter().combat.participants['player-a'].ap,1);assert.equal(h.character('a').inventory.length,0);
  assert.equal(JSON.stringify(h.encounter()).includes('Never share this'),false);assert.equal(h.store.get('campaigns/c/systems/gmWorkspace').privateNotes,'Never share this');
});
test('pre-roll reactions require an actual trigger and charge held AP plus SP exactly once',async()=>{
  const h=database();for(const [id,uid]of [['a','alice'],['b','bob']])h.store.set(`campaigns/c/characters/${id}`,sheet(id,uid,{inventory:[{id:'sword',name:'Sword',type:'Weapon',equipped:true,qty:1}]}));await h.setup();
  const reactor=h.encounter().combatants[0],attacker=h.encounter().combatants[1],reactorUid=reactor.characterId==='a'?'alice':'bob',attackerUid=attacker.characterId==='a'?'alice':'bob';
  await h.command('gm','encounter','next');assert.match((await h.command(reactorUid,reactor.id,'react',{reaction:'dodge'})).error,/trigger/);
  await h.command(attackerUid,attacker.id,'declare',{optionId:'basic:attack',itemId:'sword',targetIds:[reactor.id]});assert.equal((await h.command('gm',attacker.id,'approve',{approval:{feasible:true,checkType:'attack',skill:'Athletics'}})).ok,true);
  assert.match((await h.command('gm',attacker.id,'roll')).error,/reactions/);
  assert.equal((await h.command('gm',attacker.id,'window',{reactors:[{actorId:reactor.id,choices:['dodge'],reason:'Perceived melee attack; room to evade'}]})).ok,true);
  assert.equal((await h.command(reactorUid,reactor.id,'react',{reaction:'dodge'})).ok,true);assert.equal(h.character(reactor.characterId).sp[0],90);assert.equal(h.encounter().combat.participants[reactor.id].ap,2);
  assert.equal((await h.command(reactorUid,reactor.id,'react',{reaction:'dodge'})).ok,false);assert.equal(h.character(reactor.characterId).sp[0],90);
  await h.command('gm',attacker.id,'resolve-reaction');await h.command('gm',attacker.id,'close-window');assert.equal((await h.command('gm',attacker.id,'roll')).ok,true);
});
test('failed casting settles half base MP, keeps AP, and missing prerequisites cost nothing',async()=>{
  const h=database();h.store.set('campaigns/c/characters/a',sheet('a','alice',{spells:[{name:'Heal — Weak',rank:'Weak'}]}));await h.setup();if(h.encounter().combatants[0].id!=='player-a')await h.command('gm','encounter','next');
  const option=combatOptions(h.character('a'),compendium.entries).find(row=>row.kind==='spell');await h.command('alice','player-a','declare',{optionId:option.id,targetIds:['player-a']});
  assert.equal((await h.command('gm','player-a','approve',{approval:{checkType:'none'}})).ok,false);assert.equal(h.character('a').mp[0],100);assert.equal(h.encounter().combat.participants['player-a'].ap,3);
  assert.equal((await h.command('gm','player-a','approve',{approval:{checkType:'none',castingMethod:'mancer',rankEligible:true,feasible:true}})).ok,true);assert.equal(h.character('a').mp[0],55);assert.equal(h.encounter().combat.participants['player-a'].ap,2);
  await h.command('gm','player-a','close-window');assert.equal((await h.command('gm','player-a','resolve',{reason:'Begun casting fails before manifestation',outcome:'failed-before-manifestation',success:false})).ok,true);assert.equal(h.character('a').mp[0],77);assert.equal(h.encounter().combat.participants['player-a'].ap,2);
});
test('late arrivals preserve the current turn and ending preserves damage and Downed',async()=>{
  const h=database();await h.setup();const current=h.encounter().combatants[0].id;
  const combatants=[...h.encounter().combatants,{id:'late',name:'Late creature',kind:'enemy',hp:[40,40],sp:[20,20],characteristics:{agility:100}}];
  assert.equal((await h.command('gm','encounter','save',{encounter:{combatants}})).ok,true);assert.equal(h.encounter().combatants[h.encounter().turnIndex].id,current);assert.equal(h.encounter().combat.participants.late.ap,0);
  assert.equal((await h.command('gm','player-a','correct',{resource:'hp',amount:100,damage:true,reason:'Confirmed combat damage'})).ok,true);
  assert.equal((await h.command('gm','encounter','end')).ok,true);assert.equal(h.character('a').hp[0],0);assert.equal(h.character('a').downed.failures,0);assert.deepEqual(h.encounter().combat.participants,{});
});
