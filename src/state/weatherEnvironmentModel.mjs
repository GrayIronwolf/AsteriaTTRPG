/**
 * Digital GM Phase 8.2 — weather is a GM-reviewed narrative generator.
 * These probability presets are software suggestions, NOT canonical Asteria
 * climate rules. No numerical combat, travel, skill, rest or resource effects.
 */
import {advanceAsteriaDate,validateCalendarDefinition,validateCalendarDate,formatAsteriaDate}
 from './asteriaCalendarModel.mjs';

export const WEATHER_BIOMES=Object.freeze([
 'temperate','forest','grassland','desert','mountain','tundra','swamp',
 'coast','ocean','jungle','volcanic','urban','other'
]);
export const WEATHER_CONDITIONS=Object.freeze([
 'clear','cloudy','showers','downpour','thunderstorm','snow','blizzard',
 'fog','wind','heatwave','duststorm','arcane-surge'
]);
export const WEATHER_SEVERITIES=Object.freeze(['mild','moderate','severe','extreme']);
export const WEATHER_VOLATILITY=Object.freeze(['calm','normal','volatile']);
export const MAX_FORECAST_DAYS=7;
export const MAX_REPORT_DAYS=7;
const isObject=x=>Boolean(x)&&typeof x==='object'&&!Array.isArray(x);
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,150}$/.test(x);
const allKeys=(value,allowed,label)=>{
 if(!isObject(value)||Object.keys(value).some(key=>!allowed.includes(key)))
  throw Error('Invalid '+label+' fields.');
};
const bounded=(value,max,label,required=true)=>{
 if(typeof value!=='string'||(required&&!value.trim())||value.trim().length>max)
  throw Error('Enter '+label+' (maximum '+max+' characters).');
 return value.trim();
};
const integer=(value,min,max,label)=>{
 if(!Number.isSafeInteger(value)||value<min||value>max)
  throw Error(label+' must be a whole number from '+min+' to '+max+'.');
 return value;
};
const label=x=>x.split('-').map(part=>part.charAt(0).toUpperCase()+part.slice(1)).join(' ');
export const weatherLabel=label;

export function validateWeatherZone(input,zoneId,previous=null){
 if(!validId(zoneId))throw Error('Choose a valid weather zone identifier.');
 allKeys(input,['name','region','biome','volatility','magicWeather','gmNotes'],'weather zone');
 if(previous?.status==='archived')throw Error('Archived weather zones cannot be edited.');
 if(!WEATHER_BIOMES.includes(input.biome))throw Error('Choose a supported landscape or biome.');
 if(!WEATHER_VOLATILITY.includes(input.volatility))throw Error('Choose a valid weather variability level.');
 if(typeof input.magicWeather!=='boolean')throw Error('Set magical weather to enabled or disabled.');
 return {id:zoneId,name:bounded(input.name,100,'zone name'),
  region:bounded(input.region??'',100,'region',false),
  biome:input.biome,volatility:input.volatility,magicWeather:input.magicWeather,
  gmNotes:bounded(input.gmNotes??'',1500,'private GM zone notes',false),
  status:'active',revision:(previous?.revision||0)+1};
}

export function validateWeatherAction(action={}){
 if(!isObject(action)||!['saveZone','archiveZone','generate','override','publish','unpublish','archive'].includes(action.type))
  throw Error('Unsupported weather action.');
 const allowed={
  saveZone:['type','zoneId','expectedRevision','zone'],
  archiveZone:['type','zoneId','expectedRevision'],
  generate:['type','zoneId','expectedZoneRevision','days'],
  override:['type','reportId','expectedRevision','dayIndex','condition','severity','reason'],
  publish:['type','reportId','expectedRevision'],
  unpublish:['type','reportId','expectedRevision'],
  archive:['type','reportId','expectedRevision']
 }[action.type];
 allKeys(action,allowed,'weather action');
 if(['saveZone','archiveZone','generate'].includes(action.type)&&!validId(action.zoneId))
  throw Error('Choose a valid weather zone.');
 if(['override','publish','unpublish','archive'].includes(action.type)&&!validId(action.reportId))
  throw Error('Choose a valid weather report.');
 if(['saveZone','archiveZone','override','publish','unpublish','archive'].includes(action.type))
  integer(action.expectedRevision,0,1000000,'Revision');
 if(action.type==='generate'){
  integer(action.expectedZoneRevision,1,1000000,'Zone revision');
  integer(action.days,1,MAX_FORECAST_DAYS,'Forecast days');
 }
 if(action.type==='override'){
  integer(action.dayIndex,0,MAX_REPORT_DAYS-1,'Forecast day');
  if(!WEATHER_CONDITIONS.includes(action.condition))throw Error('Choose a valid weather condition.');
  if(!WEATHER_SEVERITIES.includes(action.severity))throw Error('Choose a valid weather severity.');
  bounded(action.reason??'',180,'override reason',false);
 }
 return action.type;
}

