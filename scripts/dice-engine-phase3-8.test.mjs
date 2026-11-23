import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {castleTowerLayout,castleTowerSpawn,inspectCastleTowerRecording,
 CASTLE_TOWER_MAX_MESHES,CASTLE_TOWER_STATE_SIZE} from '../src/dice/castleDiceTowerGeometry.mjs';
import {trayOutline} from '../src/dice/diceTrayGeometry.mjs';
import {defaultDiceTrayAppearance} from '../src/dice/diceTrayCatalogue.mjs';
import {diceResult} from '../src/state/diceRollModel.mjs';
import {prepareAsteriaDicePreview} from '../src/dice/openDiceAdapter.mjs';

test('Castle Tower has ten genuine matching collision and visual boxes',()=>{
 const layout=castleTowerLayout(trayOutline(defaultDiceTrayAppearance()));
 assert.equal(layout.id,'castle');assert.equal(layout.boxes.length,10);
 assert.equal(layout.boxes.filter(b=>b.role==='baffle').length,3);
 assert.equal(layout.boxes.filter(b=>b.role==='ramp').length,1);
 assert.equal(layout.boxes.filter(b=>b.role==='guide').length,2);
 assert.ok(layout.portal.maxY>2);
 assert.ok(layout.exitX>layout.origin.x);
 assert.equal(CASTLE_TOWER_MAX_MESHES,6);
 assert.equal(CASTLE_TOWER_STATE_SIZE,14);
 for(const b of layout.boxes){
  assert.ok(b.w>0&&b.h>0&&b.d>0&&Number.isFinite(b.x)&&Number.isFinite(b.y)&&Number.isFinite(b.z));
 }
});
test('spawn is inside actual chute and deterministically different per seed',()=>{
 const layout=castleTowerLayout(trayOutline(defaultDiceTrayAppearance()));
 const seed=n=>({xPos:n,yPos:n,zPos:n,vel:[n,n,n]});
 const start=castleTowerSpawn(seed(0),layout),end=castleTowerSpawn(seed(.99),layout);
 assert.ok(start.y>9.5&&end.y>9.5);
 assert.ok(start.x>layout.origin.x-layout.innerHalfX&&end.x<layout.origin.x+layout.innerHalfX);
 assert.ok(start.z>layout.origin.z-layout.innerHalfZ&&end.z<layout.origin.z+layout.innerHalfZ);
 assert.notDeepEqual(start,end);
 assert.throws(()=>castleTowerSpawn({},layout),/Invalid/);
});
test('recorded physical states measure actual baffle traversal and exit',()=>{
 const layout=castleTowerLayout(trayOutline(defaultDiceTrayAppearance()));
 const states=new Float32Array(5*CASTLE_TOWER_STATE_SIZE);
 const points=[[layout.origin.x,10.5,layout.origin.z],
  [layout.origin.x,8,layout.origin.z],[layout.origin.x,5,layout.origin.z],
  [layout.origin.x,3,layout.origin.z],[layout.exitX+1,.55,layout.origin.z]];
 points.forEach(([x,y,z],i)=>{states[i*14]=x;states[i*14+1]=y;states[i*14+2]=z;});
 const result=inspectCastleTowerRecording(layout,{states,steps:5,bodies:1});
 assert.equal(result.entered,1);assert.equal(result.exited,1);
 assert.equal(result.upper,1);assert.equal(result.middle,1);assert.equal(result.lower,1);
 assert.equal(result.exitComplete,true);
 assert.equal(inspectCastleTowerRecording(layout,{states,steps:5,bodies:2}),null);
});
test('112 predetermined authoritative samples cover all seven die types and criticals',()=>{
 const sides=[4,6,8,10,12,20,100],records=[];
 for(let n=0;n<112;n++){
  const die=sides[n%sides.length],face=n%17===0?1:n%19===0?die:(n*13)%die+1;
  const record=diceResult({pool:[{sides:die,count:1}],modifier:n%7-3,label:'Castle '+n},
   ()=>face,1730000000000+n,'castle-sample-'+String(n).padStart(4,'0'));
  const prepared=prepareAsteriaDicePreview(record);
  assert.equal(prepared.mode,'3d');
  assert.equal(record.results[0].faces[0],face);
  assert.equal(prepared.expectedFaces.length,die===100?2:1);
  assert.equal(record.total,face+(n%7-3));
  records.push(record);
 }
 assert.equal(records.length,112);
 assert.equal(new Set(records.map(r=>r.pool[0].sides)).size,7);
 const natural=diceResult({pool:[{sides:20,count:1}],modifier:0,label:''},
  ()=>20,1730000000000,'castle-natural-20');
 const failure=diceResult({pool:[{sides:20,count:1}],modifier:0,label:''},
  ()=>1,1730000000000,'castle-natural-01');
 assert.equal(natural.natural,'natural-20');assert.equal(failure.natural,'natural-1');
});
test('tower adds static colliders to the same engine and restores original methods',()=>{
 const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const s=get('src/dice/castleDiceTowerScene.mjs');
 assert.match(s,/new CANNON\.Body/);
 assert.match(s,/engine\.world\.addBody/);
 assert.match(s,/engine\._applyDiePhysics=function/);
 assert.match(s,/engine\._startReplay=function/);
 assert.match(s,/engine\._applyDiePhysics=applyBefore/);
 assert.match(s,/inspectCastleTowerRecording/);
 assert.doesNotMatch(s,/new CANNON\.World|new DiceRoller|firebaseService|Math\.random/);
});
