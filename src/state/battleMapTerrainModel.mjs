// Milestone 3.4: bounded, sparse terrain authored by the GM.
// Persist only public mechanical properties on map documents. GM notes and
// unrevealed encounters belong in separate private campaign documents.
export const MAP_GRID_TYPES=Object.freeze(['square','hex']);
export const MAP_TERRAIN_TYPES=Object.freeze(['plain','difficult','wall','water','hazard','cover','stairs','door','open-door','blocked','obstacle']);
export const MAX_TERRAIN_CELLS=6400;
export const mapGridType=type=>type==='hex'?'hex':'square';
const integer=(n,min,max,label)=>{
  if(!Number.isInteger(n)||n<min||n>max)throw Error('Invalid terrain '+label+'.');
  return n;
};
export function validateTerrainCells(value,columns,rows){
  const cols=integer(columns,1,80,'columns'),count=integer(rows,1,80,'rows');
  if(value==null)return [];
  if(!Array.isArray(value)||value.length>Math.min(MAX_TERRAIN_CELLS,cols*count))
    throw Error('Terrain must be a sparse list within the map grid.');
  const seen=new Set(),result=[];
  for(const cell of value){
    if(!cell||typeof cell!=='object'||Array.isArray(cell))
      throw Error('Invalid terrain cell.');
    const column=integer(cell.column,0,cols-1,'column');
    const row=integer(cell.row,0,count-1,'row');
    const key=row*cols+column;
    if(seen.has(key))throw Error('Duplicate terrain cell.');
    seen.add(key);
    const kind=cell.kind??'plain';
    if(!MAP_TERRAIN_TYPES.includes(kind))throw Error('Unknown terrain type.');
    const elevation=cell.elevation??0;
    if(typeof elevation!=='number'||!Number.isFinite(elevation)||
      elevation<-100||elevation>100||
      Math.abs(Math.round(elevation*100)-elevation*100)>1e-7)
      throw Error('Terrain elevation must be -100 to 100 metres.');
    const restrictions={};
    for(const field of ['blocksMovement','blocksSight']){
      if(cell[field]===undefined)continue;
      if(typeof cell[field]!=='boolean')throw Error('Invalid terrain restriction.');
      restrictions[field]=cell[field];
    }
    if(kind!=='plain'||elevation!==0||Object.keys(restrictions).length)
      result.push({column,row,kind,elevation,...restrictions});
  }
  return result.sort((a,b)=>a.row-b.row||a.column-b.column);
}
export function resizeTerrainCells(value,oldCols,oldRows,newCols,newRows){
  const source=validateTerrainCells(value,oldCols,oldRows);
  if(oldCols===newCols&&oldRows===newRows)return source;
  const mapped=new Map();
  for(const cell of source){
    const column=Math.min(newCols-1,Math.floor((cell.column+.5)*newCols/oldCols));
    const row=Math.min(newRows-1,Math.floor((cell.row+.5)*newRows/oldRows));
    mapped.set(row*newCols+column,{...cell,column,row});
  }
  return validateTerrainCells([...mapped.values()],newCols,newRows);
}
export function paintTerrainCell(value,columns,rows,cell,kind,elevation=0,restrictions={}){
  const cells=validateTerrainCells(value,columns,rows);
  const column=integer(cell?.column,0,columns-1,'column');
  const row=integer(cell?.row,0,rows-1,'row');
  const next=cells.filter(item=>item.column!==column||item.row!==row);
  return validateTerrainCells([...next,{...restrictions,column,row,kind,elevation}],columns,rows);
}
export function terrainIndex(map){
  const columns=Number(map?.gridColumns),rows=Number(map?.gridRows);
  return new Map(validateTerrainCells(map?.terrainCells,columns,rows)
    .map(cell=>[cell.column+':'+cell.row,cell]));
}
export function terrainMoveMultiplier(kind,mode){
  if(['wall','door','blocked','obstacle'].includes(kind))return null;
  if(kind==='water'&&!['swim','fly','teleport'].includes(mode))return null;
  if(kind==='difficult'&&!['fly','jump','teleport'].includes(mode))return 2;
  return 1;
}
// Player projections omit terrain behind fog. This prevents the UI from
// revealing unseen obstructions through terrain metadata.
export function publicTerrainCells(map,visibleFog){
  const terrain=validateTerrainCells(map?.terrainCells,Number(map.gridColumns),Number(map.gridRows));
  // Hazard tiles may represent concealed traps; retain them in the GM-only
  // original and never advertise their classification in public map metadata.
  const safe=terrain.filter(cell=>cell.kind!=='hazard');
  if(!map.fogEnabled)return safe;
  const columns=Number(map.gridColumns);
  return safe.filter(cell=>visibleFog[cell.row*columns+cell.column]==='1');
}