// Weighted baseline from landscape, adjusted by Asteria Calendar's optional
// month season. These are configurable content suggestions, not meteorology.
const BASE=Object.freeze({
 clear:24,cloudy:18,showers:15,downpour:8,thunderstorm:7,
 snow:4,blizzard:2,fog:8,wind:10,heatwave:3,duststorm:1,'arcane-surge':1
});
const BIOME_BONUS={
 temperate:{},forest:{showers:10,cloudy:8,fog:8},grassland:{wind:12,clear:8},
 desert:{heatwave:35,duststorm:24,clear:18,snow:-4,blizzard:-2,downpour:-5},
 mountain:{snow:17,blizzard:10,wind:15,heatwave:-3},
 tundra:{snow:38,blizzard:27,wind:12,heatwave:-3,downpour:-6},
 swamp:{fog:30,showers:14,downpour:8},
 coast:{showers:12,wind:18,thunderstorm:10},
 ocean:{wind:25,downpour:18,thunderstorm:12,heatwave:-2},
 jungle:{showers:23,downpour:22,thunderstorm:15,fog:8},
 volcanic:{heatwave:14,duststorm:16,clear:6,snow:-4,blizzard:-2},
 urban:{cloudy:7,clear:6},other:{}
};
const SEASON_BONUS={
 Summer:{clear:9,heatwave:12,thunderstorm:4,snow:-3,blizzard:-2},
 Autumn:{wind:11,cloudy:5,showers:6},
 Winter:{snow:14,blizzard:7,fog:6,heatwave:-3},
 Spring:{showers:10,downpour:5,thunderstorm:6}
};
const WEATHER_HAZARDS={
 clear:[],cloudy:[],
 showers:['Wet surfaces'],
 downpour:['Flood-prone ground','Low visibility'],
 thunderstorm:['Lightning','Strong winds','Low visibility'],
 snow:['Slippery ground','Cold exposure'],
 blizzard:['Whiteout conditions','Extreme cold','Strong winds'],
 fog:['Low visibility'],
 wind:['Strong winds'],
 heatwave:['Heat exposure'],
 duststorm:['Airborne dust','Low visibility'],
 'arcane-surge':['Unstable magical conditions']
};
const FLAVOUR={
 clear:'Open skies and settled conditions.',
 cloudy:'Overcast skies with changing light.',
 showers:'Intermittent rainfall.',
 downpour:'Persistent heavy rain and surface runoff.',
 thunderstorm:'Thunder, lightning and heavy squalls.',
 snow:'Snowfall and accumulating frost.',
 blizzard:'Driving snow and severe wind.',
 fog:'Low clouds or dense ground fog.',
 wind:'Sustained strong winds.',
 heatwave:'Unusually oppressive heat.',
 duststorm:'Blowing grit and reduced sightlines.',
 'arcane-surge':'Localized magical turbulence.'
};
export function weatherWeights(zone,season=''){
 if(!isObject(zone)||!WEATHER_BIOMES.includes(zone.biome))
  throw Error('Choose a valid weather landscape.');
 const weights=Object.fromEntries(WEATHER_CONDITIONS.map(condition=>[condition,BASE[condition]]));
 for(const [condition,adjustment] of Object.entries(BIOME_BONUS[zone.biome]||{}))
  weights[condition]+=adjustment;
 for(const [condition,adjustment] of Object.entries(SEASON_BONUS[season]||{}))
  weights[condition]+=adjustment;
 if(zone.magicWeather!==true)weights['arcane-surge']=0;
 else weights['arcane-surge']+=6;
 if(zone.volatility==='calm'){
  weights.clear+=12;weights.cloudy+=9;weights.downpour=Math.floor(weights.downpour/2);
  weights.thunderstorm=Math.floor(weights.thunderstorm/2);
  weights.blizzard=Math.floor(weights.blizzard/2);
  weights.duststorm=Math.floor(weights.duststorm/2);
 }else if(zone.volatility==='volatile'){
  weights.thunderstorm+=12;weights.downpour+=9;weights.wind+=10;
  weights.blizzard+=8;weights.duststorm+=8;
 }
 return Object.fromEntries(Object.entries(weights).map(([condition,weight])=>[condition,Math.max(0,weight)]));
}
function drawWeighted(weights,rng){
 if(typeof rng!=='function')throw Error('Weather generation requires a trusted random number source.');
 const total=Object.values(weights).reduce((sum,weight)=>sum+weight,0);
 if(!Number.isSafeInteger(total)||total<1)throw Error('No weather outcomes are available.');
 const roll=rng(0,total);
 if(!Number.isInteger(roll)||roll<0||roll>=total)throw Error('Invalid weather random draw.');
 let left=roll;
 for(const condition of WEATHER_CONDITIONS){
  left-=weights[condition]||0;
  if(left<0)return condition;
 }
 throw Error('The weather draw could not be resolved.');
}
function drawSeverity(zone,condition,rng){
 if(condition==='clear'||condition==='cloudy')return 'mild';
 const weights=zone.volatility==='volatile'?[20,35,30,15]:
  zone.volatility==='calm'?[68,26,5,1]:[45,35,16,4];
 const total=weights.reduce((a,b)=>a+b,0);
 const n=rng(0,total);
 if(!Number.isInteger(n)||n<0||n>=total)throw Error('Invalid severity random draw.');
 let rem=n;
 for(let i=0;i<weights.length;i++){rem-=weights[i];if(rem<0)return WEATHER_SEVERITIES[i];}
 throw Error('Invalid severity weight.');
}
export function describeWeather(condition,severity){
 if(!WEATHER_CONDITIONS.includes(condition)||!WEATHER_SEVERITIES.includes(severity))
  throw Error('Choose a valid weather condition and severity.');
 const severe=['severe','extreme'].includes(severity);
 const hazards=[...WEATHER_HAZARDS[condition]];
 const obscured=['fog','blizzard','duststorm','downpour','thunderstorm'].includes(condition);
 const difficult=['snow','blizzard','downpour','thunderstorm','duststorm','heatwave'].includes(condition);
 return {summary:FLAVOUR[condition],
  visibility:obscured?(severe?'Very poor':'Reduced'):'Generally clear',
  travel:difficult?(severe?'Potentially hazardous':'Extra caution advised'):
   hazards.length?'Caution advised':'Generally manageable',
  hazards,
  guidance:'Environmental effects are narrative guidance. The GM decides any checks, penalties, resistances or movement changes.'};
}
export function buildWeatherDay(date,season,condition,severity,index,source='generated'){
 const advisory=describeWeather(condition,severity);
 return {dayIndex:index,date,season:season||'',condition,severity,
  ...advisory,source};
}
export function generateWeatherForecast(zone,calendar,days,rng){
 if(!isObject(calendar)||!calendar.definition||!calendar.date)
  throw Error('Configure the Asteria Calendar before generating dated weather.');
 const config=validateCalendarDefinition(calendar.definition);
 const initial=validateCalendarDate(calendar.date,config);
 const count=integer(days,1,MAX_FORECAST_DAYS,'Forecast days');
 return Array.from({length:count},(_,index)=>{
  const date=index?advanceAsteriaDate(initial,config,'day',index):initial;
  const season=config.months[date.month-1].season||'';
  const condition=drawWeighted(weatherWeights(zone,season),rng);
  const severity=drawSeverity(zone,condition,rng);
  return buildWeatherDay(date,season,condition,severity,index);
 });
}
export function publicWeatherReport(report){
 if(!isObject(report)||report.status!=='published')
  throw Error('Only an approved forecast may be shared.');
 // Explicit allowlist: GM notes, roll history, override reasons,
 // actor identifiers and volatility settings are never published.
 return {id:report.id,revision:report.revision,zoneId:report.zoneId,
  zoneName:report.zoneName,region:report.region,biome:report.biome,
  status:'published',calendarRevision:report.calendarRevision,
  forecast:report.forecast.map(row=>({
   dayIndex:row.dayIndex,date:row.date,season:row.season,
   condition:row.condition,severity:row.severity,summary:row.summary,
   visibility:row.visibility,travel:row.travel,hazards:[...row.hazards],
   guidance:row.guidance
  }))};
}
export function weatherDateLabel(day,definition){
 return definition?formatAsteriaDate(day.date,definition,{time:false}):
  'Forecast day '+(day.dayIndex+1);
}
export function orderWeatherReports(reports=[]){
 return (Array.isArray(reports)?reports:[]).filter(row=>isObject(row)&&row.status!=='archived')
  .sort((a,b)=>String(b.id||'').localeCompare(String(a.id||'')));
}
export function weatherIsValidId(value){return validId(value);}
