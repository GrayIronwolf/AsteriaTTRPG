import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {campaignMembershipRole,isGameMasterRole} from '../src/state/campaignMembershipAccess.mjs';
import {isCampaignGM,isCampaignMember} from '../functions/characterPermissions.mjs';
import {gmCampaignAccess,playerCampaignAccess} from '../src/dashboards/combat/combatAccess.mjs';
import {gmCampaignAccess as mediaGM,playerCampaignAccess as mediaPlayer} from '../src/dashboards/presentation/campaignMediaAccess.mjs';
import {gmPlayerManagerAccess} from '../src/state/gmPlayerManagerModel.mjs';
import {ensureActiveMember} from '../functions/campaignCharacterLinks.mjs';
import {countActivePlayers} from '../functions/campaignJoinApproval.mjs';

const campaign={id:'c',ownerUid:'owner',membershipSchemaVersion:2,
  gmUids:['co'],playerUids:['alice'],roles:{co:'gm',alice:'player'}};
const member=(uid='co',role='co-gm',status='active')=>({uid,campaignId:'c',role,status,revision:1});
test('all membership consumers agree across role, status, identity and schema changes',()=>{
  for(const version of [1,2,3]){
    for(const uid of ['owner','co','alice','outsider']){
      for(const status of ['active','suspended','removed','banned']){
        for(const role of ['co-gm','player','owner','invalid']){
          const c={...campaign,membershipSchemaVersion:version},m=member(uid,role,status);
          const expected=campaignMembershipRole(c,uid,m);
          assert.equal(isCampaignGM(c,uid,m),isGameMasterRole(expected));
          assert.equal(isCampaignMember(c,uid,m),Boolean(expected));
          for(const check of [gmCampaignAccess,mediaGM])assert.equal(check(c,m,uid,'c').allowed,isGameMasterRole(expected));
          for(const check of [playerCampaignAccess,mediaPlayer])assert.equal(check(c,m,uid,'c').allowed,Boolean(expected));
          assert.equal(gmPlayerManagerAccess({campaign:c,actorUid:uid,membership:m}).gm,isGameMasterRole(expected));
        }
      }
    }
  }
  assert.equal(campaignMembershipRole(campaign,'co',{...member(),campaignId:'other'}),'');
  assert.equal(isCampaignMember({...campaign,id:undefined},'co',member()),false);
  assert.equal(isCampaignMember({...campaign,id:undefined},'co',member(),'c'),true);
});
test('character requests reject unknown member roles even with matching projections',()=>{
  for(const role of ['invalid','owner','gm']){
    assert.throws(()=>ensureActiveMember(campaign,member('alice',role),
      {campaignId:'c',status:'active',role},'alice','c'),/membership/);
  }
});
test('player capacity rejects conflicting canonical document identities',async()=>{
  const tx={get:async()=>({docs:[{id:'alice',data:()=>member('someone-else','player')}]})};
  const db={collection:()=>({where(){return this;}})};
  await assert.rejects(countActivePlayers(tx,db,'c','owner'),/require review/);
});
const source=readFileSync('js/firebase-auth.js','utf8');
function declaration(name){
  const start=source.search(new RegExp('(?:async )?function '+name+'\\('));
  const end=source.slice(start+1).search(/\n(?:async )?function /);
  return source.slice(start,start+1+end);
}
test('browser GM actions load canonical membership within their mutation transaction',async()=>{
  const state={uid:'co'},reads=[];
  const deps={currentUser:state,db:{},doc:(_db,...parts)=>parts.join('/'),
    getDocFromServer:async()=>{throw Error('Expected transaction read');},
    campaignMembershipRole,isGameMasterRole};
  const check=Function(...Object.keys(deps),declaration('currentUserIsCampaignGM')+';return currentUserIsCampaignGM;')(...Object.values(deps));
  let value=member();
  const tx={get:async path=>{reads.push(path);return {exists:()=>true,data:()=>value};}};
  const snapshot={id:'c',exists:()=>true,data:()=>campaign};
  assert.equal(await check(snapshot,tx),true);
  value={...value,status:'banned'};
  assert.equal(await check(snapshot,tx),false);
  assert.deepEqual(reads,['campaigns/c/members/co','campaigns/c/members/co']);
});
test('canonical campaign merge preserves only server roster, party and character links',()=>{
  const merge=Function(declaration('mergeSharedCampaign')+';return mergeSharedCampaign;')();
  const result=merge({party:['old'],players:{ghost:{}},characters:{old:{}},playerCharacterLinks:{old:'ghost'}},campaign);
  assert.deepEqual(result,campaign);
});
test('discovery responds to canonical role changes and ignores late callbacks after account switching',()=>{
  const watchers=new Map(),emissions=[];
  const currentUser={uid:'co'};
  const deps={db:{},currentUser,discoveryRoles:null,campaignMembershipRole,
    doc:(_db,...parts)=>parts.join('/'),collection:(_db,...parts)=>parts.join('/'),
    campaignMembershipQueries:()=>['owner-query','gm-query','player-query'],
    linkedCampaignIdsFromOwnedCharacters:()=>[],mergeSharedCampaign:(a,b)=>({...a,...b}),
    onSnapshot:(path,_options,next,error)=>{watchers.set(path,{next,error});return ()=>{};},reportSyncError:()=>{}};
  const start=source.indexOf('  subscribeAccountCampaigns:'),end=source.indexOf('\n  },',start)+4;
  const subscribe=Function(...Object.keys(deps),'return ({'+source.slice(start,end)+'}).subscribeAccountCampaigns;')(...Object.values(deps));
  const stop=subscribe(rows=>emissions.push(rows));
  const snap=(id,value)=>({id,metadata:{fromCache:false},exists:()=>true,data:()=>value});
  watchers.get('gm-query').next({metadata:{},forEach:fn=>fn(snap('c',campaign))});
  assert.deepEqual(emissions.at(-1),[]);
  const listener=watchers.get('campaigns/c/members/co');
  listener.next(snap('co',member()));
  assert.equal(emissions.at(-1).length,1);
  listener.next(snap('co',member('co','co-gm','suspended')));
  assert.deepEqual(emissions.at(-1),[]);
  listener.next(snap('co',member('co','player')));
  assert.equal(emissions.at(-1).length,1);
  currentUser.uid='other';
  const count=emissions.length;
  listener.next(snap('co',member()));
  assert.equal(emissions.length,count);
  stop();
});
