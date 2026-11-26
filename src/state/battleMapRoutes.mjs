// Movement routes stay in grid space. Square maps retain diagonal parity across
// movement segments, so splitting a move cannot make an expensive diagonal cheap.
import {mapGridType,terrainIndex,terrainMoveMultiplier} from './battleMapTerrainModel.mjs';

export function mapCell(point,columns,rows,gridType='square'){
  if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)||point.x<0||point.x>100||point.y<0||point.y>100)
    return null;
  if(mapGridType(gridType)==='hex'){
    // Nearest-centre lookup for pointy-top odd-row hexes; test neighbouring
    // rows to correctly select wedges close to the hex boundaries.
    const x=point.x*(columns+0.5)/100,y=point.y*(rows*.75+.25)/100;
    const nearestRow=Math.round((y-.5)/.75);
    let closest=null,best=Infinity;
    for(let row=Math.max(0,nearestRow-2);row<=Math.min(rows-1,nearestRow+2);row++){
      const centreX=x-.5-(row&1)*.5;
      const nearestColumn=Math.round(centreX);
      for(let column=Math.max(0,nearestColumn-1);column<=Math.min(columns-1,nearestColumn+1);column++){
        const dx=x-(column+.5+(row&1)*.5),dy=y-(row*.75+.5);
        const distance=.75*dx*dx+dy*dy;
        if(distance<best){best=distance;closest={column,row};}
      }
    }
    return closest;
  }
  return {column:Math.min(columns-1,Math.floor(point.x*columns/100)),
    row:Math.min(rows-1,Math.floor(point.y*rows/100))};
}
export const mapCellKey=({column,row})=>column+':'+row;
export function hexCellPoints(cell,columns,rows){
  const x=(cell.column+.5+(cell.row&1)*.5)*100/(columns+.5),
    y=(cell.row*.75+.5)*100/(rows*.75+.25);
  const hw=50/(columns+.5),hh=50/(rows*.75+.25);
  return [[x,y-hh],[x+hw,y-hh/2],[x+hw,y+hh/2],
    [x,y+hh],[x-hw,y+hh/2],[x-hw,y-hh/2]];
}
export const mapCellCenter=({column,row},columns,rows,gridType='square')=>
  mapGridType(gridType)==='hex'?{
    x:(column+.5+(row&1)*.5)*100/(columns+.5),
    y:(row*.75+.5)*100/(rows*.75+.25)
  }:{x:(column+.5)*100/columns,y:(row+.5)*100/rows};
