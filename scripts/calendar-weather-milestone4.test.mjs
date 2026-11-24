import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCalendarAction} from '../src/state/asteriaCalendarModel.mjs';
import {
 CALENDAR_GAMEPLAY_ACTIVITIES,validateGameplayTimeActivity,previewGameplayTimeActivity,
 publishedWeatherForDate,playerWorldContext
} from '../src/state/calendarGameplayModel.mjs';
import {createAsteriaCalendarCommands} from '../functions/asteriaCalendarCommands.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const definition={
 months:[{name:'First',days:30,season:'Summer'},{name:'Second',days:30,season:'Winter'}],
 weekdays:['Mystday','Emberday'],seasons:['Summer','Winter'],
 eras:[{id:'NOW',name:'Now'}],leapDays:[],moons:[{name:'Astra',period:28,offset:0}],cycles:[],
 hoursPerDay:24,minutesPerHour:60,weekdayAnchor:0,weekdayOverflow:true
};
const date=(day=29,hour=22,minute=0)=>({era:'NOW',year:1,month:1,day,hour,minute});
const calendar={definition,date:date(),revision:1,clockMode:'manual'};
const action=(kind,durationMinutes,label='')=>({kind,durationMinutes,label});

test('gameplay time presets preserve Asteria rest durations without effects',()=>{
 assert.equal(CALENDAR_GAMEPLAY_ACTIVITIES.length,6);
 for(const [kind,minutes] of [['light-rest',120],['short-rest',240],['long-rest',480]]){
  assert.equal(validateGameplayTimeActivity(action(kind,minutes)).durationMinutes,minutes);
  assert.throws(()=>validateGameplayTimeActivity(action(kind,minutes+1)));
 }
 for(const invalid of [
  action('unknown',20),action('travel',0),action('travel',10081),
  action('encounter',1441),action('downtime',1.1),
  {...action('travel',60),restoreHP:100}
 ])assert.throws(()=>validateGameplayTimeActivity(invalid));
});
test('activity preview uses the single campaign clock and crosses date boundaries',()=>{
 const preview=previewGameplayTimeActivity(calendar,action('short-rest',240),10);
 assert.deepEqual(preview.from,date());
 assert.deepEqual(preview.to,{...date(30,2),minute:0});
 assert.equal(calendar.date.day,29);
 const second=previewGameplayTimeActivity({...calendar,date:date(30,23,0)},
  action('travel',180),10);
 assert.equal(second.to.month,2);
 assert.equal(second.to.day,1);
 assert.equal(second.to.hour,2);
});
test('only a published matching-date weather report may appear in world context',()=>{
 const published={id:'public',status:'published',zoneName:'Road',region:'Altarin',
  forecast:[{date:date(),condition:'fog',severity:'mild',
   metrics:{temperatureC:3,windKmh:5}}]};
 const draft={id:'private',status:'draft',zoneName:'Secret',forecast:published.forecast};
 assert.equal(publishedWeatherForDate([draft,published],date(),'Altarin')?.report.id,'public');
 assert.equal(publishedWeatherForDate([draft],date()),null);
 assert.equal(publishedWeatherForDate([published],date(28)),null);
 assert.equal(publishedWeatherForDate([published],date(),'Raemar'),null);
 const visible={id:'publicEvent',title:'Festival',kind:'festival',visibility:'party',date:date()};
 const hidden={...visible,id:'secretEvent',title:'GM-only secret',visibility:'gm'};
 const world=playerWorldContext(calendar,[visible,hidden],[published,draft],10,'Altarin');
 assert.deepEqual(world.events.map(e=>e.id),['publicEvent']);
 assert.equal(world.moons[0].name,'Astra');
 assert.equal(world.weather.report.id,'public');
});
function harness(denied=false){
 const store=new Map(),reads=[],writes=[];
 const doc=(_db,...parts)=>({path:parts.join('/')});
 const tx={
  get:async ref=>{reads.push(ref.path);const data=store.get(ref.path);return {
   exists:()=>data!==undefined,data:()=>data};},
  set:(ref,value)=>{writes.push(ref.path);store.set(ref.path,value);},
  update:(ref,value)=>{writes.push(ref.path);store.set(ref.path,{...store.get(ref.path),...value});},
  delete:ref=>{writes.push(ref.path);store.delete(ref.path);}
 };
 store.set('campaigns/camp/calendarState/current',{...calendar,entryCount:0,history:[]});
 const commands=createAsteriaCalendarCommands({
  db:{},doc,runTransaction:async(_db,run)=>run(tx),
  requestId:'gameplay-time-test',serverTimestamp:()=>123,
  currentUser:{uid:'gm'}
 },{requireCampaignGM:async()=>{if(denied)throw Error('GM only');}});
 const run=action=>commands.manageAsteriaCalendar('camp','gm-scope',action);
 return {store,reads,writes,run};
}
test('GM-only gameplay approval writes only existing calendar projections and revisioned history',async()=>{
 const h=harness();
 const correct={type:'advanceActivity',expectedRevision:1,
  activity:action('long-rest',480,'Overnight stay'),reason:'GM approved'};
 assert.equal(validateCalendarAction(correct).type,'advanceActivity');
 const advanced=await h.run(correct);
 assert.equal(advanced.ok,true,advanced.error);
 assert.equal(advanced.revision,2);
 assert.equal(advanced.date.month,1);
 assert.equal(advanced.date.day,30);
 const privateState=h.store.get('campaigns/camp/calendarState/current');
 const publicState=h.store.get('campaigns/camp/calendarPublic/current');
 assert.equal(privateState.history[0].activity.kind,'long-rest');
 assert.equal(publicState.history,undefined);
 assert.equal(publicState.date.month,2);
 assert.equal(h.writes.some(path=>/characters|combat|quests|inventory|partyLoot|weather/.test(path)),false);
 const replay=await h.run(correct);
 assert.equal(replay.ok,false);
 const undone=await h.run({type:'undoTime',expectedRevision:2,reason:'Retcon'});
 assert.equal(undone.ok,true,undone.error);
 assert.deepEqual(undone.date,date());
});
test('forged activities and unauthorized requests are rejected before mutation',async()=>{
 const h=harness();
 assert.equal((await h.run({type:'advanceActivity',expectedRevision:1,
  activity:{...action('short-rest',240),resources:{hp:100}}})).ok,false);
 assert.equal(h.writes.length,0);
 const denied=harness(true);
 const attempt=await denied.run({type:'advanceActivity',expectedRevision:1,
  activity:action('short-rest',240)});
 assert.equal(attempt.ok,false);
 assert.equal(denied.reads.length,0);
 assert.equal(denied.writes.length,0);
});
test('both canvas allowlists expose optional reusable world context, not duplicate layouts',()=>{
 const registry=read('src/state/dashboardLayoutModel.mjs');
 const player=read('src/dashboards/PlayerDashboardOverview.jsx');
 const gm=read('src/dashboards/GMDashboard.jsx');
 const panel=read('src/dashboards/CalendarWeatherQuickPanel.jsx');
 assert.match(registry,/id:'worldContext'/);
 assert.match(registry,/worldContext:'Calendar & Weather'/);
 assert.match(player,/case 'worldContext':return campaignId/);
 assert.match(gm,/case 'worldContext':return <CalendarWeatherQuickPanel/);
 assert.match(panel,/subscribeAsteriaCalendar\(campaignId,setCalendar,gm\?'gm':'player'\)/);
 assert.match(panel,/subscribeWeatherReports\(campaignId,setReports,gm\?'gm':'player'\)/);
 assert.match(panel,/playerWorldContext/);
 assert.match(panel,/onNavigate\?\.\('world-atlas'\)/);
});
test('world atlas and second-screen display use only published calendar and weather context',()=>{
 const atlas=read('src/dashboards/WorldAtlasWorkspace.jsx');
 const view=read('src/dashboards/presentation/CampaignPresentationWorkspace.jsx');
 const overlay=read('src/dashboards/presentation/CalendarWeatherSceneOverlay.jsx');
 const restricted=read('src/dashboards/presentation/HybridSessionManager.jsx');
 assert.match(atlas,/publishedWeatherForDate\(weather,current,region\)/);
 assert.match(view,/display.scene==='world-map'/);
 assert.match(view,/<CalendarWeatherSceneOverlay campaignId=\{campaignId\}\/>/);
 assert.match(overlay,/subscribeAsteriaCalendar\(campaignId,setCalendar,'player'\)/);
 assert.match(overlay,/subscribeWeatherReports\(campaignId,setReports,'player'\)/);
 assert.doesNotMatch(restricted,/CalendarWeatherSceneOverlay/);
 assert.match(read('firestore.rules'),/match \/weatherSharedReports\/\{reportId\}/);
 assert.match(read('firestore.rules'),/match \/calendarPublic\/\{calendarId\}/);
});
