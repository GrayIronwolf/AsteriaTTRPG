import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultDiceAppearance,validateDiceAppearance,EYE_TYPES,EYE_PUPILS,EYE_MOTION,BLINK,TRANSPARENCY} from '../src/dice/diceAppearanceCatalogue.mjs';
import {buildWatcherDiceSet,WATCHER_SWIRL_PRESETS,WATCHER_IRIS_SWATCHES,WATCHER_SCLERA_SWATCHES,WATCHER_RESIN_SWATCHES,watcherVisualQuality,watcherReactionForRecord} from '../src/dice/watcherDiceDesign.mjs';
import {createWatcherEyeRig,applyWatcherGelShell} from '../src/dice/watcherEyeRig.mjs';
import {CORE_DICE_TYPES} from '../src/dice/coreDiceDesigns.mjs';
import {prepareCoreDesigns,releaseCoreDesigns} from '../src/dice/coreDiceRegistry.mjs';
import {diceResult} from '../src/state/diceRollModel.mjs';
import {prepareAsteriaDicePreview} from '../src/dice/openDiceAdapter.mjs';
import * as THREE from 'three';

test('Watcher defaults create a validated style separate from Familiar',()=>{
  const a=validateDiceAppearance(defaultDiceAppearance('dice-watcher'));
  assert.equal(a.special.kind,'watcher');
  assert.equal(a.special.eyeType,'eldritch');
  assert.equal(a.special.swirl,'aurora');
  assert.equal(a.special.irisColor,'#43AEC2');
  assert.equal(a.special.motion,'subtle');
  assert.equal(a.special.blink,'normal');
});
test('Eye type, pupil shape, blink and motion catalogues are complete',()=>{
  assert.equal(EYE_TYPES.length,6);assert.equal(EYE_PUPILS.length,5);
  assert.equal(EYE_MOTION.length,4);assert.equal(BLINK.length,4);
  assert.equal(TRANSPARENCY.length,4);
  assert.equal(WATCHER_SWIRL_PRESETS.length,6);
  assert.equal(WATCHER_IRIS_SWATCHES.length,12);
  assert.equal(WATCHER_SCLERA_SWATCHES.length,6);
  assert.equal(WATCHER_RESIN_SWATCHES.length,16);
});
test('All seven Watcher die types build valid PBR styles',()=>{
  const a=defaultDiceAppearance('dice-watcher');
  for(const dieType of CORE_DICE_TYPES){
    const style=buildWatcherDiceSet(a,{dieType,id:'asteria-watcher-'+dieType});
    assert.equal(style.name,'Watcher Dice');
    assert.equal(style.family,'glass');
    assert.equal(style.numeral.style,'engraved');
    assert.ok(style.body.clearcoat>0);
    assert.ok(style.body.texture.kind);
  }
  assert.throws(()=>buildWatcherDiceSet(a,{dieType:'d7'}),/Unsupported/);
  assert.throws(()=>buildWatcherDiceSet(defaultDiceAppearance('dice-familiar')),/Watcher/);
});
test('Distinct swirl and resin settings change PBR definitions',()=>{
  const a=defaultDiceAppearance('dice-watcher');
  const styles=WATCHER_SWIRL_PRESETS.map(swirl=>
    buildWatcherDiceSet({...a,special:{...a.special,swirl}}));
  assert.ok(new Set(styles.map(s=>JSON.stringify(s.body.texture))).size===6);
});
test('Invalid custom eye colours and pupil values are rejected',()=>{
  const a=defaultDiceAppearance('dice-watcher');
  for(const special of [{irisColor:'url(http://evil)'},{scleraColor:'red'},
    {pupil:'bad'},{blink:'very frequent'},{motion:'superfast'},{swirl:'broken'},
    {cursorTracking:'true'}]){
    assert.throws(()=>validateDiceAppearance({...a,special:{...a.special,...special}}));
  }
});
test('Watcher pre-Phase-3.4 records without swirl stay valid',()=>{
  const a=defaultDiceAppearance('dice-watcher');
  const {swirl,...old}=a.special;
  assert.equal(validateDiceAppearance({...a,special:old}).special.swirl,'aurora');
});
test('Visual quality respects reduced motion and low-memory mobile',()=>{
  assert.equal(watcherVisualQuality({}).animated,true);
  assert.equal(watcherVisualQuality({reducedMotion:true}).animated,false);
  assert.equal(watcherVisualQuality({mobile:true}).animated,false);
  assert.equal(watcherVisualQuality({deviceMemory:2}).quality,'balanced');
  assert.equal(watcherVisualQuality({visibleDice:18}).eyeLimit,4);
});
test('Eye rig is a distinct mesh hierarchy and supports disposal',()=>{
  const a=defaultDiceAppearance('dice-watcher');
  const rig=createWatcherEyeRig(THREE,a);
  assert.ok(rig.group instanceof THREE.Group);
  assert.ok(rig.eye instanceof THREE.Group);
  assert.equal(rig.group.userData.asteriaWatcher,true);
  assert.equal(rig.eye.children.length>=3,true);
  rig.update(5,{pointer:{x:.5,y:-.2}});
  assert.ok(Number.isFinite(rig.eye.rotation.y));
  rig.update(7,{reducedMotion:true});
  assert.equal(rig.eye.scale.y,1);
  rig.dispose();rig.dispose();
  assert.equal(rig.state.disposed,true);
});
test('Six eye types and five pupil types alter geometry',()=>{
  const a=defaultDiceAppearance('dice-watcher');
  const rigs=EYE_TYPES.flatMap(eyeType=>EYE_PUPILS.map(pupil=>
    createWatcherEyeRig(THREE,{...a,special:{...a.special,eyeType,pupil}})));
  assert.equal(rigs.length,30);
  const pupilDims=new Set(rigs.map(r=>JSON.stringify(r.pupil.scale.toArray())));
  assert.equal(pupilDims.size,5);
  const eyeDims=new Set(rigs.map(r=>JSON.stringify(r.eye.children[0].scale.toArray())));
  assert.equal(eyeDims.size,6);
  rigs.forEach(r=>r.dispose());
});
test('Gel shell changes visual materials, not geometry',()=>{
  const a=defaultDiceAppearance('dice-watcher');
  const geom=new THREE.BoxGeometry(1,1,1),original=geom;
  const mat=new THREE.MeshPhysicalMaterial({roughness:.4,metalness:0});
  const mesh=new THREE.Mesh(geom,mat);
  const count=applyWatcherGelShell(mesh,a);
  assert.equal(count,1);assert.equal(mesh.geometry,original);
  assert.equal(mat.transparent,true);assert.ok(mat.opacity<1);
  assert.equal(mat.depthWrite,false);
  geom.dispose();mat.dispose();
});
test('All dice registrations remain isolated, Watcher can coexist with core and Familiar',()=>{
  const registry=new Map(),api={
    registerDiceSet(set){registry.set(set.id,set);},
    unregisterDiceSet(id){registry.delete(id);}
  };
  const w=prepareCoreDesigns(api,defaultDiceAppearance('dice-watcher'),'test-watcher');
  const f=prepareCoreDesigns(api,defaultDiceAppearance('dice-familiar'),'test-familiar');
  const c=prepareCoreDesigns(api,defaultDiceAppearance('dice-ruby'),'test-ruby');
  assert.equal(registry.size,21);
  assert.equal(registry.get(w.d20).name,'Watcher Dice');
  assert.equal(registry.get(f.d20).name,'Familiar Dice');
  assert.equal(registry.get(c.d20).name,'Ruby');
  releaseCoreDesigns(api,w);releaseCoreDesigns(api,f);releaseCoreDesigns(api,c);
  assert.equal(registry.size,0);
});
test('Critical reactions only use server-authoritative records',()=>{
  assert.equal(watcherReactionForRecord(null),'none');
  assert.equal(watcherReactionForRecord({natural:'natural-20',source:'local'}),'none');
  assert.equal(watcherReactionForRecord({natural:'natural-20',source:'server-digital'}),'success');
  assert.equal(watcherReactionForRecord({natural:'natural-1',source:'server-digital'}),'failure');
  assert.equal(watcherReactionForRecord({natural:'',source:'server-digital'}),'none');
});
test('Eye animation and appearance never modify official roll totals',()=>{
  const record=diceResult({pool:[{sides:20,count:1}],modifier:5,label:'Eye'},()=>20,
    1730000000000,'watcher-3-4');
  const initial=prepareAsteriaDicePreview(record);
  const a=defaultDiceAppearance('dice-watcher');
  const rig=createWatcherEyeRig(THREE,a);
  rig.update(4,{reaction:watcherReactionForRecord(record)});
  assert.equal(record.total,25);
  assert.equal(record.natural,'natural-20');
  assert.deepEqual(prepareAsteriaDicePreview(record),initial);
  rig.dispose();
});
test('Existing React and Firebase architecture is reused',()=>{
  const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const picker=read('src/dice/CoreDicePicker.jsx');
  const tray=read('src/dice/AsteriaDiceTray.jsx');
  const workspace=read('src/dashboards/AdvancedDiceWorkspace.jsx');
  assert.match(picker,/WatcherDiceControls/);
  assert.match(picker,/createWatcherEyeRig/);
  assert.match(tray,/createWatcherEyeRig/);
  assert.match(tray,/applyWatcherGelShell/);
  assert.match(workspace,/firebaseService\.advancedDiceAction/);
  assert.match(workspace,/subscribeDiceWorkspace/);
  assert.doesNotMatch(workspace+tray,/Math\.random/);
});
