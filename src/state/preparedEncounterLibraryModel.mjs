import {validatePreparedEncounterInput} from './preparedEncounterModel.mjs';

export const PREPARED_LIBRARY_VIEW_MODES=Object.freeze(['active','archived','all']);
export const PREPARED_LIBRARY_SORTS=Object.freeze(['recent','name','enemy-count','oldest']);
const clean=value=>typeof value==='string'?value.trim().toLocaleLowerCase():'';
const timestamp=value=>{
  const result=Date.parse(value||'');
  return Number.isFinite(result)?result:0;
};

/** Query normalized private templates. Never includes players or combat snapshots. */
export function queryPreparedEncounterLibrary(raw=[],options={}){
  const query=clean(options.query).slice(0,120);
  const status=PREPARED_LIBRARY_VIEW_MODES.includes(options.status)?options.status:'active';
  const folder=clean(options.folder),sort=PREPARED_LIBRARY_SORTS.includes(options.sort)?
    options.sort:'recent';
  const results=(Array.isArray(raw)?raw:[]).filter(row=>{
    if(!row||typeof row!=='object')return false;
    if(status==='active'&&row.archived===true)return false;
    if(status==='archived'&&row.archived!==true)return false;
    if(folder&&clean(row.folder)!==folder)return false;
    if(!query)return true;
    const fields=[row.name,row.notes,row.folder,...(Array.isArray(row.tags)?row.tags:[]),
      ...(Array.isArray(row.enemies)?row.enemies.map(enemy=>enemy.name):[])];
    return fields.some(field=>clean(field).includes(query));
  });
  return results.sort((a,b)=>{
    if(sort==='name')return String(a.name).localeCompare(String(b.name));
    if(sort==='enemy-count')return b.enemies.length-a.enemies.length||
      String(a.name).localeCompare(String(b.name));
    return (sort==='recent'?timestamp(b.updatedAt)-timestamp(a.updatedAt):
      timestamp(a.updatedAt)-timestamp(b.updatedAt))||
      String(a.name).localeCompare(String(b.name));
  });
}
export function preparedEncounterFolders(plans=[]){
  return [...new Set((Array.isArray(plans)?plans:[])
    .map(plan=>typeof plan.folder==='string'?plan.folder.trim():'').filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b));
}
export function duplicatePreparedEncounter(plan){
  const original=validatePreparedEncounterInput(plan);
  const name=('Copy of '+original.name).slice(0,100);
  return validatePreparedEncounterInput({...original,name,archived:false});
}
export function setPreparedEncounterArchived(plan,archived){
  if(typeof archived!=='boolean')throw Error('Choose a valid archive state.');
  return validatePreparedEncounterInput({...plan,archived});
}
