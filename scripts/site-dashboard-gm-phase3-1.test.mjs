import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gmPartySummary} from '../frontend/src/dashboard/gmDashboardModel.mjs';
import {gmPartyManagementRoster,gmPartyActionsEnabled} from '../frontend/src/dashboard/gmPartyManagementModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const party=gmPartySummary([
 {id:'hero-one',ownerUid:'owner-one',name:'Frost Ranger',className:'Ranger',
  level:9,hp:[24,30],sp:[12,20],mp:[5,15],
  specialDamage:{soul:{value:3}},
  conditions:[{id:'condition-one',name:'Frozen',active:true}],
  restState:{request:{id:'rest-one',status:'pending',soulRecovery:2}}},
 {id:'hero-two',ownerUid:'owner-two',name:'Iron Knight',className:'Paladin',
  level:7,hp:[34,50],sp:[19,20],mp:[3,8]}
]);
test('Phase 3.1: original GM party search works with sanitized React GM summary',()=>{
 const roster=gmPartyManagementRoster(party);
 assert.equal(roster.count,2);
 assert.deepEqual(roster.rows.map(x=>x.name),['Frost Ranger','Iron Knight']);
 assert.equal(roster.rows[0].className,'Ranger');
 assert.equal(roster.rows[0].soulDamage,3);
 assert.equal(roster.rows[0].conditions[0].name,'Frozen');
 assert.equal(roster.rows[0].restRequest.id,'rest-one');
 assert.equal(roster.rows[0].hp[0],24);
 assert.equal(JSON.stringify(roster).includes('owner-one'),false);
 const filtered=gmPartyManagementRoster(party,'paladin');
 assert.equal(filtered.count,2);
 assert.deepEqual(filtered.rows.map(x=>x.id),['hero-two']);
 assert.deepEqual(gmPartyManagementRoster(party,'not found').rows,[]);
});
test('Phase 3.1: GM modifications require an active, editable session',()=>{
 assert.equal(gmPartyActionsEnabled({status:'active',editable:true}),true);
 for(const value of [null,{status:'paused',editable:false},
  {status:'active',editable:false},{status:'ended',editable:true}]){
  assert.equal(gmPartyActionsEnabled(value),false);
 }
});
test('Phase 3.1: GM panel reuses authenticated conditions and long-rest actions',()=>{
 const gm=read('frontend/src/pages/GMDashboardPage.jsx');
 const ui=read('frontend/src/dashboard/GMPartyManagement.jsx');
 const service=read('frontend/src/dashboard/firebaseGMDashboardService.mjs');
 assert.match(gm,/GMPartyManagement/);
 assert.match(gm,/api\.manageCondition\(/);
 assert.match(gm,/api\.reviewRest\(/);
 assert.match(ui,/site-gm-party-management/);
 assert.match(ui,/Find party member/);
 assert.match(ui,/Open Character/);
 assert.match(ui,/Open PC Inventory/);
 assert.match(ui,/Open Combat &amp; Checks/);
 assert.match(ui,/Apply Condition/);
 assert.match(ui,/Approve Long Rest/);
 assert.match(ui,/Deny Long Rest/);
 assert.match(ui,/gmPartyActionsEnabled\(session\)/);
 assert.match(ui,/onCondition\?\.\(/);
 assert.match(ui,/onReviewRest\?\.\(/);
 assert.doesNotMatch(ui,/initializeApp\(|window\.AsteriaFirebase|setDoc\(/);
 assert.match(service,/verifyCampaign\(cid\)/);
 assert.match(service,/manageCharacterCondition/);
 assert.match(service,/reviewCharacterRest/);
});
