import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 ASTERIA_MONTHS,ASTERIA_WEEKDAYS,ASTERIA_SEASONS,ASTERIA_ERAS,
 validateCalendarDefinition,validateCalendarEntry,calendarEventOccursOnDate,
 calendarOccurrencesOnDate,calendarMoonPhases,calendarCelestialEventsOnDate,
 effectiveCalendarDate,validateCalendarAction,validateCalendarCategories,
 DEFAULT_CALENDAR_CATEGORIES
} from '../src/state/asteriaCalendarModel.mjs';
import {createAsteriaCalendarCommands} from '../functions/asteriaCalendarCommands.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const config=validateCalendarDefinition({
 months:[{name:'First',days:30,season:'Summer'},{name:'Second',days:29,season:'Winter'}],
 weekdays:['Firstday','Secondday','Thirdday'],seasons:['Summer','Winter'],
 eras:[{id:'NEW',name:'New Age'}],leapDays:[],
 moons:[{name:'Bright',period:28,offset:0},{name:'Dark',period:12,offset:0}],
 cycles:[{name:'Rite',period:7,offset:0}],hoursPerDay:24,minutesPerHour:60,
 weekdayAnchor:0,weekdayOverflow:true
});
const at=(year,month,day,hour=0,minute=0)=>({era:'NEW',year,month,day,hour,minute});
const entry={title:'Annual festival',description:'Celebration',kind:'festival',categoryId:'festival',
 recurrence:{unit:'year',interval:1,untilYear:12},visibility:'party',
 date:at(1,1,10),related:null};
