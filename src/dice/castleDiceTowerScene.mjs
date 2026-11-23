/**
 * Physical Castle Tower (Phase 3.8), not a CSS decorative overlay.
 * THREE meshes and static Cannon bodies use the same box dimensions, same
 * engine, same prediction worker. The existing Firebase roll is immutable.
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {castleTowerLayout,castleTowerSpawn,
  inspectCastleTowerRecording} from './castleDiceTowerGeometry.mjs';

function stoneTexture(){
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
 const ctx=canvas.getContext('2d');if(!ctx)return null;
 ctx.fillStyle='#55677b';ctx.fillRect(0,0,256,256);
 let seed=512309;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<1200;i++){
  const x=random()*256,y=random()*256,w=random()*13+2;
  ctx.fillStyle=random()>.5?'rgba(220,228,235,.085)':'rgba(7,14,23,.13)';
  ctx.fillRect(x,y,w,random()*2.5+1);
 }
 // Staggered stone coursing and mortar joints.
 ctx.lineWidth=2.2;ctx.strokeStyle='rgba(9,22,37,.32)';
 for(let row=0;row<8;row++){
  const y=row*32;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();
  for(let x=(row%2)*32;x<256;x+=64){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+32);ctx.stroke();}
 }
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(2,2);return map;
}
const createMaterial=(color,metalness,roughness,more={})=>
 new THREE.MeshPhysicalMaterial({color,metalness,roughness,...more});
function meshFromBox(box,material){
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(box.w,box.h,box.d),material);
 mesh.position.set(box.x,box.y,box.z);mesh.rotation.z=box.angleZ||0;
 mesh.castShadow=true;mesh.receiveShadow=true;mesh.name='asteria-castle-'+box.id;return mesh;
}
export function attachCastleDiceTower(engine,outline){
 if(!engine?.world||!engine?.scene||!engine?.diceMaterial||!engine?._applyDiePhysics||
    !engine?._startReplay)throw Error('The live dice engine must be ready for a physical tower.');
 const layout=castleTowerLayout(outline);
 // An inclined chute feeds dice through the gate without scripted teleports.
 // This gravity vector is shared by prediction and replay and restored on dispose.
 const previousGravity=engine.world.gravity.clone();
 engine.world.gravity.x=8;
 const matStone=createMaterial('#ffffff',.13,.83,{map:stoneTexture(),clearcoat:.12});
 const matSteel=createMaterial('#455769',.88,.31,{clearcoat:.28});
 const matGold=createMaterial('#bda06a',.82,.3,{emissive:'#493115',emissiveIntensity:.11});
 const matRamp=createMaterial('#273b4c',.67,.38,{clearcoat:.22});
 const mats=[matStone,matSteel,matGold,matRamp];
 const group=new THREE.Group();group.name='asteria-castle-interactive-tower';
 const colliders=[],material=new CANNON.Material('asteria-castle-physics');
 const contact=new CANNON.ContactMaterial(engine.diceMaterial,material,
  {friction:.20,restitution:.31});
 engine.world.addContactMaterial(contact);
 for(const box of layout.boxes){
  const visual=meshFromBox(box,box.role==='wall'?matStone:
   box.role==='baffle'?matSteel:box.role==='ramp'?matRamp:matGold);
  group.add(visual);
  const body=new CANNON.Body({mass:0,material,shape:new CANNON.Box(
   new CANNON.Vec3(box.w/2,box.h/2,box.d/2))});
  body.position.set(box.x,box.y,box.z);
  if(box.angleZ)body.quaternion.setFromAxisAngle(new CANNON.Vec3(0,0,1),box.angleZ);
  body.asteriaTowerPart=box.id;
  engine.world.addBody(body);colliders.push(body);
 }
 // Crenellations, iron bands, corner buttresses and a warm inner lantern,
 // all decorative and outside the chute. No invisible fake solid roof.
 const {x,z}=layout.origin;
 for(const side of [-1,1]){
  for(const row of [-1,1]){
   const base=new THREE.Mesh(new THREE.CylinderGeometry(.28,.35,11.3,8),matStone);
   base.position.set(x+side*1.66,5.65,z+row*1.6);base.castShadow=true;
   group.add(base);
   const crown=new THREE.Mesh(new THREE.CylinderGeometry(.43,.36,.65,8),matGold);
   crown.position.set(x+side*1.66,11.45,z+row*1.6);group.add(crown);
  }
 }
 for(const s of [-1,1]){
  for(let i=0;i<4;i++){
   const tooth=new THREE.Mesh(new THREE.BoxGeometry(.64,.62,.52),matStone);
   tooth.position.set(x-1.7+i*1.08,11.48,z+s*1.65);group.add(tooth);
  }
 }
 const band=new THREE.Mesh(new THREE.TorusGeometry(1.25,.07,8,36,Math.PI),matGold);
 band.rotation.set(Math.PI/2,0,Math.PI/2);band.position.set(x+1.73,3.0,z);
 group.add(band);
 const lantern=new THREE.PointLight('#d9a75b',.66,6.1,2);
 lantern.position.set(x,7.9,z);group.add(lantern);
 engine.scene.add(group);
 const applyBefore=engine._applyDiePhysics,replayBefore=engine._startReplay;
 const predictBefore=engine._predict,finishBefore=engine._finishReplay;
 let evidence=null,attempts=0,cleaned=false;
 // Reject hidden physics candidates that never leave the tower. The worker
 // really simulates each candidate; none creates a new official Firebase roll.
 engine._predict=async function(diceConfig){
  const maxAttempts=16;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
   const candidate=await predictBefore.call(this,diceConfig);
   attempts=attempt;
   const outcome=inspectCastleTowerRecording(layout,candidate.recording);
   if(outcome?.exitComplete)return candidate;
  }
  throw Error('Castle Tower physics could not complete an exit within sixteen attempts.');
 };
 // The worker already simulated the throw until rest and recorded the true
 // final orientation. Stop any unrecorded late physical drift after replay,
 // instead of allowing angled feed gravity to alter the visible number.
 engine._finishReplay=function(...args){
  const replay=this._replay;
  const complete=Boolean(replay&&replay.cursor>=replay.recording.steps);
  const result=finishBefore.apply(this,args);
  if(complete){
   for(const die of replay.dice){
    if(!die?.body?.world)continue;
    die.body.velocity.setZero();die.body.angularVelocity.setZero();
    die.body.sleep();
   }
  }
  return result;
 };
 engine._applyDiePhysics=function(die,seed){
  applyBefore.call(this,die,seed);
  const spawn=castleTowerSpawn(seed,layout);
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
  evidence=inspectCastleTowerRecording(layout,recording);
  return replayBefore.call(this,recording,dice);
 };
 engine.renderer?.render(engine.scene,engine.camera);
 return {layout,group,colliders,previewMode:'actual-physics',
  getEvidence:()=>evidence,getAttempts:()=>attempts,
  dispose(){
   if(cleaned)return;cleaned=true;
   engine._applyDiePhysics=applyBefore;engine._startReplay=replayBefore;
   engine._predict=predictBefore;engine._finishReplay=finishBefore;
   engine.world.gravity.copy(previousGravity);
   for(const body of colliders)engine.world.removeBody(body);
   engine.world.removeContactMaterial(contact);
   group.removeFromParent();
   group.traverse(object=>{if(object.isMesh)object.geometry?.dispose();});
   for(const m of mats){m.map?.dispose();m.dispose();}
   engine.renderer?.render(engine.scene,engine.camera);
  }};
}
