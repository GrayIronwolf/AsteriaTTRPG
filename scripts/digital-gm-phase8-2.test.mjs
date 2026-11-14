import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 WEATHER_BIOMES,WEATHER_CONDITIONS,WEATHER_SEVERITIES,WEATHER_VOLATILITY,
 validateWeatherZone,validateWeatherAction,weatherWeights,generateWeatherForecast,
 buildWeatherDay,publicWeatherReport,orderWeatherReports
} from '../src/state/weatherEnvironmentModel.mjs';
import {createWeatherEnvironmentCommands} from '../functions/weatherEnvironmentCommands.mjs';
import {ASTERIA_MONTHS} from '../src/state/asteriaCalendarModel.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const calendar={revision:5,
 definition:{months:ASTERIA_MONTHS.map((_,index)=>({days:index===0?30:28,
  season:index<3?'Summer':index<6?'Autumn':index<9?'Winter':'Spring'})),
  hoursPerDay:24,minutesPerHour:60,weekdayAnchor:0},
 date:{era:'EOSR',year:12,month:1,day:30,hour:8,minute:0}};
const zone={name:'Vaelgard northern road',region:'Altarin',biome:'tundra',
 volatility:'volatile',magicWeather:false,gmNotes:'Unpublished GM hazard plan'};
