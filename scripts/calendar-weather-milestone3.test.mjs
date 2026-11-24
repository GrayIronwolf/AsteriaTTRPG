import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 WEATHER_CONTINENTS,WEATHER_BIOMES,WEATHER_CLIMATE_PRESETS,WEATHER_METRIC_KEYS,
 validateWeatherZone,weatherClimateProfile,weatherEffectiveSeason,
 weatherLocationLabel,generateDeterministicWeatherForecast,overrideWeatherDay,
 publicWeatherReport
} from '../src/state/weatherEnvironmentModel.mjs';
import {createWeatherEnvironmentCommands} from '../functions/weatherEnvironmentCommands.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const calendar={revision:3,definition:{
 months:[{name:'Summermonth',days:30,season:'Summer'},
  {name:'Wintermonth',days:30,season:'Winter'}],
 weekdays:['Mystday','Faeday'],seasons:['Summer','Winter'],
 eras:[{id:'NOW',name:'Current'}],leapDays:[],moons:[],cycles:[],
 hoursPerDay:24,minutesPerHour:60,weekdayAnchor:0,weekdayOverflow:true
},date:{era:'NOW',year:1,month:1,day:28,hour:10,minute:0}};
const zone={name:'Vaelgard northern road',region:'Altarin',biome:'tundra',
 volatility:'normal',magicWeather:false,gmNotes:'Unpublished plan',
 continent:'Altarin',kingdom:'Vaelgard',settlement:'Northern Road',
 latitudeBand:'subpolar',elevationMeters:800,coastal:false,
 temperatureOffsetC:-2,seasonMode:'aligned',atlasMapId:'',atlasPinId:''};
const tropical={...zone,name:'Tropical forest',region:'Atla Natoa',continent:'Atla Natoa',
 biome:'rainforest',latitudeBand:'tropical',elevationMeters:50,
 coastal:true,temperatureOffsetC:0};
