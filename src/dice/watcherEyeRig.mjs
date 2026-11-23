/**
 * The Watcher eye is a real THREE.Group parented to the rendered Open Dice
 * mesh. Its position/animation are cosmetics only; the Cannon body and
 * target die faces are untouched. No independent draw loop is created here.
 */
import {validateDiceAppearance} from './diceAppearanceCatalogue.mjs';
import {watcherVisualQuality} from './watcherDiceDesign.mjs';

const PUPIL_SCALE=Object.freeze({
  round:[.42,.42], 'vertical-slit':[.20,.64],
  'horizontal-slit':[.64,.22],diamond:[.44,.44],eldritch:[.34,.58]
});
const MOTION_RATE=Object.freeze({off:0,subtle:.27,normal:.54,lively:1});
const BLINK_INTERVAL=Object.freeze({off:Infinity,rare:12,normal:6,frequent:3.6});
function material(THREE,color,other={}){
  return new THREE.MeshPhysicalMaterial({color,roughness:.18,clearcoat:.75,
    clearcoatRoughness:.13,side:THREE.DoubleSide,...other});
}
function sphere(THREE,r,mat,segments){
  return new THREE.Mesh(new THREE.SphereGeometry(r,segments,Math.max(8,segments>>1)),mat);
}
export function createWatcherEyeRig(THREE,appearance,quality={}){
  const a=validateDiceAppearance(appearance);
  if(a.familyId!=='dice-watcher')throw Error('Cannot attach eye to a non-Watcher die.');
  const c=a.special;
  const q=watcherVisualQuality(quality);
  const group=new THREE.Group();
  group.name='asteria-watcher-visual-eye';
  group.userData.asteriaWatcher=true;
  const eyeball=new THREE.Group();
  eyeball.name='watcher-eyeball';
  const radius=.285;
  const sclera=sphere(THREE,radius,material(THREE,c.scleraColor,{metalness:.02}),q.segments);
  eyeball.add(sclera);
  const iris=sphere(THREE,radius*.64,material(THREE,c.irisColor,{
    emissive:c.irisColor,emissiveIntensity:
      {off:0,subtle:.13,medium:.34,strong:.65}[c.glow]}),q.segments);
  iris.scale.z=.18;iris.position.z=radius*.90;
  iris.name='watcher-iris';eyeball.add(iris);
  const halo=new THREE.Mesh(
    new THREE.TorusGeometry(radius*.59,.012,5,q.segments),
    material(THREE,c.irisColor,{metalness:.36,roughness:.28}));
  halo.position.z=radius*1.005;eyeball.add(halo);
  const shape=c.pupil==='diamond'||c.pupil==='eldritch'?
    new THREE.OctahedronGeometry(radius*.28,0):
    new THREE.SphereGeometry(radius*.31,Math.max(10,q.segments/2|0),9);
  const pupil=new THREE.Mesh(shape,material(THREE,'#050815',{
    roughness:.04,clearcoat:1}));
  const [sx,sy]=PUPIL_SCALE[c.pupil];
  pupil.scale.set(sx*1.95,sy*1.95,.17);
  pupil.position.z=radius*1.09;pupil.name='watcher-pupil';
  eyeball.add(pupil);
  const glint=sphere(THREE,.036,new THREE.MeshBasicMaterial({color:'#FFFFFF'}),10);
  glint.position.set(-.075,.087,radius*1.15);eyeball.add(glint);
  group.add(eyeball);
  group.position.set(0,0,0);
  group.scale.setScalar(.92);
  const materials=new Set(),geometries=new Set();
  group.traverse(node=>{
    if(node.isMesh){
      geometries.add(node.geometry);
      for(const mat of Array.isArray(node.material)?node.material:[node.material])
        materials.add(mat);
    }
  });
  const state={
    blink:1,elapsed:0,eye:eyeball,anchor:group,quality:q,
    lastPoint:null,disposed:false
  };
  function update(time,{pointer=null,reducedMotion=false,rolling=false,reaction='none'}={}){
    if(state.disposed)return;
    const enabled=q.animated&&!reducedMotion;
    const movement=enabled?MOTION_RATE[c.motion]:0;
    // A miniature curved pupil tracks a visual point without moving the die.
    let px=movement*Math.sin(time*.91),py=movement*Math.sin(time*.63+.7);
    if(enabled&&q.pointerTracking&&c.cursorTracking&&pointer){
      px=Math.max(-1,Math.min(1,pointer.x))*movement;
      py=Math.max(-1,Math.min(1,pointer.y))*movement;
    }
    if(rolling&&enabled){px*=.4;py*=.4;}
    eyeball.rotation.y=px*.42;
    eyeball.rotation.x=-py*.34;
    const interval=BLINK_INTERVAL[c.blink];
    const blinkPeriod=enabled&&Number.isFinite(interval)
      ?Math.max(0,Math.min(1,(time%interval)/interval)):0;
    // Brief closing/opening of the visible eye only, not the containing die.
    const closing=blinkPeriod>.945&&blinkPeriod<.983;
    const t=closing?(blinkPeriod-.945)/.038:0;
    state.blink=closing?Math.max(.07,1-Math.sin(t*Math.PI)*.94):1;
    eyeball.scale.y=state.blink;
    if(enabled){
      const pulse=reaction==='success'?1.12:reaction==='failure'?.8:1;
      eyeball.scale.set(pulse,state.blink*pulse,pulse);
    }
    if(!enabled)eyeball.scale.set(1,1,1);
    state.elapsed=time;
  }
  function dispose(){
    if(state.disposed)return;
    state.disposed=true;
    group.removeFromParent();
    for(const m of materials)m.dispose();
    for(const g of geometries)g.dispose();
  }
  return {group,eye:eyeball,iris,pupil,update,dispose,quality:q,state};
}
/**
 * Face and bevel maps must remain legible while the eye is visible through
 * the gel. This is applied to visible meshes only; never prediction bodies.
 */
export function applyWatcherGelShell(mesh,appearance,quality={}){
  const a=validateDiceAppearance(appearance);
  if(a.familyId!=='dice-watcher')throw Error('Not a Watcher shell.');
  const opacity={solid:.91,subtle:.76,translucent:.60,clear:.46}[a.special.transparency];
  const managed=[];
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  for(const mat of materials){
    if(!mat||!mat.isMeshPhysicalMaterial)continue;
    // This material is unique to the visible die. Underlying face image, normal
    // and numeral texture remain intact; no geometry/collider is changed.
    mat.transparent=true;
    mat.opacity=opacity;
    mat.depthWrite=false;
    mat.side=mat.constructor.DoubleSide||2;
    mat.roughness=Math.min(mat.roughness,.18);
    mat.clearcoat=1;
    mat.needsUpdate=true;
    managed.push(mat);
  }
  mesh.userData.asteriaGel=true;
  return managed.length;
}
