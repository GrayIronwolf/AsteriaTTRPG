import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 ASTERIA_MONTHS,ASTERIA_WEEKDAYS,ASTERIA_SEASONS,ASTERIA_ERAS,
 validateCalendarDefinition,validateCalendarDate,formatAsteriaDate,
 calendarWeekday,advanceAsteriaDate,validateCalendarEntry,
 calendarSourceReferences,validateCalendarAction,sortedCalendarEntries
} from '../src/state/asteriaCalendarModel.mjs';
import {createAsteriaCalendarCommands} from '../functions/asteriaCalendarCommands.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const config={
 months:ASTERIA_MONTHS.map((name,index)=>({days:index===0?30:28,
  season:ASTERIA_SEASONS[Math.floor(index/3)]})),
 hoursPerDay:24,minutesPerHour:60,weekdayAnchor:0
};
const start={era:'EOSR',year:11,month:1,day:30,hour:23,minute:59};
const info={title:'Founding celebration',description:'Annual local celebration',kind:'festival',
 visibility:'party',date:{...start},related:null};
function fakeContext(deny=false){
 const store=new Map(),reads=[],writes=[];
 const doc=(base,...parts)=>({path:parts.join('/')});
 const tx={
  get:async ref=>{reads.push(ref.path);const data=store.get(ref.path);
   return {exists:()=>data!==undefined,data:()=>data};},
  set:(ref,value)=>{writes.push(['set',ref.path]);store.set(ref.path,value);},
  update:(ref,value)=>{writes.push(['update',ref.path]);store.set(ref.path,{...store.get(ref.path),...value});},
  delete:ref=>{writes.push(['delete',ref.path]);store.delete(ref.path);}
 };
 const context={db:{},doc,requestId:'op-calendar-test',currentUser:{uid:'gm'},
  serverTimestamp:()=>1000,runTransaction:async(_db,job)=>job(tx)};
 const cmd=createAsteriaCalendarCommands(context,{requireCampaignGM:async()=>{
  if(deny)throw Error('GM only');
 }});
 return {store,reads,writes,run:action=>cmd.manageAsteriaCalendar('campaign-one','gm-scope',action)};
}
test('Asteria canonical labels follow existing Obsidian vault order, not Earth calendar',()=>{
 assert.deepEqual(ASTERIA_WEEKDAYS,[
  'Mystday','Embiday','Wynday','Thunday','Faeday','Lunisday','Solday','Elisday']);
 assert.deepEqual(ASTERIA_MONTHS,[
  'Aork','Barolm','Crexis','Tylonn','Aquol','Sularis','Hamtol','Vofenn','Kirem','Straph','Vlumis','Whystol']);
 assert.deepEqual(ASTERIA_ERAS.map(row=>row.id),['AOP','TBG','ABE','EOLG','EOSR']);
 assert.deepEqual(ASTERIA_SEASONS,['Summer','Autumn','Winter','Spring']);
 assert.equal(config.months.length,12);
});
test('Month lengths, hours and weekday alignment must be explicitly configured',()=>{
 assert.throws(()=>validateCalendarDefinition({...config,months:[]}));
 assert.throws(()=>validateCalendarDefinition({...config,months:config.months.map(x=>({...x,days:0}))}));
 assert.throws(()=>validateCalendarDefinition({...config,weekdayAnchor:8}));
 assert.throws(()=>validateCalendarDefinition({...config,months:config.months.map(x=>({...x,season:'Monsoon'}))}));
 assert.equal(validateCalendarDefinition(config).months[0].days,30);
 assert.throws(()=>validateCalendarDate({...start,day:31},config));
 assert.throws(()=>validateCalendarDate({...start,month:13},config));
 assert.throws(()=>validateCalendarDate({...start,era:'Invalid'},config));
 assert.match(formatAsteriaDate(start,config),/Aork 11 EOSR/);
});
test('Time advancement respects month/year boundaries and the eight-day week',()=>{
 assert.deepEqual(advanceAsteriaDate(start,config,'minute',1),{
  era:'EOSR',year:11,month:2,day:1,hour:0,minute:0
 });
 assert.deepEqual(advanceAsteriaDate({...start,month:12,day:28},config,'day',1),{
  era:'EOSR',year:12,month:1,day:1,hour:23,minute:59
 });
 assert.equal(advanceAsteriaDate(start,config,'week',1).month,2);
 assert.equal(advanceAsteriaDate(start,config,'month',1).day,28);
 assert.equal(calendarWeekday({era:'EOSR',year:1,month:1,day:1,hour:0,minute:0},config),'Mystday');
 assert.equal(calendarWeekday({era:'EOSR',year:1,month:1,day:8,hour:0,minute:0},config),'Elisday');
 assert.throws(()=>advanceAsteriaDate(start,config,'day',0));
 assert.throws(()=>advanceAsteriaDate(start,config,'day',1000));
});
test('Calendar event fields, player visibility and linked references are bounded',()=>{
 const entry=validateCalendarEntry(info,config,'festival-one');
 assert.equal(entry.status,'active');
 assert.equal(entry.visibility,'party');
 assert.equal(entry.revision,1);
 assert.throws(()=>validateCalendarEntry({...info,notes:'private'},config,'festival-one'));
 assert.throws(()=>validateCalendarEntry({...info,visibility:'anonymous'},config,'festival-one'));
 assert.throws(()=>validateCalendarEntry({...info,related:{type:'inventory',id:'secret'}},config,'festival-one'));
 const workspace={quests:[{id:'quest-one',title:'Gather allies'}],
  world:{timeline:[{id:'past',title:'History'}],events:[{id:'event1',title:'Festival'}]},
  economy:{routes:[{id:'route-one',name:'Merchant Road'}]}};
 assert.deepEqual(calendarSourceReferences(workspace).map(row=>row.type),['quest','timeline','event','route']);
 assert.equal(sortedCalendarEntries([entry],config).length,1);
});
test('Trusted command persists GM chronology and player-safe projection only',async()=>{
 const f=fakeContext();
 const made=await f.run({type:'configure',expectedRevision:0,definition:config,date:start});
 assert.equal(made.ok,true,made.error);
 const privateState=f.store.get('campaigns/campaign-one/calendarState/current');
 const playerState=f.store.get('campaigns/campaign-one/calendarPublic/current');
 assert.equal(privateState.revision,1);
 assert.equal(playerState.revision,1);
 assert.equal(playerState.history,undefined);
 assert.equal(playerState.updatedBy,undefined);
 const advanced=await f.run({type:'advance',expectedRevision:1,unit:'minute',amount:1,reason:'travel'});
 assert.equal(advanced.ok,true,advanced.error);
 assert.equal(advanced.date.month,2);
 assert.equal(f.store.get('campaigns/campaign-one/calendarPublic/current').date.day,1);
 assert.equal(f.store.get('campaigns/campaign-one/calendarState/current').history.length,2);
 assert.equal((await f.run({type:'set',expectedRevision:1,date:start})).ok,false);
});
test('Party-visible events are projected without GM notes, references, user IDs or history',async()=>{
 const f=fakeContext();
 await f.run({type:'configure',expectedRevision:0,definition:config,date:start});
 const result=await f.run({type:'saveEntry',expectedRevision:1,
  entryId:'festival-one',expectedEntryRevision:0,entry:info});
 assert.equal(result.ok,true,result.error);
 const privateEntry=f.store.get('campaigns/campaign-one/calendarEntries/festival-one');
 const shared=f.store.get('campaigns/campaign-one/calendarSharedEntries/festival-one');
 assert.equal(privateEntry.visibility,'party');
 assert.equal(shared.title,info.title);
 assert.equal(shared.updatedBy,undefined);
 assert.equal(shared.createdBy,undefined);
 assert.equal(shared.related,undefined);
 const privateChange=await f.run({type:'saveEntry',expectedRevision:2,
  entryId:'festival-one',expectedEntryRevision:1,
  entry:{...info,visibility:'gm'}});
 assert.equal(privateChange.ok,true,privateChange.error);
 assert.equal(f.store.has('campaigns/campaign-one/calendarSharedEntries/festival-one'),false);
 const archive=await f.run({type:'archiveEntry',expectedRevision:3,
  entryId:'festival-one',expectedEntryRevision:2});
 assert.equal(archive.ok,true,archive.error);
 assert.equal(f.store.get('campaigns/campaign-one/calendarEntries/festival-one').status,'archived');
 assert.equal((await f.run({type:'saveEntry',expectedRevision:4,
  entryId:'festival-one',expectedEntryRevision:3,entry:info})).ok,false);
});
test('Only existing campaign records can be linked and reference details are not copied into public events',async()=>{
 const f=fakeContext();
 await f.run({type:'configure',expectedRevision:0,definition:config,date:start});
 const linked={...info,related:{type:'quest',id:'quest-one'}};
 const fail=await f.run({type:'saveEntry',expectedRevision:1,entryId:'one',
  expectedEntryRevision:0,entry:linked});
 assert.equal(fail.ok,false);
 f.store.set('campaigns/campaign-one/systems/gmWorkspace',{
  quests:[{id:'quest-one',title:'Secret objective',gmNotes:'hidden'}]});
 const ok=await f.run({type:'saveEntry',expectedRevision:1,entryId:'one',
  expectedEntryRevision:0,entry:linked});
 assert.equal(ok.ok,true,ok.error);
 const shared=f.store.get('campaigns/campaign-one/calendarSharedEntries/one');
 assert.equal(JSON.stringify(shared).includes('Secret objective'),false);
 assert.equal(shared.related,undefined);
});
test('Authorization, stale revision and invalid payload block all writes',async()=>{
 const denied=fakeContext(true);
 const result=await denied.run({type:'configure',expectedRevision:0,definition:config,date:start});
 assert.match(result.error,/GM only/);
 assert.equal(denied.writes.length,0);
 assert.equal(denied.reads.length,0);
 const f=fakeContext();
 assert.equal((await f.run({type:'configure',expectedRevision:0,definition:config,date:start})).ok,true);
 assert.equal((await f.run({type:'configure',expectedRevision:0,definition:config,date:start})).ok,false);
 assert.throws(()=>validateCalendarAction({type:'advance',expectedRevision:1,creatureHp:1000000}));
});
test('Calendar is integrated in both dashboards, trusted action router and Firestore access',()=>{
 const gm=read('src/dashboards/GMDashboard.jsx'),player=read('src/dashboards/CharacterDashboard.jsx'),
  ui=read('src/dashboards/AsteriaCalendarWorkspace.jsx'),toolkit=read('src/state/gmToolkitModel.mjs'),
  router=read('functions/handler.mjs'),commands=read('functions/commands.mjs'),
  auth=read('js/firebase-auth.js'),rules=read('firestore.rules');
 assert.match(gm,/tab === 'asteria-calendar'/);
 assert.match(player,/PlayerAsteriaCalendar/);
 assert.match(toolkit,/id:'asteria-calendar'/);
 assert.match(ui,/subscribeAsteriaCalendarEntries/);
 assert.match(router,/'manageAsteriaCalendar'/);
 assert.match(commands,/createAsteriaCalendarCommands/);
 assert.match(auth,/manageAsteriaCalendar/);
 for(const key of ['calendarState','calendarPublic','calendarEntries','calendarSharedEntries'])
  assert.match(rules,new RegExp('match /'+key+'/'));
});