const scope='campaigns/campaign-one/';
function harness(denied=false){
 const store=new Map(),reads=[],writes=[];
 const doc=(_db,...parts)=>({path:parts.join('/')});
 const tx={
  get:async ref=>{reads.push(ref.path);const data=store.get(ref.path);
   return {exists:()=>data!==undefined,data:()=>data};},
  set:(ref,value,opts)=>{writes.push(['set',ref.path]);
   store.set(ref.path,opts?.merge?{...store.get(ref.path),...value}:value);},
  update:(ref,value)=>{writes.push(['update',ref.path]);
   store.set(ref.path,{...store.get(ref.path),...value});},
  delete:ref=>{writes.push(['delete',ref.path]);store.delete(ref.path);}
 };
 const api=createWeatherEnvironmentCommands({
  db:{},doc,serverTimestamp:()=>1,requestId:'weather-milestone-3',
  currentUser:{uid:'gm'},runTransaction:async(_db,fn)=>fn(tx)
 },{requireCampaignGM:async()=>{if(denied)throw Error('GM only');}});
 store.set(scope+'calendarState/current',calendar);
 return {store,reads,writes,run:action=>api.manageWeatherEnvironment('campaign-one','gm-scope',action)};
}
test('zone schema extends old weather profiles without forcing a migration',()=>{
 assert.ok(WEATHER_CONTINENTS.includes('Altarin'));
 assert.ok(WEATHER_BIOMES.includes('rainforest'));
 assert.equal(WEATHER_CLIMATE_PRESETS.rainforest.band,'tropical');
 const clean=validateWeatherZone(zone,'vaelgard');
 assert.equal(clean.continent,'Altarin');
 assert.equal(clean.elevationMeters,800);
 assert.equal(clean.atlasMapId,'');
 assert.equal(weatherLocationLabel(clean),'Northern Road · Vaelgard · Altarin');
 const old=validateWeatherZone({name:'Old',region:'Erona',biome:'temperate',
  volatility:'normal',magicWeather:false,gmNotes:''},'old');
 assert.equal(old.latitudeBand,'temperate');
 assert.equal(old.seasonMode,'aligned');
 for(const bad of [{...zone,latitudeBand:'invalid'},{...zone,elevationMeters:99999},
  {...zone,temperatureOffsetC:99},{...zone,atlasMapId:'my-map'},
  {...zone,atlasMapId:'../map',atlasPinId:'pin'},
  {...zone,magicWeather:'true'},{...zone,privateKey:'wrong'}]){
  assert.throws(()=>validateWeatherZone(bad,'bad'));
 }
});
test('biome, altitude and hemisphere season change climate without inventing Astria canon',()=>{
 const northern=weatherClimateProfile(zone);
 const southern=weatherClimateProfile(tropical);
 assert.ok(northern.temperatureC<southern.temperatureC);
 assert.equal(weatherEffectiveSeason({...zone,seasonMode:'reversed'},'Winter'),'Summer');
 assert.equal(weatherEffectiveSeason({...zone,seasonMode:'fixed'},'Winter'),'');
 assert.ok(southern.humidityPct>northern.humidityPct);
});
test('forecast generation is deterministic for same campaign, zone and fantasy date',()=>{
 const first=generateDeterministicWeatherForecast({...zone,id:'north',revision:1},calendar,5,'campaign-one');
 const second=generateDeterministicWeatherForecast({...zone,id:'north',revision:1},calendar,5,'campaign-one');
 assert.deepEqual(first,second);
 assert.equal(first.length,5);
 assert.equal(first[0].date.day,28);
 assert.equal(first[3].date.month,2);
 assert.ok(WEATHER_METRIC_KEYS.every(key=>key in first[0].metrics));
 assert.equal(first[0].source,'deterministic');
 const later={...calendar,date:{...calendar.date,day:29}};
 const overlap=generateDeterministicWeatherForecast({...zone,id:'north',revision:1},later,4,'campaign-one');
 assert.deepEqual(first[1].metrics,overlap[0].metrics);
 assert.equal(first[1].condition,overlap[0].condition);
 const changed=generateDeterministicWeatherForecast({...tropical,id:'tropics',revision:1},calendar,5,'campaign-one');
 assert.notDeepEqual(changed.map(day=>day.metrics.temperatureC),first.map(day=>day.metrics.temperatureC));
 assert.throws(()=>generateDeterministicWeatherForecast(zone,calendar,8,'campaign-one'));
 assert.throws(()=>generateDeterministicWeatherForecast(zone,calendar,1,''));
});
test('manual override recomputes detailed measurements without changing other days',()=>{
 const z={...zone,id:'north',revision:1};
 const report=generateDeterministicWeatherForecast(z,calendar,3,'campaign-one');
 const override=overrideWeatherDay(report[1],z,calendar,'blizzard','extreme','campaign-one');
 assert.equal(override.condition,'blizzard');
 assert.equal(override.source,'gm-override');
 assert.equal(override.dayIndex,1);
 assert.ok(override.metrics.windKmh>=0);
 assert.deepEqual(report[0],generateDeterministicWeatherForecast(z,calendar,1,'campaign-one')[0]);
});
test('strict published projection excludes GM notes, generation source and private location IDs',()=>{
 const clean=validateWeatherZone(zone,'north');
 const row=generateDeterministicWeatherForecast(clean,calendar,2,'campaign-one');
 const shared=publicWeatherReport({id:'example',revision:2,status:'published',
  zoneId:'north',zoneName:zone.name,region:'Altarin',biome:'tundra',
  location:{continent:'Altarin',kingdom:'Vaelgard',settlement:'Northern Road',
   atlasMapId:'hidden',secret:'GM only'},calendarRevision:3,forecast:row,
  gmNotes:'never publish',seed:'private',changes:[{reason:'never publish'}]});
 assert.equal(shared.forecast[0].metrics.temperatureC,row[0].metrics.temperatureC);
 for(const secret of ['never publish','GM only','private','hidden','source','atlasMapId']){
  assert.equal(JSON.stringify(shared).includes(secret),false,secret);
 }
 assert.deepEqual(Object.keys(shared.forecast[0].metrics).sort(),[...WEATHER_METRIC_KEYS].sort());
});
test('trusted GM generation and publication retain client-safe projections',async()=>{
 const h=harness();
 const saved=await h.run({type:'saveZone',zoneId:'north',expectedRevision:0,zone});
 assert.equal(saved.ok,true,saved.error);
 const gen=await h.run({type:'generate',zoneId:'north',expectedZoneRevision:1,days:3});
 assert.equal(gen.ok,true,gen.error);
 const report=h.store.get(scope+'weatherReports/'+gen.reportId);
 assert.equal(report.forecast.length,3);
 assert.equal(report.forecast[0].source,'deterministic');
 assert.equal(report.gmNotes,zone.gmNotes);
 const published=await h.run({type:'publish',reportId:gen.reportId,expectedRevision:1});
 assert.equal(published.ok,true,published.error);
 const pub=h.store.get(scope+'weatherSharedReports/'+gen.reportId);
 assert.equal(pub.forecast[0].source,undefined);
 assert.ok(Number.isFinite(pub.forecast[0].metrics.temperatureC));
 const override=await h.run({type:'override',reportId:gen.reportId,expectedRevision:2,
  dayIndex:0,condition:'snow',severity:'severe',reason:'GM secret reason'});
 assert.equal(override.ok,true,override.error);
 const updated=h.store.get(scope+'weatherSharedReports/'+gen.reportId);
 assert.equal(updated.forecast[0].condition,'snow');
 assert.ok(updated.forecast[0].metrics);
 assert.equal(JSON.stringify(updated).includes('GM secret reason'),false);
 assert.equal(h.writes.some(([,path])=>/characters|combat|partyLoot|currency/.test(path)),false);
});
test('atlas links require existing campaign markers and unauthorized users cannot write',async()=>{
 const h=harness();
 const link={...zone,atlasMapId:'altr-map',atlasPinId:'vaelgard'};
 const missing=await h.run({type:'saveZone',zoneId:'linked',expectedRevision:0,zone:link});
 assert.equal(missing.ok,false);
 h.store.set(scope+'worldAtlas/altr-map',{id:'altr-map',status:'draft',pins:[{id:'vaelgard',name:'Vaelgard'}]});
 const saved=await h.run({type:'saveZone',zoneId:'linked',expectedRevision:0,zone:link});
 assert.equal(saved.ok,true,saved.error);
 const denied=harness(true);
 const bad=await denied.run({type:'saveZone',zoneId:'north',expectedRevision:0,zone});
 assert.equal(bad.ok,false);
 assert.equal(denied.writes.length,0);
 assert.equal(denied.reads.length,0);
});
test('GM/player views reuse existing subscriptions and weather security collections',()=>{
 const ui=read('src/dashboards/WeatherEnvironmentWorkspace.jsx');
 const server=read('functions/weatherEnvironmentCommands.mjs');
 const rules=read('firestore.rules');
 assert.match(ui,/subscribeWeatherReports\(campaignId,setReports,'player'\)/);
 assert.match(ui,/subscribeWorldAtlas\(campaignId,setAtlasMaps,'gm'\)/);
 assert.match(ui,/weatherClimateProfile\(draft\)/);
 assert.match(server,/generateDeterministicWeatherForecast/);
 assert.match(rules,/match \/weatherZones\/\{zoneId\}/);
 assert.match(rules,/match \/weatherSharedReports\/\{reportId\}/);
});
