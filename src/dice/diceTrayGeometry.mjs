/**
 * Deterministic six-shape tray geometry for both visible THREE rails and
 * Cannon static walls. The same segment list drives both: no CSS-only rim.
 */
import {getDiceTrayFamily,validateDiceTrayAppearance} from './diceTrayCatalogue.mjs';

const SCALE=Object.freeze({compact:.82,standard:1,expanded:1.055});
const HEIGHT=Object.freeze({low:.43,medium:.67,high:1.03});
export function trayOutline(value,viewport={width:800,height:300}){
  const a=validateDiceTrayAppearance(value);
  const family=getDiceTrayFamily(a.designId);
  const aspect=Math.max(.6,Math.min(5,Number(viewport.width)/Math.max(1,Number(viewport.height))));
  const scale=SCALE[a.size];
  let halfX=Math.min(12.8,Math.max(4.0,9*aspect*.82))*scale;
  let halfZ=7.18*scale;
  const shape=family.shape;
  if(shape==='circle'){
    const radius=Math.min(halfX,halfZ);
    halfX=radius;halfZ=radius;
  }
  const mobile=Number(viewport.width)<480;
  const ellipse=(count,rx,rz)=>Array.from({length:count},(_,i)=>{
    const theta=Math.PI*2*i/count-Math.PI/2;
    return [Math.cos(theta)*rx,Math.sin(theta)*rz];
  });
  let points;
  if(shape==='hexagon'){
    points=[[-halfX,0],[-halfX*.5,-halfZ],[halfX*.5,-halfZ],[halfX,0],
      [halfX*.5,halfZ],[-halfX*.5,halfZ]];
  }else if(shape==='octagon'){
    points=[[-halfX,-halfZ*.58],[-halfX*.64,-halfZ],[halfX*.64,-halfZ],[halfX,-halfZ*.58],
      [halfX,halfZ*.58],[halfX*.64,halfZ],[-halfX*.64,halfZ],[-halfX,halfZ*.58]];
  }else if(shape==='rectangle'||shape==='square'){
    if(shape==='square'){
      const s=Math.min(halfX,halfZ);halfX=s;halfZ=s;
    }
    points=[[-halfX,-halfZ],[halfX,-halfZ],[halfX,halfZ],[-halfX,halfZ]];
  }else if(shape==='circle'){
    points=ellipse(mobile?18:28,halfX,halfZ);
  }else if(shape==='oval'){
    points=ellipse(mobile?20:28,halfX,halfZ);
  }else throw Error('Unrecognised tray geometry.');
  const segments=points.map(([x0,z0],i)=>{
    const [x1,z1]=points[(i+1)%points.length];
    const dx=x1-x0,dz=z1-z0;
    return {x:(x0+x1)/2,z:(z0+z1)/2,
      length:Math.hypot(dx,dz)+.13,
      angle:-Math.atan2(dz,dx),
      from:[x0,z0],to:[x1,z1]};
  });
  return {shape,points,segments,halfX,halfZ,
    lipHeight:HEIGHT[a.wallHeight],
    // Protective collision skirts extend above the decorated rim during
    // high-speed throws; the physical boundary still follows the same shape.
    collisionHeight:6.5,
    thickness:.34,
    size:a.size,
    maxRollingDice:25
  };
}
/**
 * Reposition only the physical throw start, identically in prediction and live
 * physics, so every shape holds the dice. This does not set the landed face.
 * The seed still controls variation; authoritative rolled values are untouched.
 */
export function trayThrowOrigin(rand,outline){
  if(!rand||!outline)throw Error('Throw seed and tray required.');
  const x=(-.26+(Number(rand.xPos)-.5)*.43)*outline.halfX;
  const z=(Number(rand.zPos)-.5)*outline.halfZ*.65;
  const y=2.05+Number(rand.yPos)*1.10;
  return {x,y,z};
}
export function verifyTrayContainment(outline,point,margin=0){
  const [x,z]=Array.isArray(point)?point:[point.x,point.z];
  let inside=false;
  const p=outline.points;
  for(let i=0,j=p.length-1;i<p.length;j=i++){
    const [xi,zi]=p[i],[xj,zj]=p[j];
    if(((zi>z)!==(zj>z))&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)
      inside=!inside;
  }
  if(!inside)return false;
  if(margin<=0)return true;
  return outline.segments.every(seg=>{
    const [ax,az]=seg.from,[bx,bz]=seg.to;
    const t=Math.max(0,Math.min(1,((x-ax)*(bx-ax)+(z-az)*(bz-az))/
      ((bx-ax)**2+(bz-az)**2)));
    return Math.hypot(x-(ax+t*(bx-ax)),z-(az+t*(bz-az)))>=margin;
  });
}
