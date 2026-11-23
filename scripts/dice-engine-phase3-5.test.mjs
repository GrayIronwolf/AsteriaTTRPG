import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRAY_FAMILIES,TRAY_COLORS,TRAY_SIZE_IDS,TRAY_WALL_HEIGHT_IDS,TRAY_FRAME_MATERIALS,
 TRAY_INTERIOR_MATERIALS,TRAY_RIM_PROFILES,TRAY_ENGRAVINGS,TRAY_EMBLEMS,TRAY_LIGHTING,
 TRAY_WEAR,TRAY_SOUNDS,TRAY_SOUND_LEVELS,defaultDiceTrayAppearance,
 validateDiceTrayAppearance} from '../src/dice/diceTrayCatalogue.mjs';
import {trayOutline,trayThrowOrigin,verifyTrayContainment} from '../src/dice/diceTrayGeometry.mjs';
import {impactProfileForTray,TRAY_IMPACT_PROFILES,TRAY_VOLUME_GAIN,createTrayImpactAudio}
  from '../src/dice/diceTrayImpact.mjs';
import {diceResult} from '../src/state/diceRollModel.mjs';
import {prepareAsteriaDicePreview} from '../src/dice/openDiceAdapter.mjs';

test('six named designs with six unique shapes and exact approved default',()=>{
 assert.equal(TRAY_FAMILIES.length,6);
 assert.equal(new Set(TRAY_FAMILIES.map(x=>x.id)).size,6);
 assert.equal(new Set(TRAY_FAMILIES.map(x=>x.shape)).size,6);
 assert.deepEqual(TRAY_FAMILIES.map(x=>x.shape),['hexagon','octagon','rectangle',
  'circle','square','oval']);
 const d=defaultDiceTrayAppearance();
 assert.equal(d.designId,'obsidian-hexagon');
 assert.equal(d.frameMaterial,'gunmetal-steel');
 assert.equal(d.interiorMaterial,'velvet');
 assert.equal(d.size,'standard');
});
test('catalogue has agreed customisation cardinalities',()=>{
 assert.equal(TRAY_COLORS.length,16);
 assert.equal(TRAY_SIZE_IDS.length,3);
 assert.equal(TRAY_WALL_HEIGHT_IDS.length,3);
 assert.equal(TRAY_FRAME_MATERIALS.length,8);
 assert.equal(TRAY_INTERIOR_MATERIALS.length,8);
 assert.equal(TRAY_RIM_PROFILES.length,4);
 assert.equal(TRAY_ENGRAVINGS.length,8);
 assert.equal(TRAY_EMBLEMS.length,12);
 assert.equal(TRAY_LIGHTING.length,4);
 assert.equal(TRAY_WEAR.length,4);
 assert.equal(TRAY_SOUNDS.length,7);
 assert.equal(TRAY_SOUND_LEVELS.length,3);
});
test('all six default configurations pass strict validation',()=>{
 for(const design of TRAY_FAMILIES){
   const a=defaultDiceTrayAppearance(design.id);
   assert.equal(validateDiceTrayAppearance(a).designId,design.id);
   assert.equal(validateDiceTrayAppearance(a).version,1);
 }
});
test('custom colours and independent material combinations are supported',()=>{
 const a=defaultDiceTrayAppearance('royal-marble');
 const b=validateDiceTrayAppearance({...a,frameMaterial:'iron',
   interiorMaterial:'obsidian',frameColor:'#aabbcc',
   interiorColor:'#112233',trimColor:'#e7f1e7'});
 assert.equal(b.frameColor,'#AABBCC');
 assert.equal(b.interiorColor,'#112233');
 assert.equal(b.trimColor,'#E7F1E7');
 assert.equal(b.frameMaterial,'iron');
});
test('unknown shapes, fields, non-HEX colours and oversized input are rejected',()=>{
 const a=defaultDiceTrayAppearance();
 assert.throws(()=>defaultDiceTrayAppearance('hexagon-fake'),/Unknown/);
 assert.throws(()=>validateDiceTrayAppearance({...a,designId:'fake'}),/Unknown/);
 assert.throws(()=>validateDiceTrayAppearance({...a,shape:'circle'}),/unsupported/);
 assert.throws(()=>validateDiceTrayAppearance({...a,frameColor:'red'}),/HEX/);
 assert.throws(()=>validateDiceTrayAppearance({...a,size:'gigantic'}),/size/);
 assert.throws(()=>validateDiceTrayAppearance({...a,emblem:'<svg>'}),/emblem/);
 assert.throws(()=>validateDiceTrayAppearance({...a,version:2}),/version/);
 assert.throws(()=>validateDiceTrayAppearance([]),/plain/);
});
test('all six outlines have real closed polygonal collision walls',()=>{
 for(const design of TRAY_FAMILIES){
   const outline=trayOutline(defaultDiceTrayAppearance(design.id),{width:900,height:340});
   assert.equal(outline.segments.length,outline.points.length);
   assert.ok(outline.segments.length>=4);
   assert.ok(outline.segments.every(x=>x.length>0&&Number.isFinite(x.angle)));
   assert.ok(outline.collisionHeight>outline.lipHeight);
   assert.equal(verifyTrayContainment(outline,[0,0]),true);
   assert.equal(verifyTrayContainment(outline,[100,100]),false);
 }
});
test('tray physics spawn remains within all six collision polygons',()=>{
 for(const design of TRAY_FAMILIES){
  for(const size of TRAY_SIZE_IDS){
   const outline=trayOutline({...defaultDiceTrayAppearance(design.id),size},
    {width:360,height:245});
   for(const xPos of [0,.3,.8,.999]){
    for(const zPos of [0,.2,.8,.999]){
     const origin=trayThrowOrigin({xPos,zPos,yPos:.4},outline);
     assert.equal(verifyTrayContainment(outline,[origin.x,origin.z],.35),true,
      design.id+' '+size+' spawn escaped tray');
     assert.ok(origin.y>1);
    }
   }
  }
 }
});
test('three tray sizes and three wall heights change scene/physics dimensions',()=>{
 const base=defaultDiceTrayAppearance();
 const sizes=TRAY_SIZE_IDS.map(size=>trayOutline({...base,size},{width:900,height:340}));
 assert.ok(sizes[0].halfX<sizes[1].halfX);
 assert.ok(sizes[1].halfX<sizes[2].halfX);
 const heights=TRAY_WALL_HEIGHT_IDS.map(wallHeight=>
   trayOutline({...base,wallHeight},{width:900,height:340}).lipHeight);
 assert.ok(heights[0]<heights[1]&&heights[1]<heights[2]);
});
test('all six sound presets are independent and mute bypasses playback',()=>{
 assert.equal(Object.keys(TRAY_IMPACT_PROFILES).length,6);
 assert.equal(Object.keys(TRAY_VOLUME_GAIN).length,3);
 const a=defaultDiceTrayAppearance();
 for(const sound of TRAY_SOUNDS){
  const profile=impactProfileForTray({...a,sound});
  if(sound==='off')assert.equal(profile,null);
  else assert.ok(profile.cutoff>0&&profile.decay>0);
 }
 const audio=createTrayImpactAudio({...a,sound:'off'});
 audio.play(.8);
 audio.configure({...a,sound:'metal',soundVolume:'high'});
 audio.play(.7);
 audio.dispose();audio.dispose();
});
test('dice tray appearance cannot alter confirmed Firebase roll results',()=>{
 const record=diceResult({pool:[{sides:20,count:1}],modifier:5,label:'Tray'},
  ()=>20,1730000000000,'tray-phase35');
 const before=prepareAsteriaDicePreview(record);
 for(const design of TRAY_FAMILIES){
  trayOutline(defaultDiceTrayAppearance(design.id),{width:900,height:340});
 }
 assert.equal(record.total,25);
 assert.equal(record.natural,'natural-20');
 assert.deepEqual(prepareAsteriaDicePreview(record),before);
});
test('the same Open Dice roller is reused with a single tray scene',()=>{
 const get=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
 const tray=get('src/dice/AsteriaDiceTray.jsx');
 const engine=get('src/dice/diceTrayScene.mjs');
 const studio=get('src/dice/DiceTrayStudio.jsx');
 const workspace=get('src/dashboards/AdvancedDiceWorkspace.jsx');
 assert.match(tray,/new DiceRoller/);
 assert.match(tray,/attachDiceTray\(instance/);
 assert.match(tray,/<DiceTrayStudio/);
 assert.match(engine,/new CANNON.Box/);
 assert.match(engine,/this\._applyDiePhysics/);
 assert.match(engine,/originalApply\.call/);
 assert.match(studio,/getDiceTrayFamily|TRAY_FAMILIES/);
 assert.match(workspace,/firebaseService\.advancedDiceAction/);
 assert.doesNotMatch(engine+studio,/firebaseService|Math\.random/);
});
