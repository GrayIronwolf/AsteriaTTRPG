import {mapCell,mapCellKey,gridSteps,gridDimensions} from './battleMapGrid.mjs';
import {collectCharacterEffects,evaluateEffects,effectIsActive} from './effectsEngine.mjs';

const range=(n,max=10000)=>Number.isFinite(n)&&n>=0&&n<=max;
export const VISION_EFFECTS=['fog','smoke','rain','snow','storm','magical darkness'];
export function visionSettings(raw={},length){
  const ambient=raw.ambient??'daylight',weatherLimit=raw.weatherLimit??0;
  if(!['daylight','dim','dark'].includes(ambient)||!range(weatherLimit))throw Error('Invalid scene lighting or sight distance.');
  const overrides=raw.overrides||'';
  if(overrides&&(overrides.length!==length||!/^[01-]+$/.test(overrides)))throw Error('Manual visibility does not match the grid.');
  const sources=raw.sources??[];
  if(!Array.isArray(sources)||sources.length>40)throw Error('A map supports up to 40 light sources and effects.');
  const checked=sources.map(row=>{
    if(!row||!['light',...VISION_EFFECTS].includes(row.kind)||!range(row.x,100)||!range(row.y,100)||
      !range(row.radius)||!row.radius)throw Error('Place the source on the map and enter a positive radius.');
    const rule=String(row.rule||'').trim();
    if(rule.length>160||row.affectsSight&&!rule)throw Error('Identify the existing rule before affecting sight.');
    return {kind:row.kind,x:row.x,y:row.y,radius:row.radius,affectsSight:row.affectsSight===true,rule};
  });
  const senses={};
  for(const [id,record] of Object.entries(raw.senses||{})){
    if(!/^[a-zA-Z0-9_-]{1,120}$/.test(id)||!record||Object.keys(senses).length>=60)throw Error('Invalid observer.');
    for(const key of ['normal','dim','dark'])if(record[key]!=null&&!range(record[key]))throw Error('Invalid observer range.');
    senses[id]=Object.fromEntries(['normal','dim','dark'].filter(key=>record[key]!=null).map(key=>[key,record[key]]));
  }
  return {automatic:raw.automatic===true,ambient,weatherLimit,overrides,sources:checked,senses,
    resetId:String(raw.resetId||'').slice(0,80)};
}
export function characterSight(character={},encounter={}){
  const race=character.raceData||character.raceInfo||character.race||{};
  // These published race sheets specify numeric sight ranges. Older characters
  // can contain only a race slug, without a saved copy of its Senses field.
  const ancestry=String(character.raceSlug||race.slug||race.name||race.title||race).toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const racialSense={'cavern-sprite':'Dark Vision 30m','polaris-ursa':'Low-Light Vision 30m'}[ancestry];
  const labels=[racialSense,character.senses,race.senses,race.Senses,race.properties?.Senses,
    ...[character.racialTraits,character.raceTraits,race.traits].filter(Array.isArray).flat()
      .map(row=>typeof row==='string'?row:[row?.name,row?.range,row?.description].filter(Boolean).join(' '))];
  const numbers={dark:0,dim:0};
  for(const text of labels.filter(value=>typeof value==='string')){
    for(const match of text.matchAll(/\b(dark[ -]?vision|low[ -]light vision)\s*[:–-]?\s*(\d+(?:\.\d+)?)\s*m\b/gi)){
      const key=match[1].toLowerCase().startsWith('dark')?'dark':'dim';
      numbers[key]=Math.max(numbers[key],Number(match[2]));
    }
  }
  const traits=character.vision||{},clock={encounter};
  const effects=collectCharacterEffects(character,clock);
  const sight={};
  for(const key of ['normal','dim','dark']){
    const base=range(traits[key])?traits[key]:numbers[key]??10000;
    sight[key]=Math.max(0,Math.min(10000,evaluateEffects(base,'vision.'+key,effects,clock).value));
  }
  const conditions=Array.isArray(character.conditions)?character.conditions:Object.values(character.conditions||{});
  if(conditions.some(row=>effectIsActive(row,clock)&&/^(blind|blinded)$/i.test(row.name||row.id||'')))
    return {normal:0,dim:0,dark:0};
  return sight;
}
const axial=({column,row})=>({q:column-Math.floor(row/2),r:row});
function roundHex(q,r){
  const s=-q-r;let x=Math.round(q),y=Math.round(r);
  const z=Math.round(s),dx=Math.abs(x-q),dy=Math.abs(y-r),dz=Math.abs(z-s);
  if(dx>dy&&dx>dz)x=-y-z;else if(dy>dz)y=-x-z;
  return {column:x+Math.floor(y/2),row:y};
}
// On a shared edge, both adjacent cells must permit sight. The blocking
// surface itself is visible. An observer cannot see a cell behind it.
export function lineOfSight(a,b,hex,opaque){
  if(!opaque.size)return true;
  const blocked=(x,y)=>!(x===b.column&&y===b.row)&&opaque.has(x+':'+y);
  if(hex){
    const from=axial(a),to=axial(b),steps=gridSteps(a,b,true);
    for(let i=1;i<steps;i++)for(const nudge of [-1e-6,1e-6]){
      const t=i/steps,cell=roundHex(from.q+(to.q-from.q)*t+nudge,from.r+(to.r-from.r)*t+nudge);
      if(blocked(cell.column,cell.row))return false;
    }
    return true;
  }
  const nx=Math.abs(b.column-a.column),ny=Math.abs(b.row-a.row);
  const sx=Math.sign(b.column-a.column),sy=Math.sign(b.row-a.row);
  let x=a.column,y=a.row,ix=0,iy=0;
  while(ix<nx||iy<ny){
    const decision=(1+2*ix)*ny-(1+2*iy)*nx;
    if(decision===0&&(blocked(x+sx,y)||blocked(x,y+sy)))return false;
    if(decision<=0){x+=sx;ix++;}
    if(decision>=0){y+=sy;iy++;}
    if(blocked(x,y))return false;
  }
  return true;
}
export function explorationKey(map){
  return [map.gridType||'square',map.gridColumns,map.gridRows,map.gridOffsetX||0,map.gridOffsetY||0,map.vision?.resetId||''].join('|');
}
export function partyVisibility(map,encounter={},characters={}){
  const g=gridDimensions(map),size=g.cols*g.rows,settings=visionSettings(map.vision,size);
  const opaque=new Set((map.terrainCells||[]).filter(cell=>cell.blocksSight??['wall','door'].includes(cell.kind)).map(mapCellKey));
  const scale=map.metresPerCell??1;
  const xy=cell=>({x:cell.column+.5+(g.hex?(cell.row%2)/2:0),y:g.hex?cell.row*Math.sqrt(3)/2+1/Math.sqrt(3):cell.row+.5});
  const cells=Array.from({length:size},(_,i)=>{
    const cell={column:i%g.cols,row:Math.floor(i/g.cols)};
    return {...cell,...xy(cell),index:i};
  });
  const lamps=[],effects=Object.create(null),obscured=new Set();
  for(const src of settings.sources){
    const sourceCell=mapCell(src,g.cols,g.rows,map);
    const x=src.x*g.width/100-g.dx,y=src.y*g.height/100-g.dy;
    const affected=cells.filter(c=>Math.hypot(c.x-x,c.y-y)*scale<=src.radius+1e-7);
    if(src.kind==='light'){lamps.push({sourceCell,affected});continue;}
    const mask=effects[src.kind]??=new Set();
    for(const c of affected){
      mask.add(c.index);
      if(src.affectsSight){
        obscured.add(c.index);
        opaque.add(mapCellKey(c));
      }
    }
  }
  const illuminated=new Set();
  for(const lamp of lamps)for(const cell of lamp.affected)
    if(lineOfSight(lamp.sourceCell,cell,g.hex,opaque))illuminated.add(cell.index);
  const actors=new Map((encounter.combatants||[]).map(row=>[row.id,row]));
  const visible=Array(size).fill('0'),observers=new Set();
  for(const token of map.tokens||[]){
    const actor=actors.get(token.combatantId);
    if(token.kind!=='character'||token.visibility==='gm'||token.combatantId&&(!actor||actor.defeated))continue;
    const charId=actor?.characterId||token.refId,character=characters instanceof Map?characters.get(charId):characters[charId];
    if(!charId||!character)continue;
    const origin=mapCell(token,g.cols,g.rows,map),centre=xy(origin);
    const sense={...characterSight(character,encounter),...settings.senses[token.id]};
    visible[origin.row*g.cols+origin.column]='1';
    observers.add(origin.row*g.cols+origin.column);
    if(obscured.has(origin.row*g.cols+origin.column))continue;
    for(const cell of cells){
      if(visible[cell.index]==='1')continue;
      const distance=Math.hypot(cell.x-centre.x,cell.y-centre.y)*scale;
      const lit=illuminated.has(cell.index),normal=settings.ambient==='daylight'||lit;
      const max=normal?sense.normal:settings.ambient==='dim'?Math.max(sense.dim,sense.dark):sense.dark;
      if(distance<=Math.min(max,settings.weatherLimit||Infinity)+1e-7&&lineOfSight(origin,cell,g.hex,opaque))
        visible[cell.index]='1';
    }
  }
  const memory=map.explorationKey===explorationKey(map)&&map.exploredCells?.length===size?map.exploredCells:'';
  const explored=Array(size),lighting=Array(size);
  for(const cell of cells){
    const i=cell.index,override=settings.overrides[i];
    if(override==='0'||override==='1')visible[i]=override;
    explored[i]=visible[i]==='1'||memory[i]==='1'&&override!=='0'?'1':'0';
    lighting[i]=visible[i]!=='1'?'0':illuminated.has(i)||settings.ambient==='daylight'?'2':settings.ambient==='dim'?'1':'0';
  }
  return {tokenCells:visible.map((v,i)=>obscured.has(i)&&!observers.has(i)&&settings.overrides[i]!=='1'?'0':v).join(''),fogCells:visible.join(''),exploredCells:explored.join(''),lightingCells:lighting.join(''),
    effectCells:Object.fromEntries(Object.entries(effects).map(([kind,bits])=>[kind,cells.map(c=>visible[c.index]==='1'&&bits.has(c.index)?'1':'0').join('')]).filter(([,mask])=>mask.includes('1')))};
}