const exists=s=>s!==undefined;
function harness(denied=false){
 const store=new Map(),reads=[],writes=[];
 const doc=(_db,...parts)=>({path:parts.join('/')});
 const tx={
  get:async ref=>{reads.push(ref.path);const data=store.get(ref.path);return {exists:()=>exists(data),data:()=>data};},
  set:(ref,value,options)=>{writes.push(['set',ref.path]);store.set(ref.path,options?.merge?{...store.get(ref.path),...value}:value);},
  update:(ref,value)=>{writes.push(['update',ref.path]);store.set(ref.path,{...store.get(ref.path),...value});},
  delete:ref=>{writes.push(['delete',ref.path]);store.delete(ref.path);}
 };
 const context={db:{},doc,currentUser:{uid:'gm'},requestId:'test-weather-op',
  serverTimestamp:()=>1234,runTransaction:async(_db,job)=>job(tx)};
 const command=createWeatherEnvironmentCommands(context,{
  requireCampaignGM:async()=>{if(denied)throw Error('GM only');}
 });
 const run=action=>command.manageWeatherEnvironment('campaign-one','gm-scope',action);
 store.set('campaigns/campaign-one/calendarState/current',calendar);
 return {run,store,writes,reads};
}
test('Biome, weather conditions and severity are bounded non-canonical presets',()=>{
 assert.ok(WEATHER_BIOMES.includes('tundra'));
 assert.ok(WEATHER_CONDITIONS.includes('blizzard'));
 assert.deepEqual(WEATHER_SEVERITIES,['mild','moderate','severe','extreme']);
 assert.ok(WEATHER_VOLATILITY.includes('volatile'));
 assert.equal(weatherWeights(zone,'Winter')['arcane-surge'],0);
 assert.ok(weatherWeights(zone,'Winter').snow>weatherWeights({...zone,biome:'desert'},'Summer').snow);
 assert.ok(weatherWeights({...zone,magicWeather:true},'Winter')['arcane-surge']>0);
});
test('Weather zone input validates allowed schema and private notes',()=>{
 assert.equal(validateWeatherZone(zone,'north').revision,1);
 assert.equal(validateWeatherZone(zone,'north',{revision:2}).revision,3);
 for(const bad of [{...zone,biome:'Mars'}, {...zone,evil:true},
  {...zone,magicWeather:'yes'},{...zone,volatility:'stormiest'}])
  assert.throws(()=>validateWeatherZone(bad,'north'));
 assert.throws(()=>validateWeatherZone(zone,'../other'));
 assert.throws(()=>validateWeatherZone(zone,'north',{status:'archived'}));
});
test('Calendar-aware generation uses server random draws and rolls into Asteria months',()=>{
 const forecast=generateWeatherForecast(zone,calendar,3,(_min,_max)=>0);
 assert.equal(forecast.length,3);
 assert.equal(forecast[0].date.month,1);
 assert.equal(forecast[0].date.day,30);
 assert.equal(forecast[1].date.month,2);
 assert.equal(forecast[1].date.day,1);
 assert.ok(forecast.every(day=>day.guidance.includes('GM')));
 assert.ok(forecast.every(day=>day.condition!=='arcane-surge'));
 assert.throws(()=>generateWeatherForecast(zone,calendar,0,()=>0));
 assert.throws(()=>generateWeatherForecast(zone,calendar,8,()=>0));
 assert.throws(()=>generateWeatherForecast(zone,calendar,1,()=>-1));
 assert.throws(()=>generateWeatherForecast(zone,calendar,1,(_min,max)=>max));
 assert.throws(()=>generateWeatherForecast(zone,{},1,()=>0));
});
test('Advisories do not contain invented combat modifiers or automatic penalties',()=>{
 const extreme=buildWeatherDay(calendar.date,'Winter','blizzard','extreme',0);
 assert.equal(extreme.visibility,'Very poor');
 assert.ok(extreme.hazards.includes('Extreme cold'));
 assert.equal(extreme.damage,undefined);
 assert.equal(extreme.skillModifier,undefined);
 assert.equal(extreme.movementModifier,undefined);
 assert.equal(extreme.travel,'Potentially hazardous');
});
test('Strict commands require allowed fields and optimistic revisions',()=>{
 for(const bad of [
  {type:'generate',zoneId:'north',expectedZoneRevision:1,days:10},
  {type:'generate',zoneId:'north',expectedZoneRevision:1,days:1,statBonus:20},
  {type:'override',reportId:'a',expectedRevision:1,dayIndex:0,condition:'meteor',severity:'severe'},
  {type:'publish',reportId:'a',expectedRevision:-1},
  {type:'unpublish',reportId:'a',expectedRevision:1,playerId:'alice'}
 ])assert.throws(()=>validateWeatherAction(bad));
 assert.equal(validateWeatherAction({type:'publish',reportId:'a',expectedRevision:1}),'publish');
});
test('GM actions save zones and generate private forecasts with server calendar',async()=>{
 const h=harness();
 const save=await h.run({type:'saveZone',zoneId:'north',expectedRevision:0,zone});
 assert.equal(save.ok,true,save.error);
 const made=await h.run({type:'generate',zoneId:'north',expectedZoneRevision:1,days:3});
 assert.equal(made.ok,true,made.error);
 const report=h.store.get('campaigns/campaign-one/weatherReports/'+made.reportId);
 assert.equal(report.status,'draft');
 assert.equal(report.forecast.length,3);
 assert.equal(report.gmNotes,zone.gmNotes);
 assert.equal(h.store.has('campaigns/campaign-one/weatherSharedReports/'+made.reportId),false);
 assert.equal(h.writes.some(row=>/characters|combat|calendarPublic|partyLoot|currency/.test(row[1])),false);
 assert.equal((await h.run({type:'generate',zoneId:'north',expectedZoneRevision:2,days:1})).ok,false);
});
test('Publishing projects safe fields, override refreshes it and withdrawal removes it',async()=>{
 const h=harness();
 await h.run({type:'saveZone',zoneId:'north',expectedRevision:0,zone});
 const created=await h.run({type:'generate',zoneId:'north',expectedZoneRevision:1,days:2});
 const published=await h.run({type:'publish',reportId:created.reportId,expectedRevision:1});
 assert.equal(published.ok,true,published.error);
 const sharedPath='campaigns/campaign-one/weatherSharedReports/'+created.reportId;
 const safe=h.store.get(sharedPath);
 assert.equal(safe.status,'published');
 assert.equal(safe.gmNotes,undefined);
 assert.equal(safe.createdBy,undefined);
 assert.equal(safe.changes,undefined);
 assert.equal(safe.zoneRevision,undefined);
 assert.equal(safe.forecast[0].source,undefined);
 const updated=await h.run({type:'override',reportId:created.reportId,expectedRevision:2,
  dayIndex:0,condition:'blizzard',severity:'extreme',reason:'GM narrative'});
 assert.equal(updated.ok,true,updated.error);
 assert.equal(h.store.get(sharedPath).forecast[0].condition,'blizzard');
 assert.equal(JSON.stringify(h.store.get(sharedPath)).includes('GM narrative'),false);
 assert.equal((await h.run({type:'publish',reportId:created.reportId,expectedRevision:2})).ok,false);
 const withdrawn=await h.run({type:'unpublish',reportId:created.reportId,expectedRevision:3});
 assert.equal(withdrawn.ok,true,withdrawn.error);
 assert.equal(h.store.has(sharedPath),false);
 const archived=await h.run({type:'archive',reportId:created.reportId,expectedRevision:4});
 assert.equal(archived.ok,true,archived.error);
 assert.equal((await h.run({type:'publish',reportId:created.reportId,expectedRevision:5})).ok,false);
});
test('Player output is generated from a strict allowlist rather than copying GM records',()=>{
 assert.throws(()=>publicWeatherReport({status:'draft'}));
 const row=buildWeatherDay(calendar.date,'Winter','fog','moderate',0,'gm-override');
 const safe=publicWeatherReport({id:'report',zoneId:'north',zoneName:'North',region:'Altarin',
  biome:'tundra',calendarRevision:5,status:'published',revision:2,gmNotes:'secret',
  forecast:[row],changes:[{reason:'secret'}],createdBy:'gm'});
 assert.equal(JSON.stringify(safe).includes('secret'),false);
 assert.equal(safe.forecast[0].source,undefined);
 assert.deepEqual(orderWeatherReports([{id:'a',status:'draft'},{id:'b',status:'archived'}]).map(x=>x.id),['a']);
});
test('Permission gate stops all unauthorized reads and writes',async()=>{
 const h=harness(true);
 const result=await h.run({type:'saveZone',zoneId:'north',expectedRevision:0,zone});
 assert.match(result.error,/GM only/);
 assert.equal(h.reads.length,0);
 assert.equal(h.writes.length,0);
});
test('UI, action router and Firestore security integration are connected',()=>{
 const files=['src/dashboards/GMDashboard.jsx','src/dashboards/CharacterDashboard.jsx',
  'src/state/gmToolkitModel.mjs','src/dashboards/WeatherEnvironmentWorkspace.jsx',
  'functions/handler.mjs','functions/commands.mjs',
  'js/firebase-auth.js','firestore.rules'];
 const all=files.map(read).join('\n');
 for(const item of ['GMWeatherEnvironmentWorkspace','PlayerWeatherEnvironment',
  'manageWeatherEnvironment','subscribeWeatherZones','subscribeWeatherReports',
  'weatherZones','weatherReports','weatherSharedReports'])
  assert.ok(all.includes(item),'Missing weather integration: '+item);
 assert.match(read('functions/handler.mjs'),/'manageWeatherEnvironment'/);
});
