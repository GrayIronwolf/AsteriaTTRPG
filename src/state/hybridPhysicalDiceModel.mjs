/** Physical dice are witnessed by the GM, not independently trusted by the combat
 * engine. Recording a face here never applies HP, AP, damage or spell effects.
 * The canonical GM combat transaction owns the audit trail and revision.
 */
export const PHYSICAL_DICE_FACES=Object.freeze([4,6,8,10,12,20,100]);
const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(value)&&
  !['__proto__','constructor','prototype'].includes(value);
export function validatePhysicalDiceRecord(input={},combatants=[]){
  if(!input||typeof input!=='object'||Array.isArray(input)||
    Object.keys(input).some(key=>![
      'operation','revision','targetId','faces','result','reason'
    ].includes(key))||input.operation!=='record-physical-roll')
    throw Error('Unsupported physical dice submission.');
  const faces=input.faces,result=input.result;
  if(!PHYSICAL_DICE_FACES.includes(faces)||
    !Number.isSafeInteger(result)||result<1||result>faces)
    throw Error('Enter a valid physical die face and result.');
  if(!safeId(input.targetId)||
    !combatants.some(row=>row.id===input.targetId))
    throw Error('Select an encounter participant.');
  const reason=typeof input.reason==='string'?input.reason.trim():'';
  if(reason.length<3||reason.length>160)throw Error('Record a 3–160 character roll purpose.');
  return Object.freeze({
    targetId:input.targetId,faces,result,reason
  });
}
