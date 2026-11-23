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
/**
 * Calendar schema v2. Legacy campaign documents (without custom names,
 * intercalary days or celestial data) are interpreted as the existing Astria
 * calendar; no migration or changed chronology is imposed on saved campaigns.
 */
export function validateCalendarDefinition(config){
 fields(config,['months','hoursPerDay','minutesPerHour','weekdayAnchor','weekdays','seasons',
  'eras','leapDays','moons','cycles','weekdayOverflow'],'calendar definition');
 const weekdays=config.weekdays??ASTERIA_WEEKDAYS;
 if(!Array.isArray(weekdays)||weekdays.length<1||weekdays.length>14)
  throw Error('Configure between 1 and 14 weekdays.');
 const cleanWeekdays=weekdays.map((name,index)=>text(name,40,'weekday '+(index+1)));
 const seasons=config.seasons??ASTERIA_SEASONS;
 if(!Array.isArray(seasons)||seasons.length<1||seasons.length>12)
  throw Error('Configure between 1 and 12 seasons.');
 const cleanSeasons=seasons.map((name,index)=>text(name,50,'season '+(index+1)));
 const eraRows=config.eras??ASTERIA_ERAS;
 if(!Array.isArray(eraRows)||eraRows.length<1||eraRows.length>20)
  throw Error('Configure between 1 and 20 eras.');
 const eras=eraRows.map((row,index)=>{
  fields(row,['id','name'],'era');
  if(!id(row.id)||row.id.length>20)throw Error('Era IDs must contain only letters, numbers, hyphens or underscores.');
  return {id:row.id,name:text(row.name,80,'era '+(index+1))};
 });
 const unique=(rows,label)=>{if(new Set(rows.map(x=>x.toLowerCase())).size!==rows.length)throw Error('Duplicate '+label+' names are not allowed.');};
 unique(cleanWeekdays,'weekday');unique(cleanSeasons,'season');unique(eras.map(x=>x.id),'era');
 if(!Array.isArray(config.months)||config.months.length<1||config.months.length>24)
  throw Error('Configure between 1 and 24 calendar months.');
 const months=config.months.map((row,index)=>{
  fields(row,['name','days','season'],'month');
  const name=text(row.name??ASTERIA_MONTHS[index]??('Month '+(index+1)),50,'month name');
  const season=row.season??'';
  if(typeof season!=='string'||(season&&!cleanSeasons.includes(season)))
   throw Error('Choose an existing season for '+name+'.');
  return {name,days:whole(row.days,1,100,'Days in '+name),season};
 });
 unique(months.map(x=>x.name),'month');
 const leapRows=config.leapDays??[];
 if(!Array.isArray(leapRows)||leapRows.length>12)throw Error('Configure up to 12 leap-day rules.');
 const leapDays=leapRows.map((row,index)=>{
  fields(row,['name','afterMonth','every','offset','skipWeekday'],'leap day');
  const afterMonth=whole(row.afterMonth,1,months.length,'Leap day month');
  const every=whole(row.every,2,1000,'Leap day interval');
  const offset=whole(row.offset??0,0,every-1,'Leap day offset');
  return {name:text(row.name,50,'leap day '+(index+1)),afterMonth,every,offset,
   skipWeekday:row.skipWeekday===true};
 });
 const phaseRows=(value,label,maximum)=>{
  if(!Array.isArray(value)||value.length>maximum)throw Error('Configure up to '+maximum+' '+label+'.');
  const result=value.map((row,index)=>{
   fields(row,['name','period','offset'],label);
   return {name:text(row.name,50,label+' '+(index+1)),
    period:whole(row.period,2,100000,label+' period'),
    offset:whole(row.offset??0,0,99999,label+' offset')};
  });
  unique(result.map(row=>row.name),label);return result;
 };
 return {
  months,hoursPerDay:whole(config.hoursPerDay,1,48,'Hours per day'),
  minutesPerHour:whole(config.minutesPerHour,1,120,'Minutes per hour'),
  weekdayAnchor:whole(config.weekdayAnchor,0,cleanWeekdays.length-1,'First weekday'),
  weekdays:cleanWeekdays,seasons:cleanSeasons,eras,leapDays,
  moons:phaseRows(config.moons??[],'moons',12),
  cycles:phaseRows(config.cycles??[],'cycles',20),
  weekdayOverflow:config.weekdayOverflow!==false
 };
}
function leapApplies(rule,year){return year%rule.every===rule.offset;}
export function calendarMonthDays(config,year,month){
 const c=validateCalendarDefinition(config);
 whole(year,1,MAX_CALENDAR_YEAR,'Year');
 whole(month,1,c.months.length,'Month');
 return c.months[month-1].days+c.leapDays.filter(rule=>rule.afterMonth===month&&leapApplies(rule,year)).length;
}
export function calendarYearDays(config,year=1){
 const c=validateCalendarDefinition(config);
 whole(year,1,MAX_CALENDAR_YEAR,'Year');
 return c.months.reduce((sum,row)=>sum+row.days,0)+c.leapDays.filter(row=>leapApplies(row,year)).length;
}
function leapCountBefore(rule,year){
 const y=year-1;
 if(y<=0)return 0;
 // Years x in [1,y] where x mod every === offset.
 return rule.offset===0?Math.floor(y/rule.every):
  y<rule.offset?0:1+Math.floor((y-rule.offset)/rule.every);
}
function daysBeforeYear(c,year){
 return (year-1)*c.months.reduce((sum,row)=>sum+row.days,0)+
  c.leapDays.reduce((sum,rule)=>sum+leapCountBefore(rule,year),0);
}
export function validateCalendarDate(date,config){
 fields(date,['era','year','month','day','hour','minute'],'calendar date');
 const c=validateCalendarDefinition(config);
 if(!c.eras.some(row=>row.id===date.era))
  throw Error('Choose an era in this calendar.');
 const year=whole(date.year,1,MAX_CALENDAR_YEAR,'Year');
 const month=whole(date.month,1,c.months.length,'Month');
 const day=whole(date.day,1,calendarMonthDays(c,year,month),'Day of month');
 return {era:date.era,year,month,day,
  hour:whole(date.hour,0,c.hoursPerDay-1,'Hour'),
  minute:whole(date.minute,0,c.minutesPerHour-1,'Minute')};
}
export function calendarDayIndex(date,config){
 const c=validateCalendarDefinition(config),d=validateCalendarDate(date,c);
 let day=daysBeforeYear(c,d.year);
 for(let m=1;m<d.month;m++){
  day+=c.months[m-1].days+c.leapDays.filter(rule=>rule.afterMonth===m&&leapApplies(rule,d.year)).length;
 }
 return day+d.day-1;
}
export function calendarDateFromDayIndex(index,config,era){
 const c=validateCalendarDefinition(config);
 whole(index,0,daysBeforeYear(c,MAX_CALENDAR_YEAR+1)-1,'Calendar day index');
 if(!c.eras.some(row=>row.id===era))throw Error('Choose a valid calendar era.');
 let low=1,high=MAX_CALENDAR_YEAR;
 while(low<high){
  const mid=Math.ceil((low+high)/2);
  if(daysBeforeYear(c,mid)<=index)low=mid;else high=mid-1;
 }
 const year=low;
 let rest=index-daysBeforeYear(c,year),month=1;
 while(month<=c.months.length){
  const length=c.months[month-1].days+
   c.leapDays.filter(rule=>rule.afterMonth===month&&leapApplies(rule,year)).length;
  if(rest<length)break;
  rest-=length;month++;
 }
 return {era,year,month,day:rest+1,hour:0,minute:0};
}
export function calendarDateToMinutes(date,config){
 const c=validateCalendarDefinition(config),d=validateCalendarDate(date,c);
 return calendarDayIndex(d,c)*c.hoursPerDay*c.minutesPerHour+
  d.hour*c.minutesPerHour+d.minute;
}
export function calendarDateFromMinutes(minutes,config,era){
 const c=validateCalendarDefinition(config);
 if(!Number.isSafeInteger(minutes)||minutes<0)throw Error('Invalid calendar minute index.');
 const perDay=c.hoursPerDay*c.minutesPerHour;
 const d=calendarDateFromDayIndex(Math.floor(minutes/perDay),c,era);
 const remainder=minutes%perDay;
 return {...d,hour:Math.floor(remainder/c.minutesPerHour),minute:remainder%c.minutesPerHour};
}
export function calendarIntercalaryName(date,config){
 const c=validateCalendarDefinition(config),d=validateCalendarDate(date,c);
 const base=c.months[d.month-1].days;
 if(d.day<=base)return '';
 const rules=c.leapDays.filter(row=>row.afterMonth===d.month&&leapApplies(row,d.year));
 return rules[d.day-base-1]?.name??'';
}
function skippedDaysBefore(c,date){
 let skipped=c.leapDays.filter(row=>row.skipWeekday)
  .reduce((sum,row)=>sum+leapCountBefore(row,date.year),0);
 for(const rule of c.leapDays){
  if(!rule.skipWeekday||!leapApplies(rule,date.year))continue;
  if(rule.afterMonth<date.month)skipped++;
  if(rule.afterMonth===date.month&&date.day>c.months[date.month-1].days)skipped++;
 }
 return skipped;
}
export function calendarWeekday(date,config){
 const c=validateCalendarDefinition(config),d=validateCalendarDate(date,c);
 const leapIndex=d.day-c.months[d.month-1].days-1;
 if(leapIndex>=0){
  const extra=c.leapDays.filter(rule=>rule.afterMonth===d.month&&leapApplies(rule,d.year))[leapIndex];
  if(extra?.skipWeekday)return extra.name;
 }
 const ordinal=c.weekdayOverflow?calendarDayIndex(d,c)-skippedDaysBefore(c,d):
  d.day-1-Math.min(d.day-1,c.leapDays.filter(rule=>rule.afterMonth===d.month&&rule.skipWeekday&&leapApplies(rule,d.year)).length);
 return c.weekdays[((c.weekdayAnchor+ordinal)%c.weekdays.length+c.weekdays.length)%c.weekdays.length];
}
export function formatAsteriaDate(date,config,{time=true}={}){
 const c=validateCalendarDefinition(config),d=validateCalendarDate(date,c);
 const weekday=calendarWeekday(d,c),season=c.months[d.month-1].season;
 const timeText=time?' · '+String(d.hour).padStart(2,'0')+':'+String(d.minute).padStart(2,'0'):'';
 return weekday+', '+d.day+' '+c.months[d.month-1].name+' '+d.year+' '+d.era+
  timeText+(season?' · '+season:'');
}
export function calendarDateSortKey(date,config=null){
 if(!object(date))return '';
 const eras=config?validateCalendarDefinition(config).eras:ASTERIA_ERAS;
 const era=eras.findIndex(row=>row.id===date.era);
 if(era<0)return '';
 return [String(era).padStart(2,'0'),String(date.year).padStart(6,'0'),
  String(date.month).padStart(2,'0'),String(date.day).padStart(3,'0'),
  String(date.hour).padStart(2,'0'),String(date.minute).padStart(3,'0')].join('-');
}
export function advanceAsteriaDate(date,config,unit,amount){
 const c=validateCalendarDefinition(config),start=validateCalendarDate(date,c);
 if(!['minute','hour','day','week','month','year'].includes(unit))
  throw Error('Choose minutes, hours, days, weeks, months or years.');
 const maximum={minute:10000,hour:1000,day:365,week:52,month:120,year:20}[unit];
 const count=whole(amount,1,maximum,'Calendar advance amount');
 if(unit==='month'||unit==='year'){
  const delta=unit==='year'?count*c.months.length:count;
  const total=(start.year-1)*c.months.length+start.month-1+delta;
  const year=Math.floor(total/c.months.length)+1,month=total%c.months.length+1;
  if(year>MAX_CALENDAR_YEAR)throw Error('Calendar year is outside the supported range.');
  return {...start,year,month,day:Math.min(start.day,calendarMonthDays(c,year,month))};
 }
 const extra=unit==='minute'?count:unit==='hour'?count*c.minutesPerHour:
  unit==='day'?count*c.hoursPerDay*c.minutesPerHour:count*c.weekdays.length*c.hoursPerDay*c.minutesPerHour;
 return calendarDateFromMinutes(calendarDateToMinutes(start,c)+extra,c,start.era);
}
export function calendarMonthGrid(config,era,year,month){
 const c=validateCalendarDefinition(config);
 const length=calendarMonthDays(c,year,month);
 const start={era,year,month,day:1,hour:0,minute:0};
 const first=calendarWeekday(start,c);
 const leading=c.weekdays.indexOf(first);
 const rows=[];
 for(let i=0;i<leading;i++)rows.push(null);
 for(let day=1;day<=length;day++){
  const date={...start,day};
  rows.push({date,weekday:calendarWeekday(date,c),
   intercalary:calendarIntercalaryName(date,c)});
 }
 return rows;
}
export function calendarCyclePhase(date,config,cycle){
 const c=validateCalendarDefinition(config),d=validateCalendarDate(date,c);
 const source=[...c.moons,...c.cycles].find(row=>row.name===cycle);
 if(!source)throw Error('Unknown calendar cycle.');
 return ((calendarDayIndex(d,c)+source.offset)%source.period)/source.period;
}
export function calendarYearSummary(config,year=1){
 const c=validateCalendarDefinition(config);
 return {year,days:calendarYearDays(c,year),months:c.months.length,
  weekdays:c.weekdays.length,leapDays:c.leapDays.filter(x=>leapApplies(x,year)).map(x=>x.name)};
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
  .sort((a,b)=>calendarDateSortKey(a.date,config).localeCompare(calendarDateSortKey(b.date,config))||a.title.localeCompare(b.title));
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
