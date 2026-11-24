import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TOWER_FAMILIES,TOWER_VARIATIONS,TOWER_LIGHTING,TOWER_QUALITY,TOWER_TRIMS,
 TOWER_MOTIFS,defaultDiceTowerAppearance,validateDiceTowerAppearance,
 pairedDiceTrayForTower,TOWER_MAX_VISIBLE_DICE} from '../src/dice/diceTowerCatalogue.mjs';
import {diceTowerLayout,diceTowerSpawn,inspectDiceTowerRecording}
 from '../src/dice/diceTowerLayout.mjs';
import {trayOutline} from '../src/dice/diceTrayGeometry.mjs';
import {defaultDiceTrayAppearance} from '../src/dice/diceTrayCatalogue.mjs';
import {castleTowerLayout} from '../src/dice/castleDiceTowerGeometry.mjs';
test('approved six families and three named physical variations',()=>{
 assert.deepEqual(TOWER_FAMILIES.map(x=>x.id),[
  'tower-castle','tower-dragon','tower-wizard','tower-dwarven-forge',
  'tower-nature','tower-celestial']);
 assert.deepEqual(TOWER_VARIATIONS,['standard','detailed','grand']);
 assert.equal(TOWER_LIGHTING.length,6);assert.equal(TOWER_TRIMS.length,8);
 assert.equal(TOWER_MOTIFS.length,12);assert.equal(TOWER_QUALITY.length,3);
 assert.equal(TOWER_MAX_VISIBLE_DICE,6);
});
test('all eighteen tower appearances and six tray pairs validate strictly',()=>{
 const ids=new Set();
 for(const family of TOWER_FAMILIES)for(const variation of TOWER_VARIATIONS){
  const config=validateDiceTowerAppearance({...defaultDiceTowerAppearance(family.id),variation});
  assert.equal(config.designId,family.id);
  assert.ok(pairedDiceTrayForTower(config).designId);
  ids.add(family.id+':'+variation);
 }
 assert.equal(ids.size,18);
});
test('tower editor rejects unknown fields, unsafe colours, forged materials and versions',()=>{
 const a=defaultDiceTowerAppearance();
 assert.throws(()=>validateDiceTowerAppearance({...a,ownerUid:'other'}),/unsupported/);
 assert.throws(()=>validateDiceTowerAppearance({...a,version:2}),/version/);
 assert.throws(()=>validateDiceTowerAppearance({...a,baseColor:'red'}),/HEX/);
 assert.throws(()=>validateDiceTowerAppearance({...a,variation:'gigantic'}),/variation/);
 assert.throws(()=>validateDiceTowerAppearance({...a,quality:'unlimited'}),/quality/);
 assert.throws(()=>validateDiceTowerAppearance({...a,pairedTray:'fake'}),/paired tray/);
 assert.throws(()=>defaultDiceTowerAppearance('fake'),/Unknown/);
 assert.throws(()=>validateDiceTowerAppearance([]),/plain/);
 assert.equal(validateDiceTowerAppearance({...a,baseColor:'#abcdef'}).baseColor,'#ABCDEF');
});
test('all eighteen physical layouts have real baffles, ramp, guides and safe spawn',()=>{
 const outline=trayOutline(defaultDiceTrayAppearance());
 const signatures=new Set();
 for(const family of TOWER_FAMILIES){
  for(const variation of TOWER_VARIATIONS){
   const config={...defaultDiceTowerAppearance(family.id),variation};
   const layout=diceTowerLayout(outline,config);
   assert.equal(layout.boxes.length,10);
   assert.equal(layout.maxRollingDice,6);
   assert.equal(layout.boxes.filter(b=>b.role==='baffle').length,3);
   assert.equal(layout.boxes.filter(b=>b.role==='ramp').length,1);
   assert.ok(layout.boxes.every(b=>b.w>0&&b.h>0&&b.d>0));
   const seed={xPos:.43,zPos:.31,yPos:.61,vel:[.52,.25,.8]};
   const spawn=diceTowerSpawn(seed,layout);
   assert.ok(spawn.y>9.5&&spawn.y<11.2);
   assert.ok(Math.abs(spawn.x-layout.origin.x)<layout.innerHalfX);
   signatures.add(JSON.stringify(layout.boxes));
  }
 }
 assert.equal(signatures.size,18,'Every family and variant must alter real collider geometry');
 // Castle STANDARD colliders must remain exactly as Phase 3.8 tuned them.
 assert.deepEqual(diceTowerLayout(outline,defaultDiceTowerAppearance()).boxes,
  castleTowerLayout(outline).boxes);
});
test('physical trajectory watcher binds family/variation to actual Cannon recording',()=>{
 const layout=diceTowerLayout(trayOutline(defaultDiceTrayAppearance()),
  {...defaultDiceTowerAppearance('tower-dragon'),variation:'grand'});
 const states=new Float32Array(4*14);
 [[layout.origin.x,10.5,layout.origin.z],[layout.origin.x,7.8,layout.origin.z],
  [layout.origin.x,4.8,layout.origin.z],[layout.exitX+2,.55,layout.origin.z]]
  .forEach((p,i)=>p.forEach((n,j)=>{states[i*14+j]=n;}));
 const outcome=inspectDiceTowerRecording(layout,{bodies:1,steps:4,states});
 assert.equal(outcome.towerId,'tower-dragon');
 assert.equal(outcome.variation,'grand');assert.equal(outcome.exitComplete,true);
});

