import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publishedInformation} from '../frontend/src/player/playerInformationModel.mjs';
import {
 gmNotesProjection,savePrivateGMNotes,appendGMSessionLog,deleteGMSessionLog,
 blankGMInformation,saveGMInformation,validateGMAnnouncement
} from '../frontend/src/dashboard/gmStoryManagementModel.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const campaign={id:'campaign-one',name:'Glacial Expedition',location:'Vaelgard'};
test('Phase 3.3: private notes preserve session logs and detect stale editors',()=>{
 const old={privateNotes:'Original',sessionLogs:[{id:'session-log-one',title:'Earlier',body:'Recap'}]};
 const next=savePrivateGMNotes(old,'Revised','Original');
 assert.equal(next.privateNotes,'Revised');
 assert.equal(next.sessionLogs.length,1);
 assert.throws(()=>savePrivateGMNotes(old,'Overwrite','Wrong'),/changed/);
 assert.throws(()=>savePrivateGMNotes(old,'x'.repeat(20001),'Original'),/20,000/);
 assert.equal(gmNotesProjection({notes:next}).sessionLogs[0].title,'Earlier');
});
test('Phase 3.3: create and delete session logs with revision safety',()=>{
 const saved=appendGMSessionLog({privateNotes:'secret'},{
   title:'Evening session',body:'The gate opened',sessionId:'session-1',
   sessionStatus:'active'
 },{id:'session-log-test',at:'2026-11-20T00:00:00.000Z'});
 assert.equal(saved.privateNotes,'secret');
 assert.equal(saved.sessionLogs.length,1);
 assert.equal(saved.sessionLogs[0].sessionId,'session-1');
 assert.throws(()=>deleteGMSessionLog(saved,'session-log-test','wrong'),/changed/);
 assert.equal(deleteGMSessionLog(saved,'session-log-test',
   '2026-11-20T00:00:00.000Z').sessionLogs.length,0);
 assert.throws(()=>appendGMSessionLog(saved,{title:'',body:'message'},
   {id:'session-log-two'}),/title/);
});
test('Phase 3.3: information publishes only allowlisted fields to existing player mirror',()=>{
 const draft=blankGMInformation('news',campaign,'info-one');
 const first=saveGMInformation({kind:'news',input:{...draft,id:'info-one',
   title:'Snowstorm',description:'Storm approaches',published:false,
   gmNotes:'Secret'},campaign,world:{regions:[{id:'region-one'}]},
   sharedInformation:{'events-another':{id:'another',published:true}},uid:'gm',
   at:'2026-11-20T00:00:00.000Z'});
 assert.equal(first.world.news.length,1);
 assert.equal(first.world.regions.length,1);
 assert.equal(Object.keys(first.information).length,1);
 const second=saveGMInformation({kind:'news',input:{...first.saved,published:true},
   campaign,world:first.world,sharedInformation:first.information,uid:'gm',
   at:'2026-11-20T00:01:00.000Z'});
 assert.equal(second.saved.revision,2);
 assert.equal(second.information['news-info-one'].title,'Snowstorm');
 assert.equal(JSON.stringify(second.information).includes('Secret'),false);
 const player=publishedInformation({information:second.information});
 assert.equal(player.find(item=>item.id==='info-one').title,'Snowstorm');
 assert.throws(()=>saveGMInformation({kind:'news',input:{...first.saved,published:true},
   campaign,world:second.world,sharedInformation:second.information}),/changed/);
 const withdrawn=saveGMInformation({kind:'news',input:{...second.saved,published:false},
   campaign,world:second.world,sharedInformation:second.information});
 assert.equal(withdrawn.information['news-info-one'],undefined);
});
test('Phase 3.3: new events retain status and original player-readable path',()=>{
 const event=blankGMInformation('events',campaign,'info-festival');
 const result=saveGMInformation({kind:'events',input:{...event,
   id:'info-festival',title:'Winter Festival',status:'Ongoing',published:true},
   campaign,world:{events:[]},sharedInformation:{}});
 assert.equal(result.world.events[0].status,'Ongoing');
 assert.equal(result.information['events-info-festival'].kind,'events');
 assert.equal(publishedInformation({information:result.information}).length,1);
});
test('Phase 3.3: announcements require bounded, linked recipient IDs',()=>{
 assert.deepEqual(validateGMAnnouncement({title:'Warning',message:'Take cover',
   recipients:['hero-one']}),{title:'Warning',message:'Take cover',recipients:['hero-one']});
 assert.throws(()=>validateGMAnnouncement({title:'Warning',message:'Message',
   recipients:['hero-one','hero-one']}),/non-duplicate/);
 assert.throws(()=>validateGMAnnouncement({title:'Warning',message:'Message',
   recipients:['../other']}),/valid/);
 assert.throws(()=>validateGMAnnouncement({title:'Warning',message:'',
   recipients:['hero-one']}),/title/);
});
test('Phase 3.3: React GM tabs reconnect notes, news and alerts through existing secured services',()=>{
 const page=read('frontend/src/pages/GMDashboardPage.jsx');
 const backend=read('frontend/src/dashboard/firebaseGMDashboardService.mjs');
 const notes=read('frontend/src/dashboard/GMNotesManagement.jsx');
 const information=read('frontend/src/dashboard/GMInformationManagement.jsx');
 const rules=read('firestore.rules');
 const player=read('frontend/src/player/firebasePlayerDashboardService.mjs');
 assert.match(page,/<GMNotesManagement/);
 assert.match(page,/<GMInformationManagement/);
 assert.match(page,/watchManagement/);
 assert.match(notes,/Save Notes/);
 assert.match(notes,/Add Log Entry/);
 assert.match(notes,/Export Notes &amp; Logs/);
 assert.match(information,/Save & Publish/);
 assert.match(information,/Send Notification/);
 assert.match(information,/api\.sendGMNotification/);
 assert.match(backend,/saveGMNotes,addGMSessionLog,removeGMSessionLog/);
 assert.match(backend,/saveGMInformation,sendGMNotification/);
 assert.match(backend,/action:'sendCharacterNotification'/);
 assert.match(backend,/applyGMInformationChange/);
 assert.match(backend,/firestoreSdk\.runTransaction/);
 assert.match(rules,/systemId == 'itemEcosystem' \|\| systemId == 'gmWorkspace'/);
 assert.match(player,/systems','party-workspace/);
 assert.doesNotMatch(page,/window\.AsteriaFirebase/);
 assert.doesNotMatch(information,/setDoc\(|initializeApp\(/);
});
