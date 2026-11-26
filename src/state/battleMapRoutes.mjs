// Movement routes stay in grid space. Square maps retain diagonal parity across
// movement segments, so splitting a move cannot make an expensive diagonal cheap.
export function mapCell(point,columns,rows){
  if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y)||point.x<0||point.x>100||point.y<0||point.y>100)
    return null;
  return {column:Math.min(columns-1,Math.floor(point.x*columns/100)),
    row:Math.min(rows-1,Math.floor(point.y*rows/100))};
}
export const mapCellKey=({column,row})=>column+':'+row;
export const mapCellCenter=({column,row},columns,rows)=>({
  x:(column+.5)*100/columns,y:(row+.5)*100/rows
});
const ortho=[[1,0],[-1,0],[0,1],[0,-1]];
const diagonal=[[1,1],[1,-1],[-1,1],[-1,-1]];
const neighbours=[...ortho,...diagonal];
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
  const start=mapCell(origin,columns,rows);
  if(!start)return new Map();
  const startKey=mapCellKey(start),blocked=new Set();
  for(const token of occupied){
    const cell=mapCell(token,columns,rows);
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
    (!revealedOnly||!map.fogEnabled||map.fogCells?.[row*columns+column]==='1');
  const valid=(column,row)=>footprintFits(column,row,origin.cells??1,free);
  if(movementKind==='fly'){
    // Approved map flight measures horizontal travel. Ground occupants do not
    // block its line, but the destination still needs a free legal footprint.
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
      const cost=Math.hypot(column-start.column,row-start.row)*scale;
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
    for(const [dx,dy] of neighbours){
      const column=current.column+dx,row=current.row+dy;
      if(!valid(column,row))continue;
      const diag=Boolean(dx&&dy);
      if(diag&&(!valid(column,current.row)||!valid(current.column,row)))continue;
      const cost=current.cost+scale*(diag&&current.parity===1?2:1);
      if(cost>allowance+1e-7)continue;
      const next={column,row,parity:diag?1-current.parity:current.parity,cost,previous:current};
      const key=stateKey(next);
      if((best.get(key)?.cost??Infinity)<=cost)continue;
      best.set(key,next);push(queue,next);
    }
  }
  return routes;
}
export function mapRoutePoints(node,columns,rows){
  const path=[];
  for(let entry=node;entry;entry=entry.previous)path.push(mapCellCenter(entry,columns,rows));
  return path.reverse();
}
