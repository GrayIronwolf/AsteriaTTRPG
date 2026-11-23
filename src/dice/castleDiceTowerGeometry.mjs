/**
 * Phase 3.8: castle-tower physical dimensions in the SAME Cannon world as
 * Asteria's 3D tray. These boxes are also the displayed meshes.
 */
export const CASTLE_TOWER_ID='castle';
export const CASTLE_TOWER_MAX_MESHES=6;
export const CASTLE_TOWER_MAX_STEPS=5000;
export const CASTLE_TOWER_STATE_SIZE=14; // open-dice-dnd@1.13.0 worker recording contract
export const CASTLE_TOWER_VERSION=1;
export function castleTowerLayout(outline){
  if(!outline||!Number.isFinite(outline.halfX)||!Number.isFinite(outline.halfZ))
    throw Error('A physical tray outline is required for the tower.');
  const x=-outline.halfX*.42,z=-outline.halfZ*.16;
  // x increases from the tower's rear wall through its open exit to the tray.
  const W=1.65,D=1.55;
  const boxes=[
    {id:'rear-wall',role:'wall',x:x-W-.13,y:5.65,z,w:.27,h:11.3,d:3.14},
    {id:'north-wall',role:'wall',x,y:5.65,z:z-D-.12,w:3.35,h:11.3,d:.24},
    {id:'south-wall',role:'wall',x,y:5.65,z:z+D+.12,w:3.35,h:11.3,d:.24},
    // Castle front has a doorway starting at y=2.65, not a fake exit.
    {id:'gate-wall',role:'wall',x:x+W+.13,y:7.325,z,w:.27,h:7.95,d:3.14},
    {id:'baffle-upper',role:'baffle',x:x-.67,y:7.75,z,w:1.57,h:.18,d:2.62,angleZ:-.31},
    {id:'baffle-middle',role:'baffle',x:x+.67,y:5.35,z,w:1.57,h:.18,d:2.62,angleZ:.31},
    {id:'baffle-lower',role:'baffle',x:x-.65,y:3.23,z,w:1.57,h:.18,d:2.62,angleZ:-.30},
    // A real descending return ramp extends into the 3D tray.
    {id:'exit-ramp',role:'ramp',x:x+1.23,y:1.02,z,w:5.62,h:.23,d:2.82,angleZ:-.21},
    {id:'exit-north-rail',role:'guide',x:x+2.2,y:.78,z:z-1.48,w:3.76,h:.95,d:.16,angleZ:-.21},
    {id:'exit-south-rail',role:'guide',x:x+2.2,y:.78,z:z+1.48,w:3.76,h:.95,d:.16,angleZ:-.21}
  ];
  return {id:CASTLE_TOWER_ID,version:CASTLE_TOWER_VERSION,
    origin:{x,z},height:11.3,innerHalfX:W,innerHalfZ:D,
    exitX:x+W+.8,boxes,
    spawn:{x:x-.7,y:10.6,z},
    // The real physical gate, not just a drawn mark.
    portal:{x:x+W+.13,minY:0,maxY:3.35},
    maxRollingDice:CASTLE_TOWER_MAX_MESHES};
}
export function castleTowerSpawn(seed,layout){
 if(!seed||!layout||![seed.xPos,seed.yPos,seed.zPos].every(v=>Number.isFinite(v)&&v>=0&&v<=1))
   throw Error('Invalid tower throw seed.');
 return {x:layout.spawn.x+(seed.xPos-.5)*.28,
   y:layout.spawn.y+seed.yPos*.25,
   z:layout.spawn.z+(seed.zPos-.5)*.65,
   vx:1.25+seed.vel?.[0]*1.1,
   vz:(seed.vel?.[2]-.5)*1.7};
}
export function inspectCastleTowerRecording(layout,recording){
 if(!layout||!recording||!Number.isInteger(recording.bodies)||
   !Number.isInteger(recording.steps)||!recording.states)return null;
 const {bodies,steps,states}=recording;
 if(bodies<1||steps<1||states.length<steps*bodies*CASTLE_TOWER_STATE_SIZE)return null;
 const frames=[0,Math.max(0,Math.floor(steps*.25)),Math.max(0,Math.floor(steps*.5)),steps-1];
 const rest=[];
 for(let die=0;die<bodies;die++){
   const at=(step,axis)=>states[(step*bodies+die)*CASTLE_TOWER_STATE_SIZE+axis];
   const starts={x:at(0,0),y:at(0,1),z:at(0,2)};
   const ends={x:at(steps-1,0),y:at(steps-1,1),z:at(steps-1,2)};
   // Sample the full physical trajectory; do not infer success from a visual shell.
   let visitsUpper=false,visitsMiddle=false,visitsLower=false,exits=false,minimumY=Infinity;
   for(let step=0;step<steps;step++){
     const x=at(step,0),y=at(step,1),z=at(step,2);
     minimumY=Math.min(minimumY,y);
     if(Math.abs(x-layout.origin.x)<layout.innerHalfX+1&&
        Math.abs(z-layout.origin.z)<layout.innerHalfZ+1){
       if(y<9.1&&y>6.5)visitsUpper=true;
       if(y<6.5&&y>4.0)visitsMiddle=true;
       if(y<4.0&&y>1.7)visitsLower=true;
     }
     if(x>layout.exitX&&y<2.25&&Math.abs(z-layout.origin.z)<layout.innerHalfZ+3)
       exits=true;
   }
   rest.push({starts,ends,visitsUpper,visitsMiddle,visitsLower,
     exits,minimumY,sampled:frames.map(f=>[at(f,0),at(f,1),at(f,2)])});
 }
 return {type:'castle-tower-physics',version:CASTLE_TOWER_VERSION,
   steps,diceCount:bodies,watched:rest.length,
   entered:rest.filter(r=>r.starts.y>9.5).length,
   upper:rest.filter(r=>r.visitsUpper).length,
   middle:rest.filter(r=>r.visitsMiddle).length,
   lower:rest.filter(r=>r.visitsLower).length,
   exited:rest.filter(r=>r.exits).length,
   settledInTray:rest.filter(r=>r.ends.y<1.5&&r.ends.x>layout.exitX).length,
   exitComplete:rest.every(r=>r.exits&&r.ends.y<1.5&&r.ends.x>layout.exitX),
   rest};
}