function fakeContext(deny=false){
 const store=new Map(),writes=[],reads=[];
 const doc=(_db,...parts)=>({path:parts.join('/')});
 const tx={
  get:async ref=>{reads.push(ref.path);const data=store.get(ref.path);return {exists:()=>data!==undefined,data:()=>data};},
  set:(ref,value)=>{writes.push(['set',ref.path]);store.set(ref.path,value);},
  update:(ref,value)=>{writes.push(['update',ref.path]);store.set(ref.path,{...store.get(ref.path),...value});},
  delete:ref=>{writes.push(['delete',ref.path]);store.delete(ref.path);}
 };
 const context={db:{},doc,requestId:'milestone2-test',currentUser:{uid:'gm'},
  serverTimestamp:()=>1000,runTransaction:async(_db,cb)=>cb(tx)};
 const runner=createAsteriaCalendarCommands(context,{requireCampaignGM:async()=>{
  if(deny)throw Error('GM only');
 }});
 return {store,writes,reads,run:action=>runner.manageAsteriaCalendar('campaign-one','gm-scope',action)};
}
test('recurring event occurrences are bounded by dates and years',()=>{
 const e=validateCalendarEntry(entry,config,'festival');
 assert.equal(calendarEventOccursOnDate(e,at(1,1,10),config),true);
 assert.equal(calendarEventOccursOnDate(e,at(2,1,10),config),true);
 assert.equal(calendarEventOccursOnDate(e,at(13,1,10),config),false);
 assert.equal(calendarEventOccursOnDate(e,at(1,1,9),config),false);
 assert.equal(calendarOccurrencesOnDate([e],at(2,1,10),config).length,1);
 const monthly=validateCalendarEntry({...entry,recurrence:{unit:'month',interval:1}},config,'monthly');
 assert.equal(calendarEventOccursOnDate(monthly,at(1,2,10),config),true);
 assert.equal(calendarEventOccursOnDate(monthly,at(1,2,9),config),false);
});
test('moon phases and celestial events are deterministic',()=>{
 assert.equal(calendarMoonPhases(at(1,1,1),config)[0].phase,'New Moon');
 assert.equal(calendarMoonPhases(at(1,1,15),config)[0].phase,'Full Moon');
 assert.ok(calendarCelestialEventsOnDate(at(1,1,1),config).some(e=>e.title.includes('Bright')));
 assert.ok(calendarCelestialEventsOnDate(at(1,1,1),config).some(e=>e.title.includes('Rite')));
});
test('clock derives elapsed game time without mutating campaign objects',()=>{
 const base=at(1,1,1,8,0);
 const state={definition:config,date:base,clockMode:'realtime',clockRate:10,clockAnchorMs:1000000};
 assert.deepEqual(effectiveCalendarDate(state,1000000+120000),at(1,1,1,8,20));
 assert.deepEqual(state.date,base);
 assert.deepEqual(effectiveCalendarDate({...state,clockMode:'manual'},1000000+120000),base);
});
test('calendar categories and clock actions reject unexpected input',()=>{
 assert.deepEqual(validateCalendarCategories(DEFAULT_CALENDAR_CATEGORIES).length,7);
 assert.throws(()=>validateCalendarCategories([{id:'no',name:'Invalid',color:'red'}]));
 assert.throws(()=>validateCalendarAction({type:'setClock',expectedRevision:1,clockMode:'realtime',clockRate:999}));
 assert.equal(validateCalendarAction({type:'undoTime',expectedRevision:1}).type,'undoTime');
 assert.throws(()=>validateCalendarEntry({...entry,categoryId:'secret'},config,'festival'));
});
test('trusted GM writes to private/public clock, supports revisions and undo',async()=>{
 const f=fakeContext();
 const first=await f.run({type:'configure',expectedRevision:0,definition:config,date:at(1,1,1,8)});
 assert.equal(first.ok,true,first.error);
 const mode=await f.run({type:'setClock',expectedRevision:1,clockMode:'realtime',clockRate:10});
 assert.equal(mode.ok,true,mode.error);
 const publicClock=f.store.get('campaigns/campaign-one/calendarPublic/current');
 assert.equal(publicClock.clockMode,'realtime');
 assert.equal(publicClock.clockRate,10);
 assert.equal(publicClock.history,undefined);
 assert.equal(publicClock.updatedBy,undefined);
 const moved=await f.run({type:'advance',expectedRevision:2,unit:'day',amount:1});
 assert.equal(moved.ok,true,moved.error);
 assert.equal(moved.date.day,2);
 const rollback=await f.run({type:'undoTime',expectedRevision:3});
 assert.equal(rollback.ok,true,rollback.error);
 assert.equal(rollback.date.day,1);
 const stale=await f.run({type:'undoTime',expectedRevision:3});
 assert.equal(stale.ok,false);
});
test('recurrences and category IDs are player-safe projections',async()=>{
 const f=fakeContext();
 await f.run({type:'configure',expectedRevision:0,definition:config,date:at(1,1,1)});
 const e=await f.run({type:'saveEntry',expectedRevision:1,
  entryId:'festival',expectedEntryRevision:0,entry});
 assert.equal(e.ok,true,e.error);
 const publicEvent=f.store.get('campaigns/campaign-one/calendarSharedEntries/festival');
 assert.equal(publicEvent.recurrence.unit,'year');
 assert.equal(publicEvent.categoryId,'festival');
 assert.equal(publicEvent.related,undefined);
 assert.equal(publicEvent.createdBy,undefined);
 const categories=await f.run({type:'setCategories',expectedRevision:2,categories:DEFAULT_CALENDAR_CATEGORIES});
 assert.equal(categories.ok,true,categories.error);
 const exposed=f.store.get('campaigns/campaign-one/calendarPublic/current');
 assert.equal(exposed.categories.length,DEFAULT_CALENDAR_CATEGORIES.length);
});
test('authorization rejects clock mutations before any read/write',async()=>{
 const f=fakeContext(true);
 const response=await f.run({type:'setClock',expectedRevision:0,clockMode:'manual',clockRate:1});
 assert.equal(response.ok,false);assert.equal(f.writes.length,0);assert.equal(f.reads.length,0);
});
test('GM and player calendars reuse existing subscriptions and server API',()=>{
 const ui=read('src/dashboards/AsteriaCalendarWorkspace.jsx');
 const server=read('functions/asteriaCalendarCommands.mjs');
 const security=read('firestore.rules');
 for(const label of ['setClock','undoTime','setCategories','calendarMoonPhases','calendarOccurrencesOnDate'])
  assert.ok(ui.includes(label)||server.includes(label),label);
 assert.match(ui,/subscribeAsteriaCalendarEntries\(campaignId,setEntries,'player'\)/);
 assert.match(ui,/subscribeAsteriaCalendar\(campaignId,setCalendar,'gm'\)/);
 assert.match(security,/match \/calendarState\/\{calendarId\}/);
 assert.match(security,/match \/calendarSharedEntries\/\{entryId\}/);
});
