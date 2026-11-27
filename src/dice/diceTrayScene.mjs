/**
 * Phase 3.5 — one genuine 3D PBR tray and matching static Cannon colliders.
 * Reuses Open Dice's scene and physics prediction; no new dice engine.
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {validateDiceTrayAppearance} from './diceTrayCatalogue.mjs';
import {trayOutline,trayThrowOrigin} from './diceTrayGeometry.mjs';
import {createTrayImpactAudio} from './diceTrayImpact.mjs';

const FRAMES=Object.freeze({
  iron:{metalness:.81,roughness:.46},'gunmetal-steel':{metalness:.9,roughness:.32},
  'polished-steel':{metalness:.95,roughness:.17},bronze:{metalness:.83,roughness:.34},
  silver:{metalness:.96,roughness:.16},gold:{metalness:.94,roughness:.22},
  walnut:{metalness:0,roughness:.48},stone:{metalness:0,roughness:.35}
});
const INTERIORS=Object.freeze({
  velvet:{metalness:0,roughness:.98},felt:{metalness:0,roughness:1},
  suede:{metalness:0,roughness:.95},leather:{metalness:0,roughness:.68},
  wood:{metalness:0,roughness:.47},slate:{metalness:0,roughness:.72},
  marble:{metalness:0,roughness:.23},obsidian:{metalness:.04,roughness:.13}
});
const GLOW={off:0,subtle:.13,medium:.3,strong:.56};
const WEAR={pristine:0,'lightly-worn':.13,'battle-worn':.32,ancient:.52};
function noiseTexture(color,roughnessSeed,heavy=false){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d');if(!ctx)return null;
  ctx.fillStyle=color;ctx.fillRect(0,0,256,256);
  let seed=roughnessSeed+12345;
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  const count=heavy?1800:950;
  for(let i=0;i<count;i++){
    const r=random(),x=random()*256,y=random()*256;
    const white=r>.52;
    ctx.fillStyle=white?'rgba(255,255,255,.065)':'rgba(2,9,16,.10)';
    ctx.fillRect(x,y,heavy?8:3,heavy?2:2);
  }
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.repeat.set(3,3);
  texture.anisotropy=2;return texture;
}
function flatPolygon(points,y,mat){
  const vertices=[];
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    vertices.push(0,y,0,a[0],y,a[1],b[0],y,b[1]);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,mat);mesh.receiveShadow=true;return mesh;
}
function emblemTexture(config){
  if(config.emblem==='none')return null;
  const c=document.createElement('canvas');c.width=256;c.height=256;
  const x=c.getContext('2d');
  if(!x)return null;
  x.strokeStyle=config.trimColor;x.fillStyle=config.trimColor;x.globalAlpha=.26;
  x.lineWidth=3;x.beginPath();x.arc(128,128,68,0,Math.PI*2);x.stroke();
  x.font='bold 78px Georgia';x.textAlign='center';x.textBaseline='middle';
  const symbols={'asteria-star':'✦',raven:'◆',wolf:'◇',dragon:'♜',moon:'☾',
    sun:'☼',sword:'⚔',shield:'⬡',leaf:'❧',crown:'♛',compass:'✥'};
  x.fillText(symbols[config.emblem]||'✦',128,130);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
function decorativeRing(points,config,radius=1){
  const pts=points.map(([x,z])=>new THREE.Vector3(x*radius,.13,z*radius));
  const mat=new THREE.LineBasicMaterial({color:config.trimColor,transparent:true,
    opacity:config.lighting==='off'?.32:.68});
  const g=new THREE.BufferGeometry().setFromPoints([...pts,pts[0]]);
  return new THREE.Line(g,mat);
}
function profileGeometry(outline,config){
  const group=new THREE.Group();group.name='asteria-real-pbr-dice-tray';
  const disposables=[];
  const frameProps=FRAMES[config.frameMaterial],interiorProps=INTERIORS[config.interiorMaterial];
  const frameTex=noiseTexture(config.frameColor,151,config.frameMaterial==='walnut');
  const liningTex=noiseTexture(config.interiorColor,987,
    ['velvet','felt','suede'].includes(config.interiorMaterial));
  if(frameTex)disposables.push(frameTex);
  if(liningTex)disposables.push(liningTex);
  const frameMat=new THREE.MeshPhysicalMaterial({color:'#ffffff',map:frameTex,
    ...frameProps,clearcoat:config.frameMaterial==='stone'?.45:.1,
    side:THREE.DoubleSide,roughness:Math.min(.96,frameProps.roughness+WEAR[config.wear]*.4)});
  const insideMat=new THREE.MeshPhysicalMaterial({color:'#ffffff',map:liningTex,
    ...interiorProps,side:THREE.DoubleSide,
    roughness:Math.min(1,interiorProps.roughness+WEAR[config.wear]*.22)});
  const trimMat=new THREE.MeshPhysicalMaterial({color:config.trimColor,metalness:.82,
    roughness:.27,emissive:config.trimColor,emissiveIntensity:GLOW[config.lighting]});
  disposables.push(frameMat,insideMat,trimMat);
  const outer=flatPolygon(outline.points,-.045,frameMat);group.add(outer);
  const inside=flatPolygon(outline.points,.018,insideMat);group.add(inside);
  // The rolling surface is visually at the Cannon floor y=0, while every
  // raised rail is a genuine three-dimensional mesh.
  const rails=[],width=outline.thickness,wallHeight=outline.lipHeight;
  for(const segment of outline.segments){
    const g=new THREE.BoxGeometry(segment.length,wallHeight,width);
    const m=new THREE.Mesh(g,frameMat);
    m.position.set(segment.x,wallHeight/2-.025,segment.z);
    m.rotation.y=segment.angle;
    m.castShadow=true;m.receiveShadow=true;
    group.add(m);rails.push(m);
    // A separately modelled metallic bevel follows the full rim, including
    // different shape geometry. It shares the same static collision segment.
    const trimGeometry=new THREE.BoxGeometry(segment.length,.07,config.rim==='bevelled'?.27:.14);
    const trim=new THREE.Mesh(trimGeometry,trimMat);
    trim.position.set(segment.x,wallHeight-.04,segment.z);
    trim.rotation.y=segment.angle;group.add(trim);rails.push(trim);
  }
  const decorationOpacity=WEAR[config.wear]>.3?.25:.58;
  if(config.engraving!=='none'){
    const ring=decorativeRing(outline.points,config,.87);
    ring.material.opacity=decorationOpacity;group.add(ring);
    disposables.push(ring.geometry,ring.material);
  }
  if(config.emblem!=='none'){
    const map=emblemTexture(config);
    if(map){
      const mat=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,
        opacity:config.wear==='ancient'?.5:1,side:THREE.DoubleSide});
      const symbol=new THREE.Mesh(new THREE.PlaneGeometry(2.8,2.8),mat);
      symbol.rotation.x=-Math.PI/2;symbol.position.y=.03;
      group.add(symbol);disposables.push(map,mat,symbol.geometry);
    }
  }
  const ambient=new THREE.PointLight(config.trimColor,config.lighting==='off'?0:
    GLOW[config.lighting]*2,Math.max(12,outline.halfX*2));
  ambient.position.set(0,2.5,0);group.add(ambient);
  // Strip-lines rather than floating particles preserve clarity of face values.
  return {group,outline,rails,dispose(){
    group.removeFromParent();
    group.traverse(obj=>{if(obj.isMesh)obj.geometry?.dispose();});
    for(const x of disposables)x.dispose?.();
  }};
}
export function buildDiceTrayScene(config,viewport){
  const value=validateDiceTrayAppearance(config);
  return profileGeometry(trayOutline(value,viewport),value);
}
export function attachDiceTray(engine,config){
  if(!engine?.scene||!engine?.world||!engine?.renderer||!engine?.container)
    throw Error('A ready Open Dice engine is required for a physical tray.');
  const value=validateDiceTrayAppearance(config);
  const viewport={width:engine.container.clientWidth,height:engine.container.clientHeight};
  const visuals=buildDiceTrayScene(value,viewport);
  engine.scene.add(visuals.group);
  const originalWalls=engine.walls||[];
  // The same exact hex/octagon/rect/circle/square/oval geometry is used
  // for both scene mesh rails and physical walls. No competing physics engine.
  for(const wall of originalWalls)engine.world.removeBody(wall);
  const walls=[],wallMaterial=new CANNON.Material('asteria-tray-wall');
  const surfaceContact=new CANNON.ContactMaterial(engine.diceMaterial,wallMaterial,{
    friction:.24,restitution:.38
  });
  engine.world.addContactMaterial(surfaceContact);
  for(const seg of visuals.outline.segments){
    const wall=new CANNON.Body({mass:0,material:wallMaterial,
      shape:new CANNON.Box(new CANNON.Vec3(seg.length/2,
        visuals.outline.collisionHeight/2,visuals.outline.thickness/2))});
    wall.position.set(seg.x,visuals.outline.collisionHeight/2-.02,seg.z);
    wall.quaternion.setFromAxisAngle(new CANNON.Vec3(0,1,0),seg.angle);
    engine.world.addBody(wall);walls.push(wall);
  }
  engine.walls=walls;
  const originalResize=engine._updatePhysicsWalls;
  engine._updatePhysicsWalls=function(){
    // Keep static custom walls aligned with the tray throughout canvas resize.
    // A resized/different design is installed while idle by the React wrapper.
    if(this._destroyed)return;
  };
  const originalApply=engine._applyDiePhysics;
  engine._applyDiePhysics=function(die,seed){
    originalApply.call(this,die,seed);
    const p=trayThrowOrigin(seed,visuals.outline);
    die.body.position.set(p.x,p.y,p.z);
    die.body.velocity.x*=.48;
    die.body.velocity.z*=.48;
    die.mesh?.position?.copy(die.body.position);
  };
  const audio=createTrayImpactAudio(value);
  const originalSound=engine._playImpact;
  engine._playImpact=function(die,impact){
    // Existing sound playback is disabled to prevent double impact events.
    audio.play(Math.min(1,Math.max(0,impact/17)));
  };
  // Avoid the flat placeholder ShadowMaterial obscuring the new PBR floor.
  if(engine.floor)engine.floor.visible=false;
  engine.renderer.render(engine.scene,engine.camera);
  let cleaned=false;
  return {outline:visuals.outline,mesh:visuals.group,config:value,updateSound(next){audio.configure(next);},
    dispose(){
      if(cleaned)return;cleaned=true;
      audio.dispose();
      engine._applyDiePhysics=originalApply;
      engine._playImpact=originalSound;
      engine._updatePhysicsWalls=originalResize;
      for(const wall of walls)engine.world.removeBody(wall);
      engine.world.removeContactMaterial(surfaceContact);
      for(const wall of originalWalls)engine.world.addBody(wall);
      engine.walls=originalWalls;
      if(engine.floor)engine.floor.visible=true;
      visuals.dispose();
      engine.renderer?.render(engine.scene,engine.camera);
    }
  };
}
