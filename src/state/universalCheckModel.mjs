// Universal check engine — approved Asteria rank mapping.
// Isolated from legacy combat progression until numeric-rank migration is reviewed.
export const UNIVERSAL_CHECK_RANKS=Object.freeze({
  Untrained:-2,Novice:-1,Apprentice:0,Journeyman:1,
  Adept:2,Expert:3,Master:4,Grandmaster:5
});
export const UNIVERSAL_CHECK_TYPES=Object.freeze([
  'skill','characteristic','social','saving','opposed','crafting','group'
]);
export function universalSkillRankModifier(rank){
  const name=String(rank??'').trim().toLowerCase();
  const key=Object.keys(UNIVERSAL_CHECK_RANKS).find(k=>k.toLowerCase()===name);
  if(!key)throw new Error('A named approved skill rank is required; legacy numeric ranks need conversion.');
  return UNIVERSAL_CHECK_RANKS[key];
}
export function universalCheckOutcome(die,modifier,dc,{opposed=false}={}){
  if(!Number.isInteger(die)||die<1||die>20)throw new Error('A d20 result from 1 to 20 is required.');
  if(!Number.isFinite(modifier)||!Number.isFinite(dc)||Math.abs(modifier)>100000||Math.abs(dc)>100000)
    throw new Error('Invalid check modifier or DC.');
  const total=die+modifier;
  const success=opposed?total>dc:die===1?false:die===20?true:total>=dc;
  return {die,modifier,dc,total,success,
    outcome:die===1?'critical-failure':die===20?'critical-success':success?'success':'failure'};
}
export function universalCheckModifierBreakdown(parts=[]){
  if(!Array.isArray(parts)||parts.length>30)throw new Error('Invalid modifier breakdown.');
  const entries=parts.map(row=>{
    const value=Number(row?.value);
    if(!Number.isFinite(value)||Math.abs(value)>100000||typeof row?.label!=='string'||row.label.length>120)
      throw new Error('Invalid modifier entry.');
    return {label:row.label,value};
  });
  return {entries,total:entries.reduce((sum,row)=>sum+row.value,0)};
}
