/**
 * Phase 3.9 — six genuinely different Three.js PBR tower shells around one
 * audited Cannon collision chute. All decorative objects are outside the
 * collision path: no fake obstacles or unrecorded dice movement.
 */
import * as THREE from 'three';
import {validateDiceTowerAppearance,getDiceTowerFamily} from './diceTowerCatalogue.mjs';

const SURFACE={
 stone:{metalness:0,roughness:.82},walnut:{metalness:0,roughness:.68},
 iron:{metalness:.82,roughness:.48},'gunmetal-steel':{metalness:.91,roughness:.33},
 'polished-steel':{metalness:.91,roughness:.2},
 bronze:{metalness:.8,roughness:.33},silver:{metalness:.94,roughness:.22},
 gold:{metalness:.94,roughness:.23}
};
const WEAR={pristine:0,'lightly-worn':.045,'battle-worn':.12,ancient:.21};
function stoneMap(color,seed=1){
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
 const ctx=canvas.getContext('2d');
 if(!ctx)return null;
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,256,256);
 let key=seed+197401;
 const rand=()=>{key=(Math.imul(key,1664525)+1013904223)>>>0;return key/4294967296;};
 for(let i=0;i<1100;i++){
  const x=rand()*256,y=rand()*256;
  ctx.fillStyle=rand()>.53?'rgba(0,0,0,.11)':'rgba(255,255,255,.13)';
  ctx.fillRect(x,y,rand()*13+1,rand()*4+1);
 }
 ctx.strokeStyle='rgba(0,0,0,.17)';ctx.lineWidth=2;
 for(let row=0;row<8;row++){
  const y=row*32;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();
  for(let x=(row%2)*32;x<256;x+=64){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+32);ctx.stroke();}
 }
 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
 texture.repeat.set(2,3);texture.anisotropy=2;texture.name='asteria-tower-procedural-'+color;
 return texture;
}
function motifMap(motif,hex){
 if(motif==='none')return null;
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
 const ctx=canvas.getContext('2d');if(!ctx)return null;
 ctx.clearRect(0,0,256,256);ctx.strokeStyle=hex;ctx.fillStyle=hex;
 ctx.lineWidth=5;ctx.globalAlpha=.74;
 ctx.beginPath();ctx.arc(128,128,74,0,Math.PI*2);ctx.stroke();
 ctx.beginPath();ctx.arc(128,128,53,0,Math.PI*2);ctx.stroke();
 ctx.font='bold 82px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';
 const symbols={runes:'ᚨ',stars:'✦',scales:'◆',vines:'❧',filigree:'❦',
   knotwork:'✣',geometric:'⬡',raven:'◆',wolf:'◇',dragon:'♜',moon:'☾'};
 ctx.fillText(symbols[motif]||'✦',128,130);
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 return texture;
}
function material(color,spec={},extra={}){
 return new THREE.MeshPhysicalMaterial({color,...spec,...extra});
}
export function buildDiceTowerVisuals(layout,input){
 const config=validateDiceTowerAppearance(input),family=getDiceTowerFamily(config.designId);
 if(!layout?.boxes?.length)throw Error('A physical Dice Tower layout is required.');
 const group=new THREE.Group();group.name='asteria-physical-'+family.style+'-tower';
 group.userData={towerId:family.id,variation:config.variation,quality:config.quality,
  graphics:'pbr-geometry',collisionBoxes:layout.boxes.length};
 const map=stoneMap(config.baseColor,89+family.id.length);
 const base=material(config.baseColor,SURFACE[config.baseMaterial],
   {map,roughness:Math.min(1,SURFACE[config.baseMaterial].roughness+WEAR[config.wear])});
 const accent=material(config.accentColor,SURFACE[config.accentMaterial],
   {clearcoat:.22,roughness:Math.min(1,SURFACE[config.accentMaterial].roughness+WEAR[config.wear])});
 const glow=material(config.glowColor,{metalness:.22,roughness:.2},{
  emissive:config.glowColor,emissiveIntensity:config.lighting==='off'?0:.75});
 const dark=material('#101b27',{metalness:.34,roughness:.55});
 const cloth=material(config.accentColor,{metalness:0,roughness:.86},{side:THREE.DoubleSide});
 const mats=[base,accent,glow,dark,cloth],textures=[map].filter(Boolean);
 const {x,z}=layout.origin;
 const requested={standard:0,detailed:1,grand:2}[config.variation];
 const budget={performance:0,balanced:1,high:2}[config.quality];
 const detail=Math.min(requested,budget);
 const add=(geometry,mat,xp,yp,zp,angles=[0,0,0],scale=null)=>{
  const mesh=new THREE.Mesh(geometry,mat);
  mesh.position.set(xp,yp,zp);mesh.rotation.set(...angles);
  if(scale)mesh.scale.set(...scale);
  mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  return mesh;
 };
 const box=(w,h,d,mat,xp,yp,zp,angle=0)=>
  add(new THREE.BoxGeometry(w,h,d),mat,xp,yp,zp,[0,0,angle]);
 const cylinder=(r1,r2,h,mat,xp,yp,zp,segments=10)=>
  add(new THREE.CylinderGeometry(r1,r2,h,segments),mat,xp,yp,zp);
 const cone=(r,h,mat,xp,yp,zp,n=10)=>
  add(new THREE.ConeGeometry(r,h,n),mat,xp,yp,zp);
 const orb=(r,mat,xp,yp,zp)=>
  add(new THREE.IcosahedronGeometry(r,1),mat,xp,yp,zp);
 const ring=(r,thick,mat,xp,yp,zp,angles=[0,0,0])=>
  add(new THREE.TorusGeometry(r,thick,8,24),mat,xp,yp,zp,angles);
 // The same dimensions drive the physical and visible surfaces.
 for(const segment of layout.boxes){
  const mat=segment.role==='wall'?base:segment.role==='baffle'?accent:
   segment.role==='ramp'?dark:accent;
  const visible=box(segment.w,segment.h,segment.d,mat,
   segment.x,segment.y,segment.z,segment.angleZ||0);
  visible.name=family.style+'-collider-'+segment.id;
  visible.userData.physicalBoxId=segment.id;
 }
 // Castle's original structural silhouette is retained in the shared renderer.
 if(family.style==='castle'){
  for(const side of [-1,1])for(const depth of [-1,1]){
   cylinder(.31,.38,11.3,base,x+side*2.68,5.65,z+depth*1.65);
   cylinder(.44,.4,.58,accent,x+side*2.68,11.43,z+depth*1.65);
  }
  for(const side of [-1,1])for(let i=0;i<4+detail;i++)
   box(.56,.64,.52,base,x-2.45+i*1.34,11.53,z+side*1.7);
  ring(1.18,.08,accent,x+2.84,4.22,z,[0,Math.PI/2,0]);
  if(detail>=1)for(let i=0;i<6;i++)box(.45,.14,.25,accent,
   x-2.6+i*.86,9.12,z-1.74);
 }
 if(family.style==='dragon'){
  // Scaled spine and paired wings wrap the OUTSIDE of the real chute.
  cylinder(.67,.78,10.4,base,x-3.08,5.5,z,9);
  for(const side of [-1,1]){
   for(let i=0;i<5+detail*4;i++){
    const y=1.8+i*(8.2/(5+detail*4));
    cone(.42+detail*.04,.86,accent,x-2.98,y,z+side*1.43,6);
   }
   // Triangular wing membranes and two bronze wing spines.
   const p=new THREE.Shape();p.moveTo(0,0);p.lineTo(1.1,3.0);p.lineTo(3.55,1.7);p.closePath();
   add(new THREE.ShapeGeometry(p),cloth,x-.8,6.4,z+side*1.79,[0,side*Math.PI/2,0],
    [1,1,1]);
   box(.18,4.4,.16,accent,x-1.12,8.55,z+side*2.25,side*.29);
  }
  const head=orb(1.03,base,x+2.84,4.9,z);
  head.scale.set(1.25,.75,1.15);
  box(1.45,.38,1.95,dark,x+3.22,4.07,z);
  box(1.45,.25,1.95,accent,x+3.22,4.53,z);
  for(const side of [-1,1]){
   cone(.28,1.42,accent,x+2.43,5.94,z+side*.83,7);
   orb(.21,glow,x+3.47,5.2,z+side*.62);
  }
  if(detail>=1)for(let i=0;i<6+detail*3;i++){
   const y=2.25+i*.95;
   cone(.28,.46,accent,x-3.42,y,z,5);
  }
 }
 if(family.style==='wizard'){
  cylinder(2.82,2.63,.58,accent,x,11.58,z,8);
  cone(2.96,4.15,base,x,13.76,z,8);
  cone(.59,1.46,accent,x,16.4,z,8);
  orb(.5,glow,x,17.35,z);
  // Arched emissive windows and arcane concentric rune rings.
  for(const side of [-1,1])for(const row of [4.8,7.9,10.2]){
   add(new THREE.PlaneGeometry(.88,1.52),glow,x+1.86,row,z+side*1.1,
    [0,Math.PI/2,0]);
   ring(.55,.075,accent,x+1.87,row,z+side*1.1,[0,Math.PI/2,0]);
  }
  for(let i=0;i<2+detail*2;i++){
   const y=3.55+i*1.5;
   ring(2.18,.08,accent,x,y,z,[Math.PI/2,0,0]);
  }
  if(detail>=1)for(const side of [-1,1]){
   box(.12,3.7,.95,cloth,x-2.85,7.1,z+side*.9);
   orb(.3,glow,x-2.85,5.0,z+side*.9);
  }
 }
 if(family.style==='forge'){
  // Forged structural plates, geared drive wheels and exhaust.
  for(const side of [-1,1]){
   for(let i=0;i<4;i++){
    box(.18,2.3,.22,accent,x-2.72+i*1.78,2.9+2.15*(i%2),z+side*1.66);
    orb(.18,glow,x-2.70+i*1.78,4.0+2.15*(i%2),z+side*1.82);
   }
   cylinder(.46,.46,8.2,dark,x-2.8,6.0,z+side*1.86,12);
  }
  for(let gear=0;gear<2+detail;gear++){
   const px=x-2.82,py=4+gear*3.25,pz=z-1.87;
   ring(.89,.21,accent,px,py,pz,[0,Math.PI/2,0]);
   ring(.36,.12,dark,px,py,pz,[0,Math.PI/2,0]);
   for(let i=0;i<10;i++){
    const theta=i*Math.PI/5;
    box(.38,.23,.24,accent,px,py+Math.sin(theta)*.94,pz+Math.cos(theta)*.94,
     theta);
   }
  }
  const hearth=box(2.45,.33,2.4,accent,x+2.84,4.74,z);
  hearth.name='dwarven-forge-anvil-arch';
  orb(.74,glow,x+2.9,5.1,z);
  if(detail>=1)for(let i=0;i<6+detail*4;i++)
   box(.26,.12,.4,accent,x-2.9+i*.85,11.27,z-1.68);
 }
 if(family.style==='nature'){
  // Hollow tree: irregular bark columns, branches, forest-green crowns.
  for(const side of [-1,1])for(const dep of [-1,1]){
   const xp=x+side*2.83,zp=z+dep*1.76;
   cylinder(.43,.72,11.6,base,xp,5.8,zp,8);
   for(let i=0;i<4+detail*3;i++){
    const y=2.6+i*(8/(4+detail*3));
    add(new THREE.CylinderGeometry(.09,.11,1.58,6),accent,
     xp+(i%2?-.25:.25),y,zp,[0,0,(i%2?1:-1)*.38]);
   }
   for(let i=0;i<2+detail*2;i++)
    orb(.79+(i%2)*.25,glow,xp+(i%2?-.38:.24),11.8+i*.32,zp);
  }
  for(const side of [-1,1]){
   add(new THREE.CylinderGeometry(.18,.32,5.15,8),base,x+3.25,2.5,z+side*1.62,
    [side*.06,0,side*.37]);
   ring(1.58,.15,accent,x,7.65,z+side*1.7,[0,Math.PI/2,0]);
  }
  if(detail>=1)for(let i=0;i<6+detail*6;i++){
   const angle=i*2.39996;
   orb(.27+(i%3)*.05,accent,x+Math.sin(angle)*2.8,
    9.6+(i%5)*.72,z+Math.cos(angle)*1.8);
  }
 }
 if(family.style==='celestial'){
  for(const side of [-1,1])for(const dep of [-1,1]){
   const xp=x+side*2.83,zp=z+dep*1.68;
   cylinder(.46,.53,.48,accent,xp,.26,zp,12);
   cylinder(.31,.35,10.9,base,xp,5.78,zp,16);
   cylinder(.53,.42,.68,accent,xp,11.57,zp,12);
  }
  ring(2.4,.13,accent,x,11.75,z,[Math.PI/2,0,0]);
  ring(2.1,.12,accent,x,10.95,z,[0,Math.PI/2,0]);
  add(new THREE.OctahedronGeometry(.91,0),glow,x,12.72,z);
  cone(.24,1.14,accent,x,14.05,z,8);
  if(detail>=1)for(let i=0;i<8+detail*4;i++){
   const a=i*2*Math.PI/(8+detail*4);
   orb(.18+(i%3)*.04,glow,x+Math.cos(a)*2.32,
    11.7+Math.sin(a*2)*.16,z+Math.sin(a)*2.04);
  }
 }
 // A physical 3D emblem on the exterior, never in a die's path.
 const motif=motifMap(config.motif,config.glowColor);
 if(motif){
  const badge=material('#ffffff',{metalness:.02,roughness:.9},
   {map:motif,transparent:true,side:THREE.DoubleSide,depthWrite:false});
  mats.push(badge);textures.push(motif);
  add(new THREE.PlaneGeometry(1.18,1.18),badge,x-2.86,8.8,z,[0,-Math.PI/2,0]);
 }
 // Lighting is cosmetic, appropriately disabled in performance mode.
 if(config.lighting!=='off'&&config.quality!=='performance'){
  const light=new THREE.PointLight(config.glowColor,
   config.quality==='high'?1.05:.64,7,2);
  light.position.set(x+1.5,7.1,z);group.add(light);
 }
 if(config.variation==='grand'){
  const crown=ring(2.22,.11,accent,x,12.06,z,[Math.PI/2,0,0]);
  crown.name=family.style+'-grand-crown';
 }
 if(config.trim==='riveted'||config.trim==='gilded'){
  for(let i=0;i<5+detail*4;i++)orb(.085,accent,x-2.65,2+i*.94,z-1.76);
 }
 // The renderer can be suspended without disposing these immutable PBR assets.
 let disposed=false;
 return {group,config,detailLevel:detail,
  dispose(){
   if(disposed)return;disposed=true;
   group.removeFromParent();
   const geos=new Set();
   group.traverse(obj=>{if(obj.isMesh&&obj.geometry)geos.add(obj.geometry);});
   for(const geometry of geos)geometry.dispose();
   for(const m of mats)m.dispose();
   for(const tex of textures)tex?.dispose?.();
  }};
}
