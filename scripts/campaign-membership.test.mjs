import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMBER_ROLES,MEMBER_STATUSES,JOIN_REQUEST_STATUSES,
  legacyMembershipPlan,memberDocument,ownerMembership,stageLegacyMemberships
} from '../functions/campaignMembership.mjs';

function testDatabase(seed={}) {
  const records=new Map(Object.entries(seed));
  return {
    records,
    doc(path){return {path};},
    async runTransaction(callback){
      const staged=new Map();
      const transaction={
        async get(ref){
          const value=records.get(ref.path);
          return {exists:records.has(ref.path),data:()=>structuredClone(value)};
        },
        create(ref,value){
          if(records.has(ref.path)||staged.has(ref.path)) throw new Error('already exists');
          staged.set(ref.path,structuredClone(value));
        }
      };
      const result=await callback(transaction);
      for(const [key,value] of staged) records.set(key,value);
      return result;
    }
  };
}
const base=()=>({
  ownerUid:'gm',
  gmUids:['gm','co'],
  playerUids:['alice','bob'],
  roles:{gm:'gm',co:'gm',alice:'player',bob:'player'},
  players:{
    gm:{uid:'gm',role:'gm',status:'active',characterIds:[]},
    co:{uid:'co',role:'gm',status:'active',characterIds:[]},
    alice:{uid:'alice',role:'player',status:'active',characterIds:['char-a'],joinedAt:'2026-01-01T00:00:00.000Z'},
    bob:{uid:'bob',role:'player',status:'suspended',characterIds:['char-b']}
  },
  ucn:'123456789012',
  party:['char-a','char-b'],
  characters:{'char-a':{ownerUid:'alice',xp:222,inventory:[{name:'Sword'}]}}
});

test('role and status vocabularies are explicit and pending is not a membership state',()=>{
  assert.deepEqual(MEMBER_ROLES,['owner','co-gm','player']);
  assert.deepEqual(MEMBER_STATUSES,['active','suspended','removed','banned']);
  assert.equal(JOIN_REQUEST_STATUSES.includes('pending'),true);
  assert.equal(MEMBER_STATUSES.includes('pending'),false);
});

test('legacy roster resolves owner and Co-GM without double-counting',()=>{
  const plan=legacyMembershipPlan(base(),'c');
  assert.equal(plan.issues.length,0);
  assert.deepEqual(plan.rows.map(({uid,role,status})=>({uid,role,status})),[
    {uid:'alice',role:'player',status:'active'},
    {uid:'bob',role:'player',status:'suspended'},
    {uid:'co',role:'co-gm',status:'active'},
    {uid:'gm',role:'owner',status:'active'}
  ]);
});

test('roles are not inferred from an orphan active player display record',()=>{
  const c=base();c.players.eve={uid:'eve',status:'active'};
  const plan=legacyMembershipPlan(c,'c');
  assert.equal(plan.rows.some(x=>x.uid==='eve'),false);
  assert.ok(plan.issues.some(x=>x.code==='orphan-active-player'&&x.uid==='eve'));
});

test('orphan bans are preserved as denied tombstones',()=>{
  const c=base();c.players.eve={uid:'eve',status:'banned'};
  const plan=legacyMembershipPlan(c,'c');
  assert.equal(plan.issues.length,0);
  assert.deepEqual(plan.rows.find(x=>x.uid==='eve'),{uid:'eve',role:'player',status:'banned',joinedAt:undefined});
});

test('mismatched or unsupported legacy statuses block staging',()=>{
  const c=base();c.players.alice.status='pending';
  const plan=legacyMembershipPlan(c,'c');
  assert.ok(plan.issues.some(x=>x.code==='unsupported-member-status'));
  const invalid=base();invalid.players.gm.status='removed';
  assert.ok(legacyMembershipPlan(invalid,'c').issues.some(x=>x.code==='owner-status-conflict'));
});

test('unknown legacy role or invalid identifier is a review conflict',()=>{
  const c=base();c.roles.alice='admin';c.playerUids.push('invalid/uid');
  const plan=legacyMembershipPlan(c,'c');
  assert.ok(plan.issues.some(x=>x.code==='invalid-role'));
  assert.ok(plan.issues.some(x=>x.code==='invalid-uid'));
});

