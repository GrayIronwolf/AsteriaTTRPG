/**
 * Digital GM 8.1 — Asteria's EXISTING calendar, not a Gregorian replacement.
 * Canonical labels/order verified against the connected Asteria Obsidian vault:
 * 23. Asteria Lore / Seasons, Months, Days & Calendar.
 * Month lengths, weekday epoch and hours per day were not present in the
 * readable vault folder structure. They must be supplied by the GM.
 */
export const ASTERIA_CALENDAR_ID='asteria-primary';
export const ASTERIA_WEEKDAYS=Object.freeze([
 'Mystday','Embiday','Wynday','Thunday','Faeday','Lunisday','Solday','Elisday'
]);
export const ASTERIA_MONTHS=Object.freeze([
 'Aork','Barolm','Crexis','Tylonn','Aquol','Sularis','Hamtol','Vofenn',
 'Kirem','Straph','Vlumis','Whystol'
]);
export const ASTERIA_SEASONS=Object.freeze(['Summer','Autumn','Winter','Spring']);
export const ASTERIA_ERAS=Object.freeze([
 {id:'AOP',name:'Age of Primordials'},
 {id:'TBG',name:'Time Before Gods'},
 {id:'ABE',name:'Astria Birth Era'},
 {id:'EOLG',name:'Era of Lost Gods'},
 {id:'EOSR',name:'Era of Shattered Realms'}
]);
export const CALENDAR_ENTRY_KINDS=Object.freeze([
 'festival','quest','travel','event','timeline','economy','other'
]);
export const CALENDAR_RELATED_TYPES=Object.freeze(['quest','timeline','event','route']);
export const MAX_CALENDAR_YEAR=100000;
export const MAX_CALENDAR_HISTORY=50;
export const MAX_CALENDAR_ENTRIES=120;
const object=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const id=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value);
const whole=(value,min,max,label)=>{
 if(!Number.isSafeInteger(value)||value<min||value>max)
  throw Error(label+' must be a whole number from '+min+' to '+max+'.');
 return value;
};
function fields(value,keys,label){
 if(!object(value)||Object.keys(value).some(key=>!keys.includes(key)))
  throw Error('Invalid '+label+' fields.');
}
function text(value,max,label,optional=false){
 if(typeof value!=='string'||value.trim().length>max||(!optional&&!value.trim()))
  throw Error('Enter valid '+label+' (maximum '+max+' characters).');
 return value.trim();
}
/** No unverified Asteria month lengths, weekday epoch, or day length. */
export function validateCalendarDefinition(config){
 fields(config,['months','hoursPerDay','minutesPerHour','weekdayAnchor'],'calendar definition');
 if(!Array.isArray(config.months)||config.months.length!==ASTERIA_MONTHS.length)
  throw Error('Configure the exact length of all 12 Asteria months.');
 const months=config.months.map((row,index)=>{
  fields(row,['days','season'],'month '+ASTERIA_MONTHS[index]);
  const season=row.season??'';
  if(typeof season!=='string'||(season&&!ASTERIA_SEASONS.includes(season)))
   throw Error('Choose an existing season for '+ASTERIA_MONTHS[index]+'.');
  return {days:whole(row.days,1,100,'Days in '+ASTERIA_MONTHS[index]),season};
 });
 return {months,
  hoursPerDay:whole(config.hoursPerDay,1,48,'Hours per day'),
  minutesPerHour:whole(config.minutesPerHour,1,120,'Minutes per hour'),
  weekdayAnchor:whole(config.weekdayAnchor,0,7,'First weekday')};
}
export function validateCalendarDate(date,config){
 fields(date,['era','year','month','day','hour','minute'],'calendar date');
 const validated=validateCalendarDefinition(config);
 const era=ASTERIA_ERAS.find(row=>row.id===date.era)?.id;
 if(!era)throw Error('Choose one of Asteria’s established historical eras.');
 const year=whole(date.year,1,MAX_CALENDAR_YEAR,'Year');
 const month=whole(date.month,1,12,'Month');
 const day=whole(date.day,1,validated.months[month-1].days,'Day of month');
 const hour=whole(date.hour,0,validated.hoursPerDay-1,'Hour');
 const minute=whole(date.minute,0,validated.minutesPerHour-1,'Minute');
 return {era,year,month,day,hour,minute};
}
export function calendarYearDays(config){
 return config.months.reduce((sum,row)=>sum+row.days,0);
}
export function calendarDayIndex(date,config){
 const days=calendarYearDays(config);
 return (date.year-1)*days+config.months.slice(0,date.month-1).reduce((sum,row)=>sum+row.days,0)+date.day-1;
}
export function calendarWeekday(date,config){
 const clean=validateCalendarDate(date,config);
 return ASTERIA_WEEKDAYS[(config.weekdayAnchor+calendarDayIndex(clean,config))%ASTERIA_WEEKDAYS.length];
}
export function formatAsteriaDate(date,config,{time=true}={}){
 const clean=validateCalendarDate(date,config);
 const weekday=calendarWeekday(clean,config);
 const season=config.months[clean.month-1].season;
 const timeText=time?' · '+String(clean.hour).padStart(2,'0')+':'+String(clean.minute).padStart(2,'0'):'';
 return weekday+', '+clean.day+' '+ASTERIA_MONTHS[clean.month-1]+' '+clean.year+' '+clean.era+
   timeText+(season?' · '+season:'');
}
export function calendarDateSortKey(date){
 if(!object(date))return '';
 const era=ASTERIA_ERAS.findIndex(row=>row.id===date.era);
 if(era<0)return '';
 return [String(era).padStart(2,'0'),String(date.year).padStart(6,'0'),
  String(date.month).padStart(2,'0'),String(date.day).padStart(3,'0'),
  String(date.hour).padStart(2,'0'),String(date.minute).padStart(3,'0')].join('-');
}
export function advanceAsteriaDate(date,config,unit,amount){
 const start=validateCalendarDate(date,config);
 if(!['minute','hour','day','week','month','year'].includes(unit))
  throw Error('Choose minutes, hours, days, weeks, months or years.');
 const maximum={minute:10000,hour:1000,day:365,week:52,month:120,year:20}[unit];
 const count=whole(amount,1,maximum,'Calendar advance amount');
 if(unit==='month'||unit==='year'){
  const delta=unit==='year'?count*12:count;
  const total=(start.year-1)*12+start.month-1+delta;
  const year=Math.floor(total/12)+1,month=total%12+1;
  if(year>MAX_CALENDAR_YEAR)throw Error('Calendar year is outside the supported range.');
  return {...start,year,month,day:Math.min(start.day,config.months[month-1].days)};
 }
 const minutesPerDay=config.hoursPerDay*config.minutesPerHour;
 const add=unit==='minute'?count:unit==='hour'?count*config.minutesPerHour:
   unit==='day'?count*minutesPerDay:count*ASTERIA_WEEKDAYS.length*minutesPerDay;
 const total=calendarDayIndex(start,config)*minutesPerDay+
   start.hour*config.minutesPerHour+start.minute+add;
 const dayIndex=Math.floor(total/minutesPerDay);
 const year=Math.floor(dayIndex/calendarYearDays(config))+1;
 if(year>MAX_CALENDAR_YEAR)throw Error('Calendar year is outside the supported range.');
 let offset=dayIndex%calendarYearDays(config),month=1;
 for(const row of config.months){
  if(offset<row.days)break;
  offset-=row.days;month++;
 }
 const minuteOfDay=total%minutesPerDay;
 return {...start,year,month,day:offset+1,hour:Math.floor(minuteOfDay/config.minutesPerHour),
  minute:minuteOfDay%config.minutesPerHour};
}
export function validateCalendarEntry(input,config,idValue,previous=null){
 if(!id(idValue))throw Error('Choose a valid calendar entry identifier.');
 fields(input,['title','description','kind','visibility','date','related'],'calendar entry');
 const kind=CALENDAR_ENTRY_KINDS.includes(input.kind)?input.kind:null;
 if(!kind)throw Error('Choose a valid calendar event type.');
 const visibility=input.visibility;
 if(!['gm','party'].includes(visibility))throw Error('Choose GM-only or party visibility.');
 const related=input.related??null;
 if(related!==null){
  fields(related,['type','id'],'linked calendar record');
  if(!CALENDAR_RELATED_TYPES.includes(related.type)||!id(related.id))
   throw Error('Choose a valid existing quest, event, timeline or trade route.');
 }
 if(previous?.status==='archived')throw Error('Archived calendar entries cannot be edited.');
 return {id:idValue,title:text(input.title,120,'calendar event title'),
  description:text(input.description??'',1000,'calendar event description',true),
  kind,visibility,date:validateCalendarDate(input.date,config),
  related:related?{type:related.type,id:related.id}:null,
  status:'active',revision:(previous?.revision||0)+1};
}
export function calendarSourceReferences(workspace={}){
 const world=object(workspace.world)?workspace.world:{};
 const economy=object(workspace.economy)?workspace.economy:{};
 const sources=[
  ['quest',workspace.quests,'title'],
  ['timeline',world.timeline,'title'],
  ['event',world.events,'title'],
  ['route',economy.routes,'name']
 ];
 return sources.flatMap(([type,records,nameKey])=>
  (Array.isArray(records)?records:[]).filter(row=>object(row)&&id(row.id))
    .map(row=>({type,id:row.id,title:String(row[nameKey]||row.name||row.title||row.id).slice(0,120)})));
}
export function sortedCalendarEntries(entries=[],config=null){
 const rows=(Array.isArray(entries)?entries:[]).filter(row=>object(row)&&row.status!=='archived');
 if(!config)return rows;
 return rows.filter(row=>{try{validateCalendarDate(row.date,config);return true;}catch{return false;}})
  .sort((a,b)=>calendarDateSortKey(a.date).localeCompare(calendarDateSortKey(b.date))||a.title.localeCompare(b.title));
}
export function validateCalendarAction(action={}){
 fields(action,['type','expectedRevision','definition','date','unit','amount','reason','entryId','entry','expectedEntryRevision'],'calendar action');
 const type=action.type;
 if(!['configure','set','advance','saveEntry','archiveEntry'].includes(type))
  throw Error('Unsupported Asteria calendar action.');
 const keys={
  configure:['type','expectedRevision','definition','date','reason'],
  set:['type','expectedRevision','date','reason'],
  advance:['type','expectedRevision','unit','amount','reason'],
  saveEntry:['type','expectedRevision','entryId','expectedEntryRevision','entry'],
  archiveEntry:['type','expectedRevision','entryId','expectedEntryRevision']
 }[type];
 if(Object.keys(action).some(key=>!keys.includes(key)))
  throw Error('Fields are not permitted for this Asteria calendar action.');
 const expectedRevision=whole(action.expectedRevision,0,1000000,'Calendar revision');
 if(type==='configure'&&action.expectedRevision===0&&(!action.definition||!action.date))
  throw Error('Configure the world calendar and its start date.');
 if(['saveEntry','archiveEntry'].includes(type)){
  if(!id(action.entryId))throw Error('Choose a calendar entry.');
  whole(action.expectedEntryRevision,0,1000000,'Calendar entry revision');
 }
 if(['configure','set','advance'].includes(type)){
  if(action.reason!==undefined)text(action.reason,180,'GM reason',true);
 }
 return {type,expectedRevision};
}
