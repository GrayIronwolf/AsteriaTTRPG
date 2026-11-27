import { Plane, Raycaster, Vector3 } from 'three';
import {verifyTrayContainment} from './diceTrayGeometry.mjs';
export const DICE_DRAG_DISTANCE=9;
const TAP_MAX_MS = 300;
const FLICK_WINDOW_MS = 100;
const FLICK_RELEASE_MS = 90;
const MAX_THROW_SPEED = 28;
const THROW_SENSITIVITY = { gentle: .74, normal: 1, fast: 1.27 };

export function diceGesture(start,end,elapsedMs,speed='normal'){
 const dx=Number(end.x)-Number(start.x),dy=Number(end.y)-Number(start.y);
 const distance=Math.hypot(dx,dy),elapsed=Math.max(1,Number(elapsedMs)||1);
 const multiplier={gentle:1.45,normal:1,fast:.7}[speed]||1;
 return {distance,click:distance<DICE_DRAG_DISTANCE,
  flick:distance>=28&&distance/elapsed>.65*multiplier,
  dx,dy};
}

export function trayPointerRay(camera, bounds, pointer) {
  if (!camera || !bounds?.width || !bounds?.height) return null;
  const raycaster = new Raycaster();
  camera.updateMatrixWorld();
  raycaster.setFromCamera({
    x: (pointer.clientX - bounds.left) / bounds.width * 2 - 1,
    y: 1 - (pointer.clientY - bounds.top) / bounds.height * 2
  }, camera);
  return raycaster;
}

export function projectTrayPoint(raycaster, height) {
  const plane = new Plane(new Vector3(0, 1, 0), -height);
  return raycaster?.ray.intersectPlane(plane, new Vector3()) ?? null;
}

export function createDiceGesture(start) {
  return { start, samples: [start], dragged: false };
}

export function sampleDiceGesture(gesture, sample) {
  const { start, samples } = gesture;
  gesture.dragged ||= Math.hypot(sample.x - start.x, sample.y - start.y) >= DICE_DRAG_DISTANCE;
  const previous = gesture.last ?? start;
  gesture.last = sample;
  if (previous.x === sample.x && previous.y === sample.y) return;
  if (previous !== samples.at(-1)) samples.push(previous);
  samples.push(sample);
  while (samples.length > 2 && samples[0].time < sample.time - FLICK_WINDOW_MS) {
    samples.shift();
  }
}

export function releaseDiceGesture({ start, samples, dragged, last = start }, speed = 'normal') {
  if (!dragged) return { kind: last.time - start.time <= TAP_MAX_MS ? 'tap' : 'place' };

  const first = samples[0];
  const moved = samples.at(-1);
  const elapsed = Math.min(FLICK_WINDOW_MS, moved.time - first.time);
  const motion = diceGesture(first, moved, elapsed, speed);
  if (last.time - moved.time > FLICK_RELEASE_MS || !motion.flick ||
      !first.point || !moved.point) return { kind: 'place' };

  const vx = (moved.point.x - first.point.x) * 1000 / Math.max(1, elapsed);
  const vz = (moved.point.z - first.point.z) * 1000 / Math.max(1, elapsed);
  const magnitude = Math.hypot(vx, vz);
  if (magnitude < 1) return { kind: 'place' };
  const scale = Math.min(THROW_SENSITIVITY[speed] ?? 1, MAX_THROW_SPEED / magnitude);
  return { kind: 'throw', vx: vx * scale, vz: vz * scale };
}

export function fitDieInsideTray(point,outline,margin=.75){
 if(!outline||!Number.isFinite(point?.x)||!Number.isFinite(point?.z))
  return null;
 const target=[point.x,point.z];
 if(verifyTrayContainment(outline,target,margin))
  return {x:point.x,z:point.z};
 if(!verifyTrayContainment(outline,[0,0],margin))return null;
 let low=0,high=1;
 for(let i=0;i<18;i++){
  const mid=(low+high)/2;
  if(verifyTrayContainment(outline,[target[0]*mid,target[1]*mid],margin))low=mid;
  else high=mid;
 }
 return {x:target[0]*low,z:target[1]*low};
}
