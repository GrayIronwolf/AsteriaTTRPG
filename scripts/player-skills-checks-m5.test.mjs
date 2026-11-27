import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {universalCheckAction} from '../functions/universalCheckCommands.mjs';
import {universalSkillPreview,universalAutomaticModifiers} from '../src/state/universalCheckModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function fixture(){
  const campaign={id:'c',ownerUid:'gm',membershipSchemaVersion:2,playerCharacterLinks:{a:'alice',b:'bob'}};
  const hero=(id,ownerUid)=>({id,ownerUid,sharedCampaignId:'c',name:id,
    characteristics:{dexterity:60},skills:[{name:'Stealth',rankName:'Journeyman',primaryStat:'dexterity'}]});
  const store=new Map([['campaigns/c',campaign],
    ['campaigns/c/members/alice',{uid:'alice',role:'player',campaignId:'c',status:'active'}],
    ['campaigns/c/members/bob',{uid:'bob',role:'player',campaignId:'c',status:'active'}],
    ['campaigns/c/characters/a',hero('a','alice')],
    ['campaigns/c/characters/b',hero('b','bob')]]);
  const db={store,doc:path=>({path}),async runTransaction(callback){
    const writes=new Map();
    const tx={async get(ref){const value=writes.has(ref.path)?writes.get(ref.path):store.get(ref.path);
      return {exists:value!==undefined,data:()=>structuredClone(value)};},
      create(ref,value){if(store.has(ref.path)||writes.has(ref.path))throw Error('Duplicate document');
        writes.set(ref.path,structuredClone(value));},
      update(ref,patch){const prior=writes.get(ref.path)||store.get(ref.path);
        if(!prior)throw Error('Missing document');
        writes.set(ref.path,{...structuredClone(prior),...structuredClone(patch)});}
    };
    const result=await callback(tx);
    for(const [key,value] of writes)store.set(key,value);
    return result;
  }};
  return db;
}
const command=(db,props)=>universalCheckAction(db,'gm',{
  campaignId:'c',operationId:randomUUID(),action:'create',type:'group',
  characterIds:['a','b'],skill:'Stealth',characteristic:'dexterity',dc:15,...props
},()=>new Date('2026-11-25T00:00:00Z'));

test('invalid group success thresholds cannot bypass validation or silently default',async()=>{
  const db=fixture();
  for(const requiredSuccesses of ['2',-1,2.5,NaN,3,Infinity]){
    await assert.rejects(command(db,{requiredSuccesses}),/Invalid group success threshold/);
  }
  const created=await command(db,{requiredSuccesses:0});
  assert.equal(db.store.get('campaigns/c/checkGroups/'+created.groupId).requiredSuccesses,1);
  const explicit=await command(db,{requiredSuccesses:2});
  assert.equal(db.store.get('campaigns/c/checkGroups/'+explicit.groupId).requiredSuccesses,2);
});
test('named ranks are never replaced by a legacy conversion for another group participant',async()=>{
  const db=fixture();
  db.store.get('campaigns/c/characters/b').skills=[{name:'Stealth',rank:4,primaryStat:'dexterity'}];
  const result=await command(db,{rankOverride:'Expert'});
  const [a,b]=result.ids.map(id=>db.store.get('campaigns/c/checkRequests/'+id));
  assert.equal(a.modifierTotal,4); // tier 3 + Journeyman 1
  assert.equal(b.modifierTotal,6); // tier 3 + converted Expert 3
  const standalone=universalAutomaticModifiers(db.store.get('campaigns/c/characters/a'),
    {skill:'Stealth',characteristic:'dexterity',rankOverride:'Grandmaster'});
  assert.equal(standalone.total,4);
  await assert.rejects(command(db,{rankOverride:'Invalid'}),/Invalid approved skill rank override/);
});
test('player preview calculates the same server modifier without changing a character',()=>{
  const db=fixture(),character=db.store.get('campaigns/c/characters/a'),before=structuredClone(character);
  const preview=universalSkillPreview(character,{name:'Stealth',primaryStat:'dexterity'});
  assert.equal(preview.available,true);
  assert.equal(preview.total,4);
  assert.equal(preview.rank,'Journeyman');
  assert.deepEqual(character,before);
  assert.match(universalSkillPreview(character,{name:'Unknown Skill'}).reason,/Governing characteristic/);
  const legacy=db.store.get('campaigns/c/characters/b');
  legacy.skills=[{name:'Stealth',rank:4,primaryStat:'dexterity'}];
  assert.equal(universalSkillPreview(legacy,{name:'Stealth',primaryStat:'dexterity'}).available,false);
});
test('player, GM and contextual check controls remain connected to existing transactional checks',()=>{
  const tabs=read('src/dashboards/CharacterWorkspaceTabs.jsx');
  const manager=read('src/dashboards/UniversalCheckWorkspace.jsx');
  const contextual=read('src/dashboards/GMContextCheckLauncher.jsx');
  const character=read('src/dashboards/CharacterDashboard.jsx');
  const gm=read('src/dashboards/GMDashboard.jsx');
  assert.match(tabs,/universalSkillPreview\(character,skill,clock\)/);
  assert.match(tabs,/Record training success/);
  assert.match(tabs,/Confirm training success/);
  assert.match(manager,/Pending GM check requests/);
  assert.match(manager,/disabled=\{!online\|\|busy\}/);
  assert.match(contextual,/Successes required \(blank = half rounded up\)/);
  assert.match(contextual,/requiredSuccesses:type==='group'/);
  assert.match(character,/online=\{live.online&&!live.error\}/);
  assert.match(gm,/GMUniversalCheckManager campaignId=\{campaignId\} characters=\{live.characters\} online=\{live.online&&!live.error\}/);
});
