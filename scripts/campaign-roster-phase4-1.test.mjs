import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {listCampaignPlayerRoster} from '../functions/campaignPlayerRoster.mjs';

const campaign={
  ownerUid:'gm',membershipSchemaVersion:2,name:'Campaign',
  players:{alice:{uid:'alice',displayName:'Alice',characterIds:['a','fake']},
    bob:{uid:'bob',displayName:'Bob'},gm:{uid:'gm',role:'gm'}},
  characters:{
    a:{ownerUid:'alice',name:'Astral Mage',level:7,inventory:[{private:true}]},
    fake:{ownerUid:'bob',name:'Wrong Owner',level:9},
    b:{ownerUid:'bob',name:'Knight',level:3}
  },
  playerCharacterLinks:{a:'alice',fake:'alice',b:'bob'},
  playerUids:['alice','bob','removed'],
  gmUids:['gm'],
  roles:{gm:'gm',alice:'player',bob:'player',removed:'gm'}
};

function fixture(initialCampaign=campaign){
  const store=new Map([['campaigns/c',structuredClone(initialCampaign)]]);
  const doc=path=>({path,get:async()=>{
    const exists=store.has(path);
    return {exists,data:()=>structuredClone(store.get(path))};
  }});
  const collection=path=>{
    const query={path,filter:null,limitTo:null,
      where(key,op,value){return Object.assign(Object.create(this),{filter:[key,op,value]});},
      limit(n){return Object.assign(Object.create(this),{limitTo:n});},
      async get(){
        let docs=[...store.entries()].filter(([p,row])=>p.startsWith(path+'/') &&
          !p.slice(path.length+1).includes('/') &&
          (!this.filter||row[this.filter[0]]===this.filter[2]))
          .map(([p,row])=>({id:p.slice(path.length+1),data:()=>structuredClone(row)}));
        if(this.limitTo!==null)docs=docs.slice(0,this.limitTo);
        return {size:docs.length,docs};
      }
    };
    return query;
  };
  return {store,doc,collection};
}
const member=(uid,role='player',status='active')=>({uid,campaignId:'c',role,status,revision:1});
const add=(db,path,record)=>db.store.set(path,record);

test('canonical roster derives role/status only from canonical docs and ignores stale legacy GM grant',async()=>{
  const db=fixture();
  add(db,'campaigns/c/members/gm',member('gm','owner'));
  add(db,'campaigns/c/members/alice',member('alice'));
  add(db,'campaigns/c/members/bob',member('bob','player','suspended'));
  add(db,'campaigns/c/members/removed',member('removed','player','banned'));
  const result=await listCampaignPlayerRoster(db,'gm','c');
  assert.equal(result.source,'canonical');
  assert.deepEqual(result.active.map(x=>x.uid),['gm','alice']);
  assert.deepEqual(result.inactive.map(x=>x.uid),['bob','removed']);
  assert.equal(result.summary.activePlayers,1);
  assert.equal(result.summary.inactive,2);
  assert.deepEqual(result.active[1].characters,[{id:'a',name:'Astral Mage',level:7}]);
  assert.equal(JSON.stringify(result).includes('inventory'),false);
  assert.equal(JSON.stringify(result).includes('Wrong Owner'),false);
  await assert.rejects(listCampaignPlayerRoster(db,'removed','c'),/Only an active campaign GM/);
  await assert.rejects(listCampaignPlayerRoster(db,'alice','c'),/Only an active campaign GM/);
});

test('active canonical co-GM may list; inactive, forged or missing member cannot',async()=>{
  const db=fixture();
  add(db,'campaigns/c/members/co',member('co','co-gm'));
  assert.equal((await listCampaignPlayerRoster(db,'co','c')).source,'canonical');
  add(db,'campaigns/c/members/co',member('co','co-gm','suspended'));
  await assert.rejects(listCampaignPlayerRoster(db,'co','c'),/active campaign GM/);
  add(db,'campaigns/c/members/co',{...member('co','co-gm'),campaignId:'other'});
  await assert.rejects(listCampaignPlayerRoster(db,'co','c'),/active campaign GM/);
  await assert.rejects(listCampaignPlayerRoster(db,'eve','c'),/active campaign GM/);
});

test('pending applicants appear separately without receiving membership',async()=>{
  const db=fixture();
  add(db,'campaigns/c/members/alice',member('alice'));
  add(db,'campaigns/c/joinRequests/eve',{
    uid:'eve',campaignId:'c',status:'pending',requestedCharacterId:'preferred',
    revision:1,requestedAt:new Date('2026-11-08T00:00:00.000Z'),hiddenSecret:'not for roster'
  });
  add(db,'campaigns/c/joinRequests/old',{uid:'old',campaignId:'c',status:'declined',revision:2});
  add(db,'campaigns/c/joinRequests/alice',{uid:'alice',campaignId:'c',status:'pending',revision:1});
  const result=await listCampaignPlayerRoster(db,'gm','c');
  assert.equal(result.pending.length,1);
  assert.equal(result.pending[0].uid,'eve');
  assert.equal(result.pending[0].requestedCharacterId,'preferred');
  assert.equal(result.pending[0].requestedAt,'2026-11-08T00:00:00.000Z');
  assert.equal(JSON.stringify(result).includes('hiddenSecret'),false);
  assert.equal(db.store.has('campaigns/c/members/eve'),false);
});

test('legacy roster reflects actual v1 roles, includes denied tombstones and does not query pending',async()=>{
  const db=fixture({...campaign,membershipSchemaVersion:1,players:{
    alice:{uid:'alice',status:'active',characterIds:['a'],displayName:'Alice'},
    bob:{uid:'bob',status:'removed'},
    gm:{uid:'gm',status:'active'}
  },roles:{gm:'gm',alice:'player',bob:'player'},playerUids:['alice','bob'],gmUids:['gm']});
  const result=await listCampaignPlayerRoster(db,'gm','c');
  assert.equal(result.source,'legacy');
  assert.equal(result.pending.length,0);
  assert.equal(result.inactive.find(x=>x.uid==='bob').status,'removed');
  await assert.rejects(listCampaignPlayerRoster(db,'alice','c'),/Only a campaign GM/);
});

test('unknown schemas and malformed canonical records fail closed without roster data',async()=>{
  const db=fixture({...campaign,membershipSchemaVersion:99});
  await assert.rejects(listCampaignPlayerRoster(db,'gm','c'),/Unsupported/);
  db.store.get('campaigns/c').membershipSchemaVersion=2;
  add(db,'campaigns/c/members/alice',{...member('alice'),uid:'other'});
  await assert.rejects(listCampaignPlayerRoster(db,'gm','c'),/require review/);
});

test('roster is read-only and UI has no mutation controls',async()=>{
  const db=fixture();
  add(db,'campaigns/c/members/alice',member('alice'));
  const before=structuredClone([...db.store.entries()]);
  await listCampaignPlayerRoster(db,'gm','c');
  assert.deepEqual([...db.store.entries()],before);
  const script=fs.readFileSync('js/campaign-roster-view.js','utf8');
  assert.match(script,/replaceChildren/);
  assert.match(script,/textContent/);
  assert.doesNotMatch(script,/innerHTML|updateDoc|setDoc|deleteDoc/);
  const ui=fs.readFileSync('js/clean-compendium.js','utf8');
  assert.match(ui,/renderCampaignGMPlayerRoster/);
  assert.match(ui,/campaignPlayerRoster===true/);
  const index=fs.readFileSync('index.html','utf8');
  assert.match(index,/campaignPlayerRoster:false/);
});
