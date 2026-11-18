import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {newDraft,draftFromCharacter,visibleTabs,validForge,composeCharacter,
 magicRules,affinityItems,STATS,MAGIC,PACKS} from '../frontend/src/forge/forgeModel.mjs';
import {createFirebaseCharactersService} from '../frontend/src/forge/firebaseCharactersService.mjs';
import {createAppServices,previewServices} from '../frontend/src/services/appServices.mjs';
import {canActivateRoute} from '../frontend/src/app/featureRegistry.mjs';
import {isPublishedDefinition} from '../frontend/src/compendium/publicationPolicy.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8');
const data=domain=>JSON.parse(read('frontend/src/forge/public-rules/'+domain+'.json'));
const rules=Object.fromEntries(['race','class','religion','origin','skill','item','talent'].map(domain=>[
 domain,data(domain).entries.filter(e=>e.playable)
]));
const firstRace=rules.race.find(r=>Object.values(r.rules.rollModifiers||{}).every(v=>Number(v)>-10)&&
 Object.values(r.rules.tierCaps||{}).every(v=>Number(v)>=30));
const barbarian=rules.class.find(r=>r.slug==='barbarian')||rules.class.find(r=>magicRules({classSlug:r.slug,classMode:'single',extraClassSlugs:[]},rules).slots===1);
function valid(){
 const draft=newDraft();
 draft.raceSlug=firstRace.slug;
 draft.classSlug=barbarian.slug;
 draft.details.name='Test Character';
 draft.magicTypes=['Air Magic'];
 draft.skills=rules.skill.slice(0,4).map(row=>row.title);
 draft.affinityRolls={
  magic:{'Air Magic':{value:60,locked:true}},
  skills:Object.fromEntries(draft.skills.map(name=>[name,{value:51,locked:true}]))
 };
 draft.equipmentPackSlug=PACKS[0].slug;
 return draft;
}

test('Forge rule assets contain only approved public Compendium projections',()=>{
 const parts=readdirSync(resolve(root,'data/compendium-parts')).filter(name=>/^[a-z]+-[a-f0-9]+\.json$/.test(name));
 const publicIDs=new Map(),hidden=new Set();
 for(const name of parts){
  const part=JSON.parse(read('data/compendium-parts/'+name));
  for(const row of part.entries){
   if(isPublishedDefinition(row))publicIDs.set(row.id,row);
   else hidden.add(row.id);
  }
 }
 for(const domain of ['race','class','religion','origin','skill','item','talent']){
  const shard=data(domain);
  assert.equal(shard.version,1);assert.equal(shard.domain,domain);
  assert.ok(shard.entries.length>0);
  for(const item of shard.entries){
   assert.ok(publicIDs.has(item.id),item.id);
   assert.equal(hidden.has(item.id),false);
   assert.deepEqual(Object.keys(item).sort(),[
    'id','domain','title','slug','category','categoryPath','summary','playable','rules'].sort());
   assert.ok(!Object.hasOwn(item,'body')&&!Object.hasOwn(item,'metadata'));
  }
 }
 for(const domain of ['race','class','skill'])assert.ok(rules[domain].length>0);
 assert.match(read('scripts/site-forge-public-rules.mjs'),/isPublishedDefinition/);
 assert.doesNotMatch(read('frontend/src/forge/publicForgeRules.mjs'),/data\/compendium-parts/);
});

test('eleven-step flow conditionally displays patron, limits classes and magic slots',()=>{
 assert.equal(newDraft().characteristics.strength,10);
 assert.equal(STATS.length,9);
 assert.equal(visibleTabs(valid(),rules).length,10);
 assert.equal(visibleTabs(valid(),rules).includes('Affinity Rolls'),true);
 const d=valid();
 assert.equal(magicRules(d,rules).slots,1);
 assert.equal(affinityItems(d).length,5);
 assert.equal(MAGIC.length,19);
 d.classMode='multi';d.extraClassSlugs=[d.classSlug];
 assert.match(validForge(d,rules)[0].message,/distinct secondary/);
});

test('validated new Forge record keeps exact legacy fields and private ownership',()=>{
 const d=valid();
 assert.deepEqual(validForge(d,rules),[]);
 const r=composeCharacter(d,rules,'user1','forge-012345');
 assert.equal(r.ownerUid,'user1');
 assert.equal(r.id,'forge-012345');
 assert.equal(r.level,0);
 assert.equal(r.character.race.slug,d.raceSlug);
 assert.equal(r.character.class.slug,d.classSlug);
 assert.equal(r.character.equipment.pack.slug,d.equipmentPackSlug);
 assert.ok(Array.isArray(r.character.startingTalents));
 assert.deepEqual(Object.keys(r.talents||{}),r.classTalents);
 assert.equal(r.skills[d.skills[0]],1);
 assert.equal(r.character.affinityRolls.magic['Air Magic'].value,60);
 assert.equal(r.hp[1],10+r.characteristics.constitution*10);
 assert.equal(r.campaign,'Unassigned');
 assert.deepEqual(r.professionSlots,['No Profession Learned','No Profession Learned','No Profession Learned']);
 assert.throws(()=>composeCharacter(d,rules,'','forge-1'),/Invalid/);
 assert.throws(()=>composeCharacter(d,rules,'user1','../../other'),/Invalid/);
});

