import React,{useId,useMemo} from 'react';
import {cellOutline,gridDimensions,mapCell,mapCellKey} from '../../state/battleMapGrid.mjs';

import {MAP_TERRAIN_TYPES,paintTerrainCell} from '../../state/battleMapTerrainModel.mjs';
const layerStyle={position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'};
const terrainColors={wall:'#999ca4',door:'#be8650','open-door':'#dba875',blocked:'#cf6c6c',
  cover:'#bbaa89',stairs:'#bd9ace',plain:'#ad8ac1',difficult:'#d9a240',water:'#48adcf',elevation:'#ad8ac1',obstacle:'#a49c85',hazard:'#e86843'};
function cellPaths(map,predicate){
  const parts=[];
  for(let row=0;row<map.gridRows;row++)for(let column=0;column<map.gridColumns;column++){
    if(predicate(row,column))parts.push('M'+cellOutline(map,{row,column}).replaceAll(' ','L')+'Z');
  }
  return parts.join('');
}
export function GridLayer({map,visible}){
  const path=useMemo(()=>visible?cellPaths(map,()=>true):'',
    [visible,map.gridRows,map.gridColumns,map.gridType,map.gridOffsetX,map.gridOffsetY]);
  return <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={layerStyle} aria-hidden="true">
    {path?<path d={path} fill="none" stroke="white" vectorEffect="non-scaling-stroke" strokeOpacity={map.gridOpacity/100}/>:null}
    {(map.terrainCells||[]).map(tile=>{
      const {column,row}=tile,key=mapCellKey(tile);
      return <polygon key={key} points={cellOutline(map,{column,row})} fill={terrainColors[tile.kind]}
        fillOpacity=".32" stroke={terrainColors[tile.kind]} vectorEffect="non-scaling-stroke"/>;
    })}
  </svg>;
}
export function CellFog({map,cells,className}){
  const mask=useId();
  const visible=useMemo(()=>cellPaths(map,(row,column)=>cells[row*map.gridColumns+column]==='1'),
    [cells,map.gridRows,map.gridColumns,map.gridType,map.gridOffsetX,map.gridOffsetY]);
  const explored=useMemo(()=>map.exploredCells?cellPaths(map,(r,c)=>map.exploredCells[r*map.gridColumns+c]==='1'):'',
    [map.exploredCells,map.gridRows,map.gridColumns,map.gridType,map.gridOffsetX,map.gridOffsetY]);
  const layers=useMemo(()=>{
    const paths=[];
    if(map.lightingCells)for(const [code,color] of [['0','#16103b88'],['1','#15183155']])
      paths.push({color,d:cellPaths(map,(r,c)=>cells[r*map.gridColumns+c]==='1'&&map.lightingCells[r*map.gridColumns+c]===code)});
    const colors={fog:'#a6b7c588',smoke:'#7b746f99',rain:'#578cc955',snow:'#d4e6f399',storm:'#38507488','magical darkness':'#28133d99'};
    for(const [key,bits] of Object.entries(map.effectCells||{}))if(colors[key])
      paths.push({color:colors[key],d:cellPaths(map,(r,c)=>bits[r*map.gridColumns+c]==='1')});
    return paths;
  },[cells,map.lightingCells,map.effectCells,map.gridRows,map.gridColumns,map.gridType,map.gridOffsetX,map.gridOffsetY]);
  return <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none"
    style={layerStyle} aria-label="Hidden fog of war">
    {layers.map((layer,i)=><path key={i} d={layer.d} fill={layer.color}/>)}
    <defs><mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="white"/>
      {explored?<path d={explored} fill="#888"/>:null}<path d={visible} fill="black"/></mask></defs>
    <rect width="100" height="100" mask={'url(#'+mask+')'} fill="#080d14"/>
  </svg>;
}
export function GeometryControls({map,patch,locked}){
  return <>
    <label>Grid type<select value={map.gridType||'square'} disabled={locked}
      onChange={e=>patch({gridType:e.target.value})}><option value="hex">Hexagonal</option><option value="square">Square</option></select></label>
    {['X','Y'].map(axis=><label key={axis}>Grid offset {axis} (cells)<input type="number" min="-.49" max=".49" step=".01"
      disabled={locked} value={map['gridOffset'+axis]||0} onChange={e=>patch({['gridOffset'+axis]:Number(e.target.value)})}/></label>)}
  </>;
}
export function TerrainControls({brush,onChange}){
  const change=patch=>onChange({...brush,...patch});
  return <fieldset><legend>Terrain brush</legend>
    <label>Terrain<select value={brush.kind} onChange={e=>{
      const kind=e.target.value;
      onChange({kind,elevation:0});
    }}>{[...MAP_TERRAIN_TYPES,'erase'].map(kind=><option key={kind}>{kind}</option>)}</select></label>
    {brush.kind!=='erase'?<>
      <label>Movement<select value={brush.blocksMovement??'default'} onChange={e=>change({blocksMovement:e.target.value==='default'?undefined:e.target.value==='true'})}>
        <option value="default">Terrain rule</option><option value="true">Blocked</option><option value="false">Open</option></select></label>
      <label>Line of sight<select value={brush.blocksSight??'default'} onChange={e=>change({blocksSight:e.target.value==='default'?undefined:e.target.value==='true'})}>
        <option value="default">Terrain rule</option><option value="true">Blocked</option><option value="false">Open</option></select></label>
      <label>Elevation (m)<input type="number" value={brush.elevation||0} min="-100" max="100" step=".01"
        onChange={e=>change({elevation:Number(e.target.value)})}/></label>
    </>:null}
  </fieldset>;
}
export const firstTerrainBrush={kind:'wall',elevation:0};
export function terrainAtPoint(map,point,brush){
  const cell=mapCell(point,map.gridColumns,map.gridRows,map);
  if(!cell)return map.terrainCells||[];
  const erase=brush.kind==='erase';
  const restrictions=erase?{}:{blocksMovement:brush.blocksMovement,blocksSight:brush.blocksSight};
  return paintTerrainCell(map.terrainCells,map.gridColumns,map.gridRows,cell,erase?'plain':brush.kind,erase?0:brush.elevation,restrictions);
}
export function RouteReading({result}){
  return <>Straight {result.metres} m · Grid {result.gridMetres} m · Path {result.pathMetres===null?'unavailable':result.pathMetres+' m'}</>;
}
export function AreaControls({value,onChange}){
  const patch=values=>onChange({...value,...values});
  return <fieldset><legend>Spell or talent area</legend>
    <label>Shape<select value={value.shape} onChange={e=>patch({shape:e.target.value})}>
      <option value="">None</option>{['circle','cone','line','rectangle'].map(kind=><option key={kind}>{kind}</option>)}</select></label>
    {value.shape?<label>{value.shape==='circle'?'Source radius':'Source length'} (m)<input type="number" min=".01" step="any"
      value={value.length||''} onChange={e=>patch({length:Number(e.target.value)})}/></label>:null}
    {value.shape==='cone'?<label>Source angle (degrees)<input type="number" min="1" max="360" value={value.angle||''}
      onChange={e=>patch({angle:Number(e.target.value)})}/></label>:null}
    {['line','rectangle'].includes(value.shape)?<label>Source width (m)<input type="number" min="0" step="any" value={value.width??''}
      onChange={e=>patch({width:Number(e.target.value)})}/></label>:null}
  </fieldset>;
}
export function AreaOverlay({map,points,area}){
  if(!points.length||!area.shape||!(area.length>0)||!Number.isFinite(area.length))return null;
  const {width,height}=gridDimensions(map),scale=map.metresPerCell||1;
  const x=points[0].x*width/100,y=points[0].y*height/100,r=area.length/scale;
  const angle=points[1]?Math.atan2((points[1].y-points[0].y)*height,(points[1].x-points[0].x)*width)*180/Math.PI:0;
  const half=(area.angle||0)*Math.PI/360,w=(area.width||0)/scale;
  let shape;
  if(area.shape==='circle'||area.shape==='cone'&&area.angle===360)shape=<circle r={r}/>;
  else if(points.length<2)return null;
  else if(area.shape==='cone'&&area.angle>0&&area.angle<360){
    const end=r*Math.cos(half),side=r*Math.sin(half);
    shape=<path d={'M0 0 L'+end+' '+(-side)+' A'+r+' '+r+' 0 '+(area.angle>180?1:0)+' 1 '+end+' '+side+' Z'}/>;
  }else if(['line','rectangle'].includes(area.shape)){
    shape=w>0?<rect x="0" y={-w/2} width={r} height={w}/>:area.shape==='line'?<line x2={r}/>:null;
  }
  return shape?<svg viewBox={'0 0 '+width+' '+height} preserveAspectRatio="none" style={layerStyle}
    aria-label="Ability area preview"><g transform={'translate('+x+' '+y+') rotate('+angle+')'}
      fill="#a480dc55" stroke="#c6a9fa" strokeWidth=".05">{shape}</g></svg>:null;
}
