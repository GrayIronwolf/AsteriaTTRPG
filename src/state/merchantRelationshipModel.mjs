// Phase 10.3 — campaign-local, server-authored merchant relationships.
// Standing is not a discount or currency modifier. Locked stock retains
// its ordinary listed price and may be traded only when access is verified.
export const MAX_MERCHANT_RELATIONSHIP_SCORE=100;
export const MAX_MERCHANT_RELATIONSHIP_HISTORY=20;
const label=(s,max=240)=>typeof s==='string'?s.trim().slice(0,max):'';
export function validateMerchantStanding(score){
  if(!Number.isSafeInteger(score)||score< -100||score>100)
    throw Error('Merchant standing must be a whole number from -100 to 100.');
  return score;
}
export function merchantStandingTier(score=0){
  const n=validateMerchantStanding(Number(score));
  if(n>=70)return 'Trusted';
  if(n>=30)return 'Respected';
  if(n<=-70)return 'Hostile';
  if(n<=-30)return 'Distrusted';
  return 'Neutral';
}
export function merchantRelationshipId(shopId,characterId){
  const valid=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(s)&&
    !['__proto__','prototype','constructor'].includes(s);
  if(!valid(shopId)||!valid(characterId))throw Error('Invalid merchant or character.');
  return String(shopId.length)+'_'+shopId+'_'+characterId;
}
export function merchantStandingFor(relationships=[],shopId='',characterId=''){
  const found=(Array.isArray(relationships)?relationships:[])
    .find(row=>row?.shopId===shopId&&row?.characterId===characterId);
  return found?validateMerchantStanding(found.score):0;
}
export function validateMerchantOpportunity(minStanding=0,opportunityLabel=''){
  if(!Number.isSafeInteger(minStanding)||minStanding<0||minStanding>100)
    throw Error('Special access requires a standing threshold from 0 to 100.');
  if(typeof opportunityLabel!=='string'||opportunityLabel.length>160)
    throw Error('Special opportunity label must be 160 characters or fewer.');
  return {minStanding,opportunityLabel:label(opportunityLabel,160)};
}
export function merchantCanAccessStock(stock={},standing=0){
  const required=stock?.minStanding??0;
  const value=Number.isSafeInteger(required)&&required>=0&&required<=100?required:Infinity;
  return value===0||validateMerchantStanding(Number(standing))>=value;
}
export function updateMerchantRelationship(current={},operation={},identity={}){
  const score=validateMerchantStanding(operation.score);
  if(typeof operation.message!=='string'||operation.message.length>500)
    throw Error('Relationship message must be 500 characters or fewer.');
  const history=Array.isArray(current.history)?current.history:[];
  return {
    shopId:identity.shopId,characterId:identity.characterId,ownerUid:identity.ownerUid,
    score,tier:merchantStandingTier(score),
    message:label(operation.message,500),
    history:[
      {score,message:label(operation.message,500),id:identity.operationId||''},
      ...history
    ].slice(0,MAX_MERCHANT_RELATIONSHIP_HISTORY)
  };
}
export function merchantOpportunitySummary(shop={},score=0){
  return (Array.isArray(shop.stock)?shop.stock:[])
    .map((row,index)=>({
      index,itemName:row.item?.identified===false?'Unidentified Item':
        label(row.item?.name||row.item?.title,160)||'Item',
      required:Number(row.minStanding??0),
      label:label(row.opportunityLabel,160),
      unlocked:merchantCanAccessStock(row,score)
    }))
    .filter(row=>row.required>0);
}