test('edits preserve progression and sensitive campaign links, without stacking racial bonuses',()=>{
 const draft=valid(),orig=composeCharacter(draft,rules,'user1','forge-one');
 const prior={...orig,level:14,xp:2000,tp:100,inventory:[{name:'A GM reward'}],
  campaign:'GM campaign',sharedCampaignId:'campaign-1',sourceCharacterId:'forge-one',
  linkedCampaignIds:['campaign-1'],campaignCharacterIds:{'campaign-1':'sheet-1'},
  gmGrantedMagicTypes:['Fate Magic'],ownerUid:'user1',
  updatedAt:{seconds:123,nanoseconds:0}};
 const restored=draftFromCharacter(prior);
 for(const stat of STATS)assert.equal(Number(restored.characteristics[stat]),Number(draft.characteristics[stat]));
 restored.details.name='Revised Name';
 const revised=composeCharacter(restored,rules,'user1','forge-one',prior);
 assert.equal(revised.name,'Revised Name');
 assert.equal(revised.level,14);
 assert.equal(revised.tp,100);
 assert.equal(revised.campaign,'GM campaign');
 assert.equal(revised.sharedCampaignId,'campaign-1');
 assert.deepEqual(revised.linkedCampaignIds,['campaign-1']);
 assert.deepEqual(revised.gmGrantedMagicTypes,['Fate Magic']);
 assert.deepEqual(revised.inventory,[{name:'A GM reward'}]);
 assert.deepEqual(revised.characteristics,orig.characteristics);
 assert.throws(()=>composeCharacter(restored,rules,'other','forge-one',prior),/owner mismatch/);
 restored.classSlug='not-original';
 assert.match(validForge(restored,rules,prior)[0].message,/playable|Primary class/);
});

test('missing skills, locked affinity and GM-only choices cannot be saved',()=>{
 const d=valid();
 d.skills=[];
 assert.match(validForge(d,rules).find(x=>x.step==='Skills').message,/four/);
 d.skills=valid().skills;
 d.affinityRolls.magic['Air Magic'].locked=false;
 assert.ok(validForge(d,rules).some(x=>x.step==='Affinity Rolls'));
 d.affinityRolls.magic['Air Magic'].locked=true;
 d.raceSlug='gm-only-race';
 assert.ok(validForge(d,rules).some(x=>x.step==='Race'));
});

test('Firebase character service defaults closed and rejects unauthenticated private reads',async()=>{
 const auth={currentUser:null};
 const sdk={};
 const service=createFirebaseCharactersService({
  auth,db:{},firestoreSdk:sdk,readCanonical:async()=>({uid:'user1'})});
 assert.equal(service.availability().enabled,false);
 await assert.rejects(service.list(),/not enabled/);
 const enabled=createFirebaseCharactersService({
  auth,db:{},firestoreSdk:sdk,readCanonical:async()=>({uid:'user1'}),enabled:true});
 await assert.rejects(enabled.list(),/Sign in/);
 auth.currentUser={uid:'other'};
 await assert.rejects(enabled.list(),/could not be verified/);
});

test('Phase 5.1 does not enable campaigns or dashboards and cannot fall back to legacy globals',()=>{
 assert.equal(canActivateRoute('character-forge',previewServices),false);
 const auth=createAppServices({auth:{}});
 assert.equal(canActivateRoute('character-forge',auth),false);
 const connected=createAppServices({auth:{},characters:{list(){}}});
 assert.equal(canActivateRoute('character-forge',connected),true);
 assert.equal(canActivateRoute('character-dashboard',connected),false,
  'Forge service alone does not opt into the Player Dashboard');
 for(const route of ['campaign-forge','invitation','character-dashboard','dashboard','gm-dashboard']){
  assert.equal(canActivateRoute(route,connected),false,route);
 }
 assert.match(read('frontend/src/auth/AuthBootstrap.jsx'),/adapter\.characters\?\.availability\(\)\.enabled/);
 assert.match(read('frontend/src/auth/firebaseAuthAdapter.mjs'),/VITE_ASTERIA_CHARACTER_FORGE_ENABLED/);
 assert.match(read('frontend/src/app/App.jsx'),/CharacterForgePage/);
 const service=read('frontend/src/forge/firebaseCharactersService.mjs');
 assert.match(service,/getDocFromServer/);assert.match(service,/runTransaction/);
 assert.match(service,/validateOwnedRecord/);assert.match(service,/currentUser\?\.uid/);
 assert.doesNotMatch(service,/localStorage|window\.AsteriaFirebase|setDoc\(\s*.*campaigns/);
 assert.doesNotMatch(read('frontend/src/pages/CharacterForgePage.jsx'),/dangerouslySetInnerHTML|window\.AsteriaFirebase|localStorage/);
 const pkg=JSON.parse(read('package.json'));
 assert.match(pkg.scripts['site:check'],/site-forge-phase5-1\.test\.mjs/);
 assert.match(pkg.scripts['site:build'],/site-forge-public-rules\.mjs/);
 assert.match(read('.github/workflows/site-foundation.yml'),/site:forge-browser/);
});