const ortho=[[1,0],[-1,0],[0,1],[0,-1]];
const diagonal=[[1,1],[1,-1],[-1,1],[-1,-1]];
const neighbours=[...ortho,...diagonal];
// Odd-row horizontal hex layout, with staggered odd rows.
const hexNeighbours=rowParity=>rowParity===0?[[1,0],[-1,0],[-1,-1],[0,-1],[-1,1],[0,1]]:[[1,0],[-1,0],[0,-1],[1,-1],[0,1],[1,1]];
const axial=({column,row})=>({q:column-(row-(row&1))/2,r:row});
export function hexCellDistance(a,b){const A=axial(a),B=axial(b),dq=A.q-B.q,dr=A.r-B.r;return Math.max(Math.abs(dq),Math.abs(dr),Math.abs(dq+dr));}
function footprintFits(column,row,size,allows){
  const offset=Math.floor((size-1)/2);
  for(let y=row-offset;y<row-offset+size;y++){
    for(let x=column-offset;x<column-offset+size;x++){
      if(!allows(x,y))return false;
    }
  }
  return true;
}
function push(queue,next){
  let i=queue.length;
  queue.push(next);
  while(i>0){
    const parent=(i-1)>>1;
    if(queue[parent].cost<=next.cost)break;
    queue[i]=queue[parent];i=parent;
  }
  queue[i]=next;
}
function take(queue){
  const first=queue[0],last=queue.pop();
  if(!queue.length)return first;
  let i=0;
  while(i*2+1<queue.length){
    const left=i*2+1,right=left+1;
    const child=right<queue.length&&queue[right].cost<queue[left].cost?right:left;
    if(queue[child].cost>=last.cost)break;
    queue[i]=queue[child];i=child;
  }
  queue[i]=last;
  return first;
}
export function mapReachableRoutes(map,origin,allowance,{
  occupied=[],diagonalParity=0,revealedOnly=false,movementKind=''
}={}){
  const columns=Number(map.gridColumns),rows=Number(map.gridRows),scale=Number(map.metresPerCell??1);
  if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns>80||rows>80||
    !Number.isFinite(scale)||scale<=0||!Number.isFinite(allowance)||allowance<=0)return new Map();
  const start=mapCell(origin,columns,rows,map.gridType);
  if(!start)return new Map();
  const startKey=mapCellKey(start),blocked=new Set();
  const hex=mapGridType(map.gridType)==='hex';
  const terrain=terrainIndex(map);
  const originElevation=terrain.get(startKey)?.elevation??0;
  const entry=(column,row)=>terrain.get(column+':'+row)||{kind:'plain',elevation:0};
  for(const token of occupied){
    const cell=mapCell(token,columns,rows,map.gridType);
    if(cell)footprintFits(cell.column,cell.row,token.cells??1,(column,row)=>{
      blocked.add(mapCellKey({column,row}));
      return true;
    });
  }
  blocked.delete(startKey);
  const queue=[],best=new Map(),routes=new Map();
  const seed={...start,parity:Number(diagonalParity===1),cost:0,previous:null};
  const stateKey=row=>mapCellKey(row)+':'+row.parity;
  const free=(column,row)=>column>=0&&row>=0&&column<columns&&row<rows&&!blocked.has(column+':'+row)&&
    terrainMoveMultiplier(entry(column,row).kind,movementKind)!==null&&
    (!revealedOnly||!map.fogEnabled||map.fogCells?.[row*columns+column]==='1');
  const valid=(column,row)=>footprintFits(column,row,origin.cells??1,free);
  if(['fly','jump','teleport'].includes(movementKind)){
    // These modes have an approved horizontal range and require an unoccupied
    // landing. Grid steps and ground occupants do not determine their range.
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
      const horizontal=(hex?hexCellDistance(start,{column,row}):
        Math.hypot(column-start.column,row-start.row))*scale;
      const cost=Math.hypot(horizontal,entry(column,row).elevation-originElevation);
      if(cost>0&&cost<=allowance+1e-7&&valid(column,row)){
        const destination={column,row,cost,parity:0,previous:seed};
        routes.set(mapCellKey(destination),destination);
      }
    }
    return routes;
  }
  best.set(stateKey(seed),seed);push(queue,seed);
  while(queue.length){
    const current=take(queue);
    if(best.get(stateKey(current))!==current)continue;
    const cell=mapCellKey(current);
    if(cell!==startKey&&!routes.has(cell))routes.set(cell,current);
    for(const [dx,dy] of (hex?hexNeighbours(current.row&1):neighbours)){
      const column=current.column+dx,row=current.row+dy;
      if(!valid(column,row))continue;
      const diag=Boolean(dx&&dy);
      if(diag&&!hex&&(!valid(column,current.row)||!valid(current.column,row)))continue;
      const currentTerrain=entry(current.column,current.row),nextTerrain=entry(column,row);
      const elevationDelta=Math.abs(nextTerrain.elevation-currentTerrain.elevation);
      if(!['fly','jump','teleport'].includes(movementKind)&&elevationDelta>1.5&&
        !['stairs'].includes(nextTerrain.kind)&&!['stairs'].includes(currentTerrain.kind))continue;
      const multiplier=terrainMoveMultiplier(nextTerrain.kind,movementKind);
      const horizontal=scale*(hex?1:diag&&current.parity===1?2:1)*multiplier;
      const cost=current.cost+Math.hypot(horizontal,elevationDelta);
      if(cost>allowance+1e-7)continue;
      const next={column,row,parity:hex?0:diag?1-current.parity:current.parity,cost,previous:current};
      const key=stateKey(next);
      if((best.get(key)?.cost??Infinity)<=cost)continue;
      best.set(key,next);push(queue,next);
    }
  }
  return routes;
}
export function mapRoutePoints(node,columns,rows,gridType='square'){
  const path=[];
  for(let entry=node;entry;entry=entry.previous)path.push(mapCellCenter(entry,columns,rows,gridType));
  return path.reverse();
}
