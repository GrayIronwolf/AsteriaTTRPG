import {battleMapPoint,BATTLE_MAP_MAX_TOKENS} from './battleMapModel.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const pointNumber=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100;

/** Prepared enemy positions belong to GM encounter templates, not shared maps. */
export function preparedEnemySpawn(value){
  if(value===undefined||value===null)return null;
  if(!object(value)||!pointNumber(value.x)||!pointNumber(value.y))
    throw Error('Enemy starting positions must be within the battle map.');
  return {x:Math.round(value.x*100)/100,y:Math.round(value.y*100)/100};
}
export function setPreparedEnemySpawn(enemies,index,point,map){
  if(!Array.isArray(enemies)||!Number.isSafeInteger(index)||index<0||index>=enemies.length)
    throw Error('Select an enemy to place on the battle map.');
  if(!map||!Number.isSafeInteger(map.gridColumns)||!Number.isSafeInteger(map.gridRows)||
    map.gridColumns<1||map.gridColumns>80||map.gridRows<1||map.gridRows>80)
    throw Error('A valid battle map grid is required to place enemies.');
  const valid=preparedEnemySpawn(point);
  if(!valid)throw Error('Select a valid map position.');
  const snapped=battleMapPoint(valid.x,valid.y,{
    columns:map.gridColumns,rows:map.gridRows,snap:true
  });
  return enemies.map((enemy,i)=>i===index?{...enemy,spawn:snapped}:enemy);
}
export function clearPreparedEnemySpawns(enemies){
  if(!Array.isArray(enemies))return [];
  return enemies.map(enemy=>{
    const rest={...enemy};
    delete rest.spawn;
    return rest;
  });
}
export function preparedBattleMapPreview(map,enemies=[]){
  if(!map||!object(map))return null;
  const tokens=(Array.isArray(map.tokens)?map.tokens:[]).filter(row=>!row.combatantId);
  const placements=(Array.isArray(enemies)?enemies:[]).flatMap((enemy,index)=>{
    let position;
    try{position=preparedEnemySpawn(enemy?.spawn);}catch{return [];}
    return position?[{
      id:'preview-spawn-'+(index+1),kind:'creature',refId:'',
      label:String(enemy.name||'Enemy').slice(0,48)||'Enemy',...position
    }]:[];
  });
  return {...map,tokens:[...tokens,...placements]};
}
export function preparedMapTokenCapacity(map,enemyCount,linkedPlayerCount=0){
  const manual=Array.isArray(map?.tokens)?map.tokens.filter(row=>!row.combatantId).length:0;
  const enemies=Number.isSafeInteger(enemyCount)&&enemyCount>=0?enemyCount:0;
  const players=Number.isSafeInteger(linkedPlayerCount)&&linkedPlayerCount>=0?linkedPlayerCount:0;
  const required=manual+enemies+players;
  return {manual,enemies,players,required,limit:BATTLE_MAP_MAX_TOKENS,
    available:required<=BATTLE_MAP_MAX_TOKENS};
}
