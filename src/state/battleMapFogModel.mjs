// Digital GM phase 6.2. Pure geometry and validation for tabletop fog, ruler, and GM-only pins.
// Fog overlays are visual controls: published original media may still be inspected client-side.
export const BATTLE_MAP_MAX_PRIVATE_PINS=40;
export const BATTLE_MAP_MAX_CELLS=6400;
const boundedInt=(value,min,max,label)=>{
  const n=Number(value);
  if(!Number.isInteger(n)||n<min||n>max)throw Error('Invalid '+label+'.');
  return n;
};
const finitePoint=point=>{
  if(!point||!Number.isFinite(Number(point.x))||!Number.isFinite(Number(point.y))||
     Number(point.x)<0||Number(point.x)>100||Number(point.y)<0||Number(point.y)>100)
    throw Error('Map point must be between 0 and 100 percent.');
  return {x:Number(point.x),y:Number(point.y)};
};
const dims=(cols,rows)=>{
  const columns=boundedInt(cols,1,80,'grid columns');
  const count=boundedInt(rows,1,80,'grid rows');
  return {columns,rows:count,length:columns*count};
};
export function createFogCells(cols,rows,revealed=false){
  const {length}=dims(cols,rows);
  return (revealed?'1':'0').repeat(length);
}
export function validFogCells(value,cols,rows){
  const {length}=dims(cols,rows);
  if(value==null||value==='')return createFogCells(cols,rows,false); // Legacy 6.1 maps start hidden when fog is enabled.
  if(typeof value!=='string'||value.length!==length||!/^[01]+$/.test(value))
    throw Error('Fog cell data does not match the map grid.');
  return value;
}
export function resizeFogCells(value,oldCols,oldRows,nextCols,nextRows){
  const old=dims(oldCols,oldRows),next=dims(nextCols,nextRows);
  const cells=validFogCells(value,old.columns,old.rows);
  if(old.columns===next.columns&&old.rows===next.rows)return cells;
  let resized='';
  for(let y=0;y<next.rows;y++)for(let x=0;x<next.columns;x++){
    const sourceY=Math.min(old.rows-1,Math.floor((y+.5)/next.rows*old.rows));
    const sourceX=Math.min(old.columns-1,Math.floor((x+.5)/next.columns*old.columns));
    resized+=cells[sourceY*old.columns+sourceX];
  }
  return resized;
}
export function paintFogStroke(cells,cols,rows,from,to,mode='reveal',radius=1){
  const d=dims(cols,rows),start=finitePoint(from),end=finitePoint(to);
  const r=boundedInt(radius,0,8,'fog brush radius');
  if(!['reveal','hide'].includes(mode))throw Error('Unknown fog brush tool.');
  const chars=[...validFogCells(cells,d.columns,d.rows)];
  const dx=(end.x-start.x)*d.columns/100,dy=(end.y-start.y)*d.rows/100;
  const steps=Math.max(1,Math.min(320,Math.ceil(Math.hypot(dx,dy)*2)));
  const drawAt=(x,y)=>{
    const cx=Math.min(d.columns-1,Math.floor(Math.min(99.99999,x)*d.columns/100));
    const cy=Math.min(d.rows-1,Math.floor(Math.min(99.99999,y)*d.rows/100));
    for(let row=Math.max(0,cy-r);row<=Math.min(d.rows-1,cy+r);row++){
      for(let col=Math.max(0,cx-r);col<=Math.min(d.columns-1,cx+r);col++){
        if((row-cy)**2+(col-cx)**2<=r*r)chars[row*d.columns+col]=mode==='reveal'?'1':'0';
      }
    }
  };
  for(let step=0;step<=steps;step++){
    const t=step/steps;
    drawAt(start.x+(end.x-start.x)*t,start.y+(end.y-start.y)*t);
  }
  return chars.join('');
}
export function hiddenFogRuns(cells,cols,rows){
  const d=dims(cols,rows),value=validFogCells(cells,d.columns,d.rows),runs=[];
  for(let y=0;y<d.rows;y++){
    let x=0;
    while(x<d.columns){
      if(value[y*d.columns+x]==='1'){x++;continue;}
      const start=x;
      while(x<d.columns&&value[y*d.columns+x]==='0')x++;
      runs.push({x:start*100/d.columns,y:y*100/d.rows,
        width:(x-start)*100/d.columns,height:100/d.rows});
    }
  }
  return runs;
}
export function fogRevealFraction(cells,cols,rows){
  const value=validFogCells(cells,cols,rows);
  const count=value.match(/1/g)?.length||0;
  return count/value.length;
}
export function distanceMetersPerCell(input=1){
  const n=Number(input);
  if(!Number.isFinite(n)||n<.1||n>100||Math.abs(Math.round(n*100)-n*100)>1e-7)
    throw Error('Square distance must be 0.1–100 metres with at most two decimals.');
  return n;
}
export function measureGridDistance(from,to,cols,rows,metresPerCell=1){
  const a=finitePoint(from),b=finitePoint(to),d=dims(cols,rows);
  const scale=distanceMetersPerCell(metresPerCell);
  const squares=Math.hypot((b.x-a.x)*d.columns/100,(b.y-a.y)*d.rows/100);
  return {squares:Math.round(squares*100)/100,metres:Math.round(squares*scale*100)/100};
}
export function battleMapPrivatePins(value){
  if(!Array.isArray(value)||value.length>BATTLE_MAP_MAX_PRIVATE_PINS)
    throw Error('A map supports up to 40 GM-only pins.');
  const known=new Set();
  return value.map(pin=>{
    const id=String(pin?.id||'');
    if(!/^[A-Za-z0-9_-]{1,120}$/.test(id)||known.has(id))throw Error('Private pins must have unique identifiers.');
    known.add(id);
    const label=String(pin?.label||'').trim();
    if(!label||label.length>70)throw Error('Private pin names must contain 1–70 characters.');
    const note=String(pin?.note||'').trim();
    if(note.length>400)throw Error('Private pin notes are limited to 400 characters.');
    const kind=String(pin?.kind||'note');
    if(!['note','encounter','hazard'].includes(kind))throw Error('Invalid private pin category.');
    const point=finitePoint(pin);
    return {id,label,note,kind,
      x:Math.round(point.x*100)/100,y:Math.round(point.y*100)/100};
  });
}
