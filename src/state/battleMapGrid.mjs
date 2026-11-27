// Pointy-top hexes use odd-row offset coordinates in storage. Distances use
// centre-to-centre cell units so the same calibration applies at every zoom.
const root3=Math.sqrt(3);
const rounded=value=>Math.round(value*10000)/10000;
export const mapCellKey=({column,row})=>column+':'+row;
export function gridDimensions(map){
  const hex=map.gridType==='hex',cols=map.gridColumns,rows=map.gridRows;
  return {hex,cols,rows,width:cols+(hex?.5:0),
    height:hex?(rows-1)*root3/2+2/root3:rows,
    dx:Number(map.gridOffsetX||0),dy:Number(map.gridOffsetY||0)};
}
export function mapCellCenter(cell,columns,rows,options={}){
  const g=gridDimensions({...(typeof options==='string'?{gridType:options}:options),gridColumns:columns,gridRows:rows});
  const x=cell.column+.5+(g.hex&&(cell.row%2)?.5:0)+g.dx;
  const y=(g.hex?1/root3+cell.row*root3/2:cell.row+.5)+g.dy;
  return {x:x*100/g.width,y:y*100/g.height};
}
export function mapCell(point,columns,rows,options={}){
  if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)||point.x<0||
    point.x>100||point.y<0||point.y>100)return null;
  const g=gridDimensions({...(typeof options==='string'?{gridType:options}:options),gridColumns:columns,gridRows:rows});
  const x=point.x*g.width/100-g.dx,y=point.y*g.height/100-g.dy;
  const clip=(n,max)=>Math.max(0,Math.min(max-1,n));
  if(!g.hex)return {column:clip(Math.floor(x),columns),row:clip(Math.floor(y),rows)};
  const nearest=clip(Math.round((y-1/root3)*2/root3),rows);
  let best=null,distance=Infinity;
  for(let row=Math.max(0,nearest-1);row<=Math.min(rows-1,nearest+1);row++){
    const offset=.5+(row%2)/2;
    const column=clip(Math.round(x-offset),columns);
    const candidate=(x-column-offset)**2+(y-1/root3-row*root3/2)**2;
    if(candidate<distance){distance=candidate;best={column,row};}
  }
  return best;
}
export function cellOutline(map,cell){
  const g=gridDimensions(map),centre=mapCellCenter(cell,g.cols,g.rows,map);
  const vertices=g.hex?[[0,-1/root3],[.5,-.5/root3],[.5,.5/root3],[0,1/root3],[-.5,.5/root3],[-.5,-.5/root3]]:
    [[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]];
  return vertices.map(([x,y])=>rounded(centre.x+x*100/g.width)+','+rounded(centre.y+y*100/g.height)).join(' ');
}
export function gridSteps(a,b,hex=false){
  const dx=Math.abs(a.column-b.column),dy=Math.abs(a.row-b.row);
  if(!hex)return Math.max(dx,dy)+Math.floor(Math.min(dx,dy)/2);
  const q=(a.column-Math.floor(a.row/2))-(b.column-Math.floor(b.row/2)),r=a.row-b.row;
  return Math.max(Math.abs(q),Math.abs(r),Math.abs(q+r));
}
export function straightCells(map,a,b){
  const g=gridDimensions(map);
  return Math.hypot((a.x-b.x)*g.width/100,(a.y-b.y)*g.height/100);
}
export function gridSettings(input){
  const type=input.gridType??'square',x=input.gridOffsetX??0,y=input.gridOffsetY??0;
  if(!['hex','square'].includes(type)||![x,y].every(n=>Number.isFinite(n)&&Math.abs(n)<=.49))
    throw Error('Choose a valid grid type and alignment within half a cell.');
  return {gridType:type,gridOffsetX:x,gridOffsetY:y};
}
