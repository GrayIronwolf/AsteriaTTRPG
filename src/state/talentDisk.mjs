export const DISK_TIERS=['I','II','III','IV','V'];

// Narrow viewports page branches so each rank keeps its own 44px touch target.
// Both orientations use this same elliptical fan and canonical talent references.
export function talentDiskLayout(talents,width=1000,orientation='bottom',page=0) {
  const w=Math.max(220,width),compact=w<900,pageSize=compact?3:Math.max(5,Math.floor(w/180));
  const pages=Math.max(1,Math.ceil(talents.length/pageSize)),current=Math.max(0,Math.min(page,pages-1));
  const visible=talents.slice(current*pageSize,(current+1)*pageSize),count=visible.length;
  const span=(count<=1?0:count===2?40:count===3?55:60)*Math.PI/180;
  const innerX=Math.min(230,w*.27),outerX=w/2-30,innerY=compact?136:164;
  const stepX=(outerX-innerX)/5.35;
  const stepY=Math.max(48,Math.sqrt(Math.max(0,48**2-(stepX*Math.sin(span))**2))/Math.cos(span));
  const height=Math.ceil(innerY+stepY*5.35+30),origin={x:w/2,y:orientation==='top'?0:height};
  const point=(angle,rx,ry)=>({x:origin.x+Math.sin(angle)*rx,y:origin.y+(orientation==='top'?1:-1)*Math.cos(angle)*ry});
  const nodes=visible.map((talent,i)=>{
    const angle=count===1?0:-span+2*span*i/(count-1);
    return {talent,...point(angle,innerX,innerY),root:point(angle,innerX*.38,64),ranks:Array.from({length:talent.maxRank || 5},(_,r)=>({rank:r+1,...point(angle,innerX+stepX*(r+1.35),innerY+stepY*(r+1.35))}))};
  });
  return {width:w,height,nodes,origin,pageSize,pages,page:current,talentWidth:compact?78:94};
}
