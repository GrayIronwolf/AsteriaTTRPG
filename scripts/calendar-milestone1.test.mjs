import test from 'node:test';
import assert from 'node:assert/strict';
import {
 validateCalendarDefinition,validateCalendarDate,calendarDayIndex,
 calendarDateFromDayIndex,calendarDateToMinutes,calendarDateFromMinutes,
 calendarMonthDays,calendarYearDays,calendarWeekday,calendarMonthGrid,
 calendarCyclePhase,advanceAsteriaDate,calendarYearSummary,formatAsteriaDate,
 ASTERIA_MONTHS,ASTERIA_WEEKDAYS
} from '../src/state/asteriaCalendarModel.mjs';

const legacy={months:ASTERIA_MONTHS.map(()=>({days:30,season:''})),
 hoursPerDay:24,minutesPerHour:60,weekdayAnchor:0};
const custom={months:[{name:'Frost',days:30,season:'Winter'},{name:'Thaw',days:29,season:'Spring'}],
 weekdays:['First','Second','Third'],seasons:['Winter','Spring'],
 eras:[{id:'NEW',name:'New Age'}],leapDays:[
  {name:'Leap',afterMonth:2,every:4,offset:0,skipWeekday:true}],
 moons:[{name:'Pale Moon',period:28,offset:0}],
 cycles:[{name:'Ritual',period:6,offset:2}],
 hoursPerDay:24,minutesPerHour:60,weekdayAnchor:0,weekdayOverflow:true};
test('existing calendar documents remain readable without migration',()=>{
 const config=validateCalendarDefinition(legacy);
 assert.equal(config.months.length,12);
 assert.equal(config.months[0].name,ASTERIA_MONTHS[0]);
 assert.deepEqual(config.weekdays,ASTERIA_WEEKDAYS);
 const d={era:'EOSR',year:2,month:1,day:1,hour:0,minute:0};
 assert.match(formatAsteriaDate(d,legacy),/Aork 2 EOSR/);
 assert.equal(calendarYearDays(config,2),360);
});
test('custom calendar supports variable months weekdays clock and eras',()=>{
 const config=validateCalendarDefinition(custom);
 assert.equal(calendarYearDays(config,3),59);
 assert.equal(calendarYearDays(config,4),60);
 assert.equal(calendarMonthDays(config,4,2),30);
 assert.equal(calendarMonthDays(config,3,2),29);
 assert.throws(()=>validateCalendarDate({era:'EOSR',year:4,month:2,day:30,hour:0,minute:0},config));
 assert.equal(calendarMonthGrid(config,'NEW',4,2).filter(Boolean).length,30);
 assert.equal(calendarYearSummary(config,4).days,60);
 assert.match(formatAsteriaDate({era:'NEW',year:4,month:1,day:1,hour:4,minute:6},config),/Frost/);
});
test('leap day outside weekday cycle does not shift the following weekday',()=>{
 const base={era:'NEW',year:4,month:2,day:29,hour:0,minute:0};
 const leap={...base,day:30};
 const next={era:'NEW',year:5,month:1,day:1,hour:0,minute:0};
 assert.equal(calendarWeekday(leap,custom),'Leap');
 assert.equal(calendarWeekday(next,custom),
  custom.weekdays[(calendarDayIndex(next,custom)-1)%custom.weekdays.length]);
 assert.equal(advanceAsteriaDate({...leap,hour:23,minute:59},custom,'minute',1).year,5);
});
test('serial dates and minutes round trip across leap-year boundaries',()=>{
 const sample={era:'NEW',year:4,month:2,day:30,hour:23,minute:59};
 const index=calendarDayIndex(sample,custom);
 assert.deepEqual(calendarDateFromDayIndex(index,custom,'NEW'),{...sample,hour:0,minute:0});
 assert.deepEqual(calendarDateFromMinutes(calendarDateToMinutes(sample,custom),custom,'NEW'),sample);
});
test('moon and repeating-cycle phases are reproducible',()=>{
 const d={era:'NEW',year:1,month:1,day:1,hour:0,minute:0};
 assert.equal(calendarCyclePhase(d,custom,'Pale Moon'),0);
 assert.equal(calendarCyclePhase(d,custom,'Ritual'),2/6);
 assert.equal(calendarCyclePhase({...d,day:7},custom,'Ritual'),2/6);
});
test('invalid names, duplicate eras and malformed leap rules are rejected',()=>{
 assert.throws(()=>validateCalendarDefinition({...custom,weekdays:['One','One']}));
 assert.throws(()=>validateCalendarDefinition({...custom,eras:[{id:'BAD ID',name:'No'}]}));
 assert.throws(()=>validateCalendarDefinition({...custom,leapDays:[{name:'Leap',afterMonth:3,every:4}]}));
});
