import {gmPartyRoster} from '../../../src/state/gmPartyControlModel.mjs';

const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
/** Adapt the original read-only GM Party Control to the verified React GM
 * summary (never expose owner-only or GM private character documents).
 */
export function gmPartyManagementRoster(party=[],query=''){
  const safe=Array.isArray(party)?party.filter(member=>
    member&&typeof member==='object'&&!Array.isArray(member)&&
    typeof member.id==='string'&&ID.test(member.id)).slice(0,128):[];
  const characters=Object.fromEntries(safe.map(member=>[member.id,{
    id:member.id,name:member.name,klass:member.className,level:member.level,
    hp:member.hp,sp:member.sp,mp:member.mp,
    soulDamage:member.soulDamage,conditions:member.conditions,
    restRequest:member.restRequest,image:member.image
  }]));
  const original=gmPartyRoster({
    campaign:{party:safe.map(member=>member.id)},
    characters,query
  });
  return Object.freeze({count:original.count,
    rows:Object.freeze(original.rows.map(member=>Object.freeze({
      id:member.id,name:member.name,className:member.characterClass,
      level:member.level,image:member.character.image||'',
      hp:member.character.hp,sp:member.character.sp,mp:member.character.mp,
      soulDamage:Number(member.character.soulDamage)||0,
      conditions:Object.freeze(Array.isArray(member.character.conditions)?
        member.character.conditions:[]),
      restRequest:member.character.restRequest
    })))});
}
export function gmPartyActionsEnabled(session){
  return Boolean(session?.editable===true&&session?.status==='active');
}
