import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  openDashboardQuests,encounterRosterCount,acknowledgeGameplayNotice
} from '../src/state/gameplayIntegrationView.mjs';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Player and GM quest summaries use the same open statuses and tracked-first ordering',()=>{
 const rows=[
   {id:'done',status:'Completed',tracked:true},
   {id:'offer',status:'Pending'},
   {id:'working',status:'Active',tracked:true},
   {id:'paused',status:'On Hold'},
   {id:'accepted',status:'Accepted'},
   {id:'review',status:'Awaiting Review'},
   {id:'archived',status:'Archived'},
   {id:'failed',status:'Failed'},
   {id:'expired',status:'Expired'},
   {id:'declined',status:'Declined'}
 ];
 assert.deepEqual(openDashboardQuests(rows).map(row=>row.id),
  ['working','offer','paused','accepted','review']);
 assert.equal(rows[0].id,'done','Never mutate source quest order');
 assert.deepEqual(openDashboardQuests(null),[]);
 const player=source('src/dashboards/PlayerDashboardOverview.jsx');
 const focus=source('src/dashboards/DashboardFocusPanels.jsx');
 assert.match(player,/openDashboardQuests\(selectQuests\(character, partyWorkspace\)\)/);
 assert.match(focus,/openDashboardQuests\(playerQuestRows\(character,workspace\)\)/);
 assert.match(focus,/const quests=arr\(workspace\.quests\),active=openDashboardQuests\(quests\)/);
});

test('Quest focus panels and Quest Log select personal progress over generic party template',()=>{
 const questModel=source('src/dashboards/characterWorkspaceData.js');
 const focus=source('src/dashboards/DashboardFocusPanels.jsx');
 assert.match(questModel,/const rows=\[\.\.\.list\(partyWorkspace\.questLog\),\.\.\.list\(character\.quests \|\| character\.questLog\)\]/);
 assert.match(questModel,/map\.set\(id,/);
 assert.match(focus,/const questRows=\(character,workspace\)=>openDashboardQuests\(playerQuestRows\(character,workspace\)\)/);
 assert.doesNotMatch(focus,/const rows=\[\.\.\.arr\(workspace\?\.questLog\)/);
});

test('Inventory overview uses the same normalization path as full Inventory workspace',()=>{
 const focus=source('src/dashboards/DashboardFocusPanels.jsx');
 const inventory=source('src/dashboards/InventoryWorkspace.jsx');
 assert.match(focus,/const itemRows=character=>inventoryItems\(character\)/);
 assert.match(inventory,/import \{ inventoryItems \} from '\.\/characterWorkspaceData\.js'/);
 assert.doesNotMatch(focus,/character\?\.storages\)\.flatMap/);
 assert.match(focus,/const itemQuantity=item=>Math\.max\(0,number\(item\?\.qty\?\?item\?\.quantity\?\?1\)\)/);
});

test('GM combat roster count handles split encounter state without double counting',()=>{
 assert.equal(encounterRosterCount({combat:{status:'active'},combatants:[{id:'a'},{id:'b'}],enemies:[{id:'b'},{id:'c'}]}),3);
 assert.equal(encounterRosterCount({combat:{combatants:[{id:'a'},{id:'b'}],enemies:[{id:'b'}]}}),2);
 assert.equal(encounterRosterCount({combatants:[{characterId:'character-1'},{id:'enemy-1'}]}),2);
 assert.equal(encounterRosterCount({combatants:[{},{}]}),2);
 assert.equal(encounterRosterCount(null),0);
 const focus=source('src/dashboards/DashboardFocusPanels.jsx');
 assert.match(focus,/const combatants=encounterRosterCount\(encounter\)/);
});

test('Failed XP and quest acknowledgement stays pending and can be retried',async()=>{
 const event={id:'reward-123',type:'xp-reward'};
 let count=0;
 await assert.rejects(()=>acknowledgeGameplayNotice(event,async()=>{
   count++;return {ok:false,error:'Offline'};}),/Offline/);
 assert.equal(count,1);
 await assert.rejects(()=>acknowledgeGameplayNotice(event,async()=>{throw new Error('Permission denied');}),/Permission denied/);
 const response=await acknowledgeGameplayNotice(event,async id=>{
   count++;assert.equal(id,'reward-123');return {ok:true,applied:true};
 });
 assert.equal(count,2);
 assert.equal(response.ok,true);
 await assert.rejects(()=>acknowledgeGameplayNotice({id:''},async()=>({ok:true})),/identified/);
 const dashboard=source('src/dashboards/CharacterDashboard.jsx');
 assert.match(dashboard,/await acknowledgeGameplayNotice\(event,id=>/);
 assert.match(dashboard,/setAcknowledged\(previous=>new Set\(\[\.\.\.previous,event\.id\]\)\)/);
 assert.match(dashboard,/catch\(error\)\{\s*setNoticeError/);
 assert.match(dashboard,/noticeError\?<p className="react-action-message" role="alert"/);
 assert.doesNotMatch(dashboard,/setAcknowledged\(previous => new Set\(\[\.\.\.previous, xpEvent\.id\]\)\)/);
 const noticeHandler=dashboard.slice(dashboard.indexOf('const acknowledgeNotice='),dashboard.indexOf('const resolvedLoot ='));
 assert.doesNotMatch(noticeHandler,/\.catch\(\(\) => \{\}\)/);
});

test('Core gameplay commands remain existing Firebase transactions, not new client writes',()=>{
 const focus=source('src/dashboards/DashboardFocusPanels.jsx');
 for(const forbidden of ['runTransaction','setDoc','updateDoc','firebaseService','saveQuest','grantXP','castSpell'])
   assert.equal(focus.includes(forbidden),false,forbidden);
 const player=source('src/dashboards/CharacterWorkspaceTabs.jsx');
 const gm=source('src/dashboards/GMDashboard.jsx');
 assert.match(player,/firebaseService\.castSpell/);
 assert.match(player,/firebaseService\.updateQuestProgress/);
 assert.match(gm,/firebaseService\.grantXP/);
 assert.match(gm,/firebaseService\.saveEncounter/);
});