test('membership documents use server times, provenance and no character data',()=>{
  const when=new Date('2026-11-08T10:00:00Z');
  const data=memberDocument({campaignId:'c',uid:'alice',role:'player',joinedAt:'2026-01-01T00:00:00Z'},when);
  assert.equal(data.uid,'alice');
  assert.equal(data.role,'player');
  assert.equal(data.status,'active');
  assert.equal(data.origin,'legacy-migration');
  assert.equal(data.revision,1);
  assert.equal(data.joinedAt.toISOString(),'2026-01-01T00:00:00.000Z');
  assert.equal(data.updatedAt.toISOString(),when.toISOString());
  assert.equal(JSON.stringify(data).includes('char-a'),false);
  assert.deepEqual(data.capabilityOverrides,{});
});

test('owner membership stays active and cannot be downgraded in model',()=>{
  assert.equal(ownerMembership('c','gm').role,'owner');
  assert.throws(()=>memberDocument({campaignId:'c',uid:'gm',role:'owner',status:'suspended'}),/owner must remain active/);
  assert.throws(()=>memberDocument({campaignId:'c',uid:'gm',role:'gm',status:'active'}),/Invalid membership/);
  assert.throws(()=>memberDocument({campaignId:'c',uid:'gm',role:'player',status:'pending'}),/Invalid membership/);
});

test('dry-run returns only membership metadata and writes nothing',async()=>{
  const original=base();
  const db=testDatabase({'campaigns/c':original});
  const summary=await stageLegacyMemberships(db,'gm','c');
  assert.equal(summary.canStage,true);
  assert.equal(summary.missing,4);
  assert.equal(summary.staged,0);
  assert.equal(db.records.size,1);
  assert.deepEqual(db.records.get('campaigns/c'),original);
});

test('staging is owner-only and does not alter legacy campaign or owned character',async()=>{
  const initial=base();
  const db=testDatabase({'campaigns/c':initial,'users/alice/characters/char-a':{ownerUid:'alice',xp:999,inventory:[{name:'Bow'}]}});
  await assert.rejects(stageLegacyMemberships(db,'alice','c',{write:true}),/Only the campaign owner/);
  const report=await stageLegacyMemberships(db,'gm','c',{write:true});
  assert.equal(report.staged,4);
  assert.equal(db.records.get('campaigns/c').membershipSchemaVersion,undefined);
  assert.deepEqual(db.records.get('campaigns/c'),initial);
  assert.deepEqual(db.records.get('users/alice/characters/char-a'),{ownerUid:'alice',xp:999,inventory:[{name:'Bow'}]});
  assert.equal(db.records.get('campaigns/c/members/bob').status,'suspended');
});

test('same staging request is idempotent and never overwrites existing member docs',async()=>{
  const db=testDatabase({'campaigns/c':base()});
  await stageLegacyMemberships(db,'gm','c',{write:true});
  const original=db.records.get('campaigns/c/members/alice');
  const repeat=await stageLegacyMemberships(db,'gm','c',{write:true});
  assert.equal(repeat.staged,0);
  assert.equal(repeat.alreadyStaged,4);
  assert.deepEqual(db.records.get('campaigns/c/members/alice'),original);
});

test('conflicting existing status blocks all new writes',async()=>{
  const db=testDatabase({
    'campaigns/c':base(),
    'campaigns/c/members/alice':{uid:'alice',campaignId:'c',role:'player',status:'banned',revision:8}
  });
  const preview=await stageLegacyMemberships(db,'gm','c');
  assert.equal(preview.canStage,false);
  assert.ok(preview.issues.some(x=>x.code==='member-state-conflict'));
  await assert.rejects(stageLegacyMemberships(db,'gm','c',{write:true}),/staging blocked/);
  assert.equal(db.records.has('campaigns/c/members/co'),false);
  assert.equal(db.records.get('campaigns/c/members/alice').revision,8);
});

test('staging never proceeds for a live schema-v2 campaign',async()=>{
  const c=base();c.membershipSchemaVersion=2;
  const db=testDatabase({'campaigns/c':c});
  await assert.rejects(stageLegacyMemberships(db,'gm','c',{write:true}),/Only legacy campaigns/);
  assert.equal(db.records.size,1);
});

test('legacy member count and unexpected roles must be reviewed before writing',async()=>{
  const c=base();
  c.playerUids=Array.from({length:101},(_,i)=>'player-'+i);
  const db=testDatabase({'campaigns/c':c});
  const report=await stageLegacyMemberships(db,'gm','c');
  assert.equal(report.canStage,false);
  assert.ok(report.issues.some(x=>x.code==='member-count-exceeds-staging-limit'));
  await assert.rejects(stageLegacyMemberships(db,'gm','c',{write:true}),/staging blocked/);
  assert.equal(db.records.size,1);
});
