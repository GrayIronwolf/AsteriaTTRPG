import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publishedInformation,ownedActivityProjection,scopedEventProjection,
  playerNotificationHistory,assertNoticeAction} from '../frontend/src/player/playerInformationModel.mjs';
import {playerCharacterProjection} from '../frontend/src/player/playerDashboardModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Phase 2.4: only published news/events are exposed to the Player',()=>{
 const workspace={information:{
  'news-one':{id:'news-one',kind:'news',title:'Town Crier',
    description:'The bridge is open',published:true,scope:'Settlement'},
  'news-draft':{id:'news-draft',kind:'news',title:'Secret Plot',
    description:'GM classified',published:false},
  'events-one':{id:'events-one',kind:'events',title:'Harvest Festival',
    description:'Festival',published:true,status:'Upcoming'},
  'hidden':{id:'hidden',kind:'gm-note',title:'Private GM entry',published:true}
 }};
 const rows=publishedInformation(workspace);
 assert.equal(rows.length,2);
 assert.ok(rows.some(row=>row.title==='Town Crier'));
 assert.ok(rows.some(row=>row.title==='Harvest Festival'));
 assert.equal(JSON.stringify(rows).includes('Secret Plot'),false);
 assert.equal(JSON.stringify(rows).includes('GM classified'),false);
 assert.equal(JSON.stringify(rows).includes('Private GM entry'),false);
});
test('Phase 2.4: event projection ignores other characters, other users and private fields',()=>{
 const events=[
  {id:'event-1',targetOwnerUid:'owner',targetCharacterId:'hero',type:'gm-message',
    payload:{title:'You found a map',message:'Map received',secret:'GM only'},
    createdAt:'2026-11-20T00:00:00.000Z'},
  {id:'event-2',targetOwnerUid:'owner',targetCharacterId:'another-hero',
    payload:{title:'Different character'}},
  {id:'event-3',targetOwnerUid:'other-owner',targetCharacterId:'hero',
    payload:{title:'Other owner'}},
  {id:'event-1',targetOwnerUid:'owner',targetCharacterId:'hero',
    payload:{title:'Duplicate'}}
 ];
 const projected=scopedEventProjection(events,'owner','hero');
 assert.equal(projected.length,1);
 assert.equal(projected[0].id,'event-1');
 assert.equal(JSON.stringify(projected).includes('secret'),false);
 assert.equal(JSON.stringify(projected).includes('Different character'),false);
 assert.equal(JSON.stringify(projected).includes('Other owner'),false);
});
test('Phase 2.4: private action log and read markers do not enter GM projection',()=>{
 const character={id:'hero',ownerUid:'owner',name:'Hero',
  actionLog:[{id:'activity-one',type:'quest',message:'A private reward',
    at:'2026-11-20T00:00:00.000Z'}],
  notificationRead:{'activity:activity-one':true,'unsafe.field':true}};
 const mine=ownedActivityProjection(character,true);
 const other=ownedActivityProjection(character,false);
 assert.equal(mine.activity[0].message,'A private reward');
 assert.equal(mine.read['activity:activity-one'],true);
 assert.deepEqual(other.activity,[]);
 assert.deepEqual(other.read,{});
 const owner=playerCharacterProjection(character,{owned:true});
 const gm=playerCharacterProjection(character,{owned:false});
 assert.equal(owner.noticeActivity[0].message,'A private reward');
 assert.equal(JSON.stringify(gm).includes('A private reward'),false);
});
test('Phase 2.4: event and activity read state follows existing deduplicating notification rules',()=>{
 const character={id:'hero',noticeActivity:[{id:'activity-one',type:'quest-update',
  message:'Quest updated',at:'2026-11-20T00:01:00.000Z'}],
  notificationRead:{'activity:activity-one':true}};
 const events=[{id:'event-one',targetOwnerUid:'owner',
  targetCharacterId:'hero',type:'gm-message',
  payload:{title:'Notice',message:'Message'},createdAt:'2026-11-20T00:02:00.000Z'}];
 const rows=playerNotificationHistory(character,events,'owner');
 assert.equal(rows.length,2);
 assert.equal(rows.find(row=>row.source==='activity').read,true);
 assert.equal(rows.find(row=>row.source==='event').read,false);
 assert.deepEqual(playerNotificationHistory(character,events,'other'),
  []); // Scoped events disappear, but own activity has no owner context unless omitted.
});
test('Phase 2.4: read mutations reject foreign or malformed notification actions',()=>{
 assert.deepEqual(assertNoticeAction('event','event-one',true),
   {source:'event',id:'event-one',read:true});
 assert.throws(()=>assertNoticeAction('event','../other',true),/valid notification/);
 assert.throws(()=>assertNoticeAction('campaign','event-one',true),/valid notification/);
 assert.throws(()=>assertNoticeAction('event','event-one','true'),/valid notification/);
});
test('Phase 2.4: React and Firebase only access player-safe party-workspace and owner event scope',()=>{
 const service=read('frontend/src/player/firebasePlayerDashboardService.mjs');
 const page=read('frontend/src/pages/PlayerDashboardPage.jsx');
 const ui=read('frontend/src/player/PlayerInformationWorkspace.jsx');
 assert.match(service,/systems','party-workspace/);
 assert.match(service,/where\('targetOwnerUid','==',uid\)/);
 assert.match(service,/orderBy\('createdAt','desc'\)/);
 assert.match(service,/async function fetchInformationHistory/);
 assert.match(service,/async function markInformationRead/);
 assert.match(service,/action:'markNotificationRead'/);
 assert.match(service,/linkedCharacterAccess/);
 assert.doesNotMatch(ui,/gmWorkspace|initializeApp\(|window\.AsteriaFirebase/);
 assert.match(ui,/site-player-information/);
 assert.match(ui,/Load older notifications/);
 assert.match(ui,/Mark \{row\.read\?'unread':'read'\}/);
 assert.match(page,/PlayerInformationWorkspace/);
});
