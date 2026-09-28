import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import canonical from '../data/compendium.js';
import {buildReactRoute,parseReactRoute} from '../src/app/asteriaRoutes.mjs';

function workspaceMethod(name,dependencies) {
  const source=fs.readFileSync('js/clean-compendium.js','utf8');
  const start=source.indexOf(`  async function ${name}(`);
  const tail=source.slice(start+1),end=tail.search(/\n  (?:async )?function /);
  return Function(...Object.keys(dependencies),`${source.slice(start,start+1+end)};return ${name};`)(...Object.values(dependencies));
}

function linkRuntime(operation,character={id:'ty',ownerUid:'alice',name:'Ty',campaign:'Unassigned'}) {
  const campaign={id:'hello',name:'Hello',party:['old'],players:{alice:{characterIds:['old']}},playerCharacterLinks:{old:'alice'},characters:{old:{ownerUid:'alice'}}};
  const messages=[],saves=[],window={chars:{ty:structuredClone(character)},AsteriaFirebase:{getUser:()=>({uid:'alice'}),isReady:()=>true,linkCharacterToCampaign:operation},toast:message=>messages.push(message)};
  const link=workspaceMethod('linkCharacterToCampaign',{window,console:{warn(){}},findCampaign:()=>campaign,accountKey:()=> 'alice',byId:()=>null,
    storeAccountCampaign:value=>value,persistWorkspaceChange:reason=>saves.push(reason),renderCampaignDetail(){}});
  return {link,window,campaign,messages,saves};
}

test('link UI commits before changing local membership or scheduling background saves',async()=>{
  let finish;
  const h=linkRuntime(()=>new Promise(resolve=>{finish=resolve;}));
  const linking=h.link('hello','ty');
  assert.equal(h.window.chars.ty.sharedCampaignId,undefined);
  assert.deepEqual(h.campaign.party,['old']);assert.deepEqual(h.saves,[]);
  finish({...h.campaign,party:['old','ty']});
  assert.equal((await linking).id,'hello');
  assert.equal(h.window.chars.ty.sharedCampaignId,'hello');
  assert.deepEqual(h.saves,['workspace-character-linked']);
});

test('a failed link leaves an earlier campaign and character association intact',async()=>{
  const h=linkRuntime(async()=>{throw new Error('Connection lost');},{id:'ty',ownerUid:'alice',name:'Ty',campaign:'Previous',sharedCampaignId:'previous',linkedCampaignIds:['previous']});
  const before=JSON.stringify([h.campaign,h.window.chars]);
  assert.equal(await h.link('hello','ty'),null);
  assert.equal(JSON.stringify([h.campaign,h.window.chars]),before);
  assert.deepEqual(h.saves,[]);assert.ok(h.messages.includes('Connection lost'));
});

test('pending Forge campaign join remains available for retry until linking succeeds',async()=>{
  let clears=0,succeed=false;
  const consume=workspaceMethod('consumePendingCampaignJoin',{readPendingCampaignJoin:()=>({campaignId:'hello'}),findCampaign:()=>({id:'hello'}),
    clearPendingCampaignJoin:()=>clears++,linkCharacterToCampaign:async()=>succeed?{id:'hello'}:null});
  assert.equal(await consume('ty'),null);assert.equal(clears,0);
  succeed=true;assert.equal((await consume('ty')).id,'hello');assert.equal(clears,1);
});

function forgeRuntime(saveCharacter) {
  const messages=[],order=[];
  const window={chars:{},session:{uid:'alice'},ASTERIA_UNIVERSAL_COMPENDIUM_INDEX:canonical,
    AsteriaFirebase:{getUser:()=>({uid:'alice'}),isReady:()=>true,saveCharacter},
    AsteriaWorkspace:{consumePendingCampaignJoin:async()=>{order.push('join');return {name:'Hello'};}},
    addEventListener(){},dispatchEvent(){},toast:message=>messages.push(message)};
  const context=vm.createContext({window,document:{readyState:'loading',addEventListener(){},getElementById(){return null;},querySelectorAll(){return [];},body:{dataset:{}}},localStorage:{getItem(){return null;},setItem(){}},CustomEvent:class{},console,URL,URLSearchParams,setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync('js/character-access.js','utf8'),context);
  vm.runInContext(fs.readFileSync('js/compendium-registry.js','utf8'),context);
  // Content selection/roll validation has its own tests. Exercise the real
  // character construction and asynchronous persistence with valid selections.
  const source=fs.readFileSync('js/asteria-gameplay-systems.js','utf8').replace(/\}\)\(\);\s*$/,`render=()=>{};openCharacterForgeHub=()=>{};religiousPatronIssues=()=>[];magicSelectionIssues=()=>[];affinityRollsComplete=()=>true;window.forgeTest={draft,saveCharacterFromDraft};})();`);
  vm.runInContext(source,context);
  const draft=window.forgeTest.draft();
  Object.assign(draft,{raceSlug:'abyssborn-undien',classSlug:'artificer',classMode:'multi',extraClassSlugs:['bloodhunter'],skills:['Perception','Athletics','Stealth','Alchemy']});draft.details.name='Ty';
  return {window,messages,order,draft,save:window.forgeTest.saveCharacterFromDraft};
}

test('Forge waits for Firebase before linking and uses the canonical multiclass sheet',async()=>{
  let finish,submitted;
  const h=forgeRuntime((id,character)=>{submitted={id,character};return new Promise(resolve=>{finish=resolve;});});
  const saving=h.save();assert.ok(submitted);assert.deepEqual(h.order,[]);
  assert.equal(submitted.character.ownerUid,'alice');assert.equal(submitted.character.klass,'Artificer / Bloodhunter');
  finish(true);await saving;
  assert.deepEqual(h.order,['join']);assert.match(h.messages.at(-1),/Ty linked to Hello/);
});

test('Forge retains the draft and ID when saving fails, without claiming a successful campaign link',async()=>{
  const h=forgeRuntime(async()=>false);
  assert.equal(await h.save(),false);const id=h.window.forgeTest.draft().editCharacterId;
  assert.ok(id);assert.equal(h.window.chars[id].name,'Ty');assert.deepEqual(h.order,[]);
  assert.match(h.messages.at(-1),/Firebase could not save/);
  assert.equal(await h.save(),false);assert.deepEqual(Object.keys(h.window.chars),[id]);
});

test('owned dashboard routes need no campaign and preserve normal campaign URLs',()=>{
  const owned={type:'owned-character',campaignId:'',characterId:'Ty / Test'};
  assert.deepEqual(parseReactRoute(buildReactRoute(owned)),owned);
  const linked={type:'character',campaignId:'hello',characterId:'old'};
  assert.deepEqual(parseReactRoute(buildReactRoute(linked)),linked);
  assert.throws(()=>buildReactRoute({type:'character',characterId:'ty'}),/campaign ID/);
  assert.throws(()=>buildReactRoute({type:'owned-character'}),/character ID/);
});