test('shared adapter owns physics and all six visible meshes use physical box definitions',()=>{
 const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const scene=get('src/dice/diceTowerScene.mjs'),visuals=get('src/dice/diceTowerVisuals.mjs'),
  wrapper=get('src/dice/castleDiceTowerScene.mjs');
 assert.match(scene,/engine\.world\.addBody/);
 assert.match(scene,/engine\._predict=async function/);
 assert.match(scene,/inspectDiceTowerRecording/);
 assert.match(scene,/engine\._applyDiePhysics=function/);
 assert.match(scene,/engine\.world\.gravity\.copy\(previousGravity\)/);
 assert.match(wrapper,/attachDiceTower/);
 assert.match(visuals,/segment\.role/);
 assert.match(visuals,/physicalBoxId/);
 for(const style of ['castle','dragon','wizard','forge','nature','celestial'])
  assert.match(visuals,new RegExp("family.style==='"+style+"'"));
 assert.doesNotMatch(scene+visuals,/new DiceRoller|new CANNON\.World|firebaseService|Math\.random/);
 const surface=get('src/dice/AsteriaDiceTray.jsx');
 assert.match(surface,/experimentalTowerAppearance/);
 assert.match(surface,/attachDiceTower/);
 assert.match(surface,/towerEvidence\?\.exitComplete/);
});


test('a mismatched physical face is retried only as a visual throw, never a second official roll',()=>{
 const surface=readFileSync(new URL('../src/dice/AsteriaDiceTray.jsx',import.meta.url),'utf8');
 const rollEffect=surface.slice(surface.indexOf('const run=async()=>'),surface.indexOf('Promise.resolve(run()).then'));
 assert.match(rollEffect,/if\(towerActive\)\s*\{\s*let retries=0/);
 assert.match(rollEffect,/while\(!cancelled&&retries<3\)/);
 assert.match(rollEffect,/matchesAsteriaDicePreview\(prepared,observed\)/);
 assert.match(rollEffect,/towerRef\.current\?\.getEvidence\(\)\?\.exitComplete===true/);
 assert.match(rollEffect,/await engine\.reset\(\)/);
 assert.match(rollEffect,/await engine\.roll\(diceToRoll\)/);
 assert.doesNotMatch(rollEffect,/firebaseService|advancedDiceAction|setStatus\('settled'\)/);
 assert.match(surface,/setStatus\(match&&physical\?'settled':'mismatch'\)/);
});
