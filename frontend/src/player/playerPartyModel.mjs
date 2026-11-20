import {safeDashboardArtwork} from '../../../src/state/playerHudMedia.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const rows=value=>Array.isArray(value)?value:[];
const text=(value,length=2000)=>typeof value==='string'?value.slice(0,length):'';
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
export const PARTY_ORGANIZATION_TYPES=Object.freeze([
  'Adventure Party','Business','Guild','Mercenary Company','Religious Order',
  'Custom Organization'
]);

export function validatePartyNotes(value){
  if(typeof value!=='string'||value.length>20000)
    throw Error('Shared party notes must be at most 20,000 characters.');
  return value;
}
export function validatePartyMessage(value){
  if(typeof value!=='string'||!value.trim()||value.length>2000)
    throw Error('Enter a party message of at most 2,000 characters.');
  return value.trim();
}
export function validatePartyOrganization(input){
  if(!object(input)||typeof input.name!=='string'||!input.name.trim()||
    input.name.trim().length>120||!PARTY_ORGANIZATION_TYPES.includes(input.type))
    throw Error('Enter an organization name and supported type.');
  return Object.freeze({name:input.name.trim(),type:input.type});
}
function time(value){
  if(typeof value?.toMillis==='function')return value.toMillis();
  if(Number.isFinite(value?.seconds))return value.seconds*1000;
  if(typeof value==='string'){const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:0;}
  if(Number.isFinite(value))return value;
  return 0;
}
function safeHp(value){
  if(!Array.isArray(value)||value.length!==2)return null;
  const [current,maximum]=value.map(Number);
  if(!Number.isFinite(current)||!Number.isFinite(maximum)||maximum<0)return null;
  return Object.freeze([Math.max(0,Math.min(maximum,current)),maximum]);
}
/** Public member cards use campaign-visible characters only. A server-backed
 * membership listener is responsible for revoking the entire feed. */
export function projectPartyMembers(campaign={},records=[]){
  const summaries=object(campaign.characters)?campaign.characters:{};
  const byId=new Map(rows(records).filter(row=>object(row)&&ID.test(String(row.id||'')))
    .map(row=>[row.id,row]));
  const ids=[...new Set([...rows(campaign.party).filter(x=>typeof x==='string'),
    ...Object.keys(summaries),...byId.keys()])].filter(id=>ID.test(id)).slice(0,100);
  return Object.freeze(ids.map(id=>{
    const summary=object(summaries[id])?summaries[id]:{},detail=byId.get(id)||{};
    return Object.freeze({
      id,name:text(detail.name||summary.name||'Linked Character',120),
      klass:text(detail.klass||detail.class||summary.klass||summary.class,100),
      level:Number.isFinite(Number(detail.level??summary.level))?
        Math.max(0,Math.floor(Number(detail.level??summary.level))):0,
      image:safeDashboardArtwork(detail.image,detail.portrait,summary.image),
      hp:safeHp(detail.hp)
    });
  }));
}
export function projectPartyWorkspace(workspace={},members=[]){
  const notes=text(workspace?.sharedNotes,20000);
  const memberIds=new Set(rows(members).map(item=>item.id));
  const organizations=rows(workspace?.organizations).slice(0,100).filter(object)
    .filter(row=>ID.test(String(row.id||''))).map(row=>Object.freeze({
      id:row.id,name:text(row.name,120),type:text(row.type,80),
      notes:text(row.notes,20000),
      memberCharacterIds:Object.freeze(rows(row.memberCharacterIds)
        .filter(id=>typeof id==='string'&&memberIds.has(id)).slice(0,100))
    }));
  return Object.freeze({sharedNotes:notes,organizations:Object.freeze(organizations)});
}
export function projectPartyMessages(messages=[],members=[]){
  const memberIds=new Set(rows(members).map(item=>item.id));
  return Object.freeze(rows(messages).filter(object).slice(-100)
    .filter(row=>ID.test(String(row.id||''))&&memberIds.has(row.characterId))
    .map(row=>Object.freeze({
      id:row.id,characterId:row.characterId,
      characterName:text(row.characterName||'Party Member',120),
      text:text(row.text,2000),at:time(row.createdAt)
    })).sort((a,b)=>a.at-b.at));
}
export function projectPartyPresence(presences=[],members=[]){
  const memberIds=new Set(rows(members).map(row=>row.id));
  return Object.freeze([...new Set(rows(presences).filter(object).filter(row=>
    typeof row.characterId==='string'&&memberIds.has(row.characterId)&&
    row.online!==false).map(row=>row.characterId))]);
}
