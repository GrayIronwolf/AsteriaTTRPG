/**
 * Physical Dice Tower (Phase 3.8), not a CSS decorative overlay.
 * THREE meshes and static Cannon bodies use the same box dimensions, same
 * engine, same prediction worker. The existing Firebase roll is immutable.
 */
import * as CANNON from 'cannon-es';
import {diceTowerLayout,diceTowerSpawn,inspectDiceTowerRecording} from './diceTowerLayout.mjs';
import {validateDiceTowerAppearance,defaultDiceTowerAppearance} from './diceTowerCatalogue.mjs';
import {buildDiceTowerVisuals} from './diceTowerVisuals.mjs';

export function attachDiceTower(engine,outline,input=defaultDiceTowerAppearance()){
 if(!engine?.world||!engine?.scene||!engine?.diceMaterial||!engine?._applyDiePhysics||
    !engine?._startReplay)throw Error('The live dice engine must be ready for a physical tower.');
 const config=validateDiceTowerAppearance(input);
 const layout=diceTowerLayout(outline,config);
 // An inclined chute feeds dice through the gate without scripted teleports.
 // This gravity vector is shared by prediction and replay and restored on dispose.
 const previousGravity=engine.world.gravity.clone();
 engine.world.gravity.x=8;
 const visuals=buildDiceTowerVisuals(layout,config);
 const group=visuals.group;
 const colliders=[],material=new CANNON.Material('asteria-tower-physics');
 const contact=new CANNON.ContactMaterial(engine.diceMaterial,material,
  {friction:.20,restitution:.31});
 engine.world.addContactMaterial(contact);
 for(const box of layout.boxes){
  const body=new CANNON.Body({mass:0,material,shape:new CANNON.Box(
   new CANNON.Vec3(box.w/2,box.h/2,box.d/2))});
  body.position.set(box.x,box.y,box.z);
  if(box.angleZ)body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,0,1),box.angleZ);
  body.asteriaTowerPart=box.id;
  engine.world.addBody(body);colliders.push(body);
 }
 engine.scene.add(group);
 const applyBefore=engine._applyDiePhysics,replayBefore=engine._startReplay;
 const predictBefore=engine._predict,finishBefore=engine._finishReplay;
 let evidence=null,attempts=0,cleaned=false,handThrow=false;
 // Reject hidden physics candidates that never leave the tower. The worker
 // really simulates each candidate; none creates a new official Firebase roll.
 engine._predict=async function(diceConfig){
  if(handThrow)return predictBefore.call(this,diceConfig);
  this.world.gravity.x=8;
  // Larger percentile pairs and d4 can need additional genuine Cannon throws.
  // The acceptance gate still demands a real exit; no fake exit or value changes.
  const maxAttempts=48;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   const candidate=await predictBefore.call(this,diceConfig);
   attempts=attempt;
   const outcome=inspectDiceTowerRecording(layout,candidate.recording);
   if(outcome?.exitComplete){
     // Retain the genuine worker trajectory even when Open Dice chooses a
     // live-world playback because older bodies are still disappearing.
     evidence=outcome;
     return candidate;
   }
  }
  throw Error('Dice Tower physics could not complete an exit within forty-eight physical attempts.');
 };
 // Guide the throw through the tower. Once the recording ends on the tray,
 // allow the actual bodies to settle with the tray's usual vertical gravity.
 engine._finishReplay=function(...args){
  const replay=this._replay;
  const complete=Boolean(replay&&replay.cursor>=replay.recording.steps);
  const result=finishBefore.apply(this,args);
  if(complete&&!handThrow)this.world.gravity.copy(previousGravity);
  return result;
 };
 engine._applyDiePhysics=function(die,seed){
  applyBefore.call(this,die,seed);
  const spawn=diceTowerSpawn(seed,layout);
  die.body.position.set(spawn.x,spawn.y,spawn.z);
  // Small tetrahedra have a higher tendency to settle on a baffle edge;
  // a faster downward release keeps the physical path moving.
  die.body.velocity.set(spawn.vx+(die.type==='d4'?1.4:0),
    die.type==='d4'?-7:-.65,spawn.vz);
  die.body.angularVelocity.scale(.60,die.body.angularVelocity);
  if(die.mesh){die.mesh.position.copy(die.body.position);die.mesh.quaternion.copy(die.body.quaternion);}
 };
 engine._startReplay=function(recording,dice){
  // This recording was generated from the SAME Cannon bodies including
  // the static tower; sample actual physics, not a visual animation estimate.
  if(!handThrow)evidence=inspectDiceTowerRecording(layout,recording);
  return replayBefore.call(this,recording,dice);
 };
 engine.renderer?.render(engine.scene,engine.camera);
 return {layout,group,colliders,config,previewMode:'actual-physics',
  getEvidence:()=>evidence,getAttempts:()=>attempts,
  suspendGuidance(){
   const restoreGravity=engine.world.gravity.clone();
   handThrow=true;
   engine.world.gravity.copy(previousGravity);
   return ()=>{
    handThrow=false;
    if(!cleaned)engine.world.gravity.copy(restoreGravity);
   };
  },
  dispose(){
   if(cleaned)return;cleaned=true;
   engine._applyDiePhysics=applyBefore;engine._startReplay=replayBefore;
   engine._predict=predictBefore;engine._finishReplay=finishBefore;
   engine.world.gravity.copy(previousGravity);
   for(const body of colliders)engine.world.removeBody(body);
   engine.world.removeContactMaterial(contact);
   visuals.dispose();
   engine.renderer?.render(engine.scene,engine.camera);
  }};
}
