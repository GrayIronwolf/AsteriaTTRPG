/**
 * GM party roster for the existing Digital GM Toolkit.
 * Read-only: actual character and membership changes stay in their established
 * GM campaign / character workspaces and permission gates.
 */
const safeMap=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};

export function gmPartyRoster({campaign={},characters={},query=''}={}){
  const byId=safeMap(characters);
  const members=Array.isArray(campaign?.party)&&campaign.party.length
    ? campaign.party:Object.keys(byId);
  const seen=new Set();
  const roster=[];
  for(const key of members){
    if(typeof key!=='string'||seen.has(key))continue;
    seen.add(key);
    const character=byId[key];
    if(!character||typeof character!=='object'||Array.isArray(character))continue;
    const name=String(character.name||'Unnamed Character').slice(0,120);
    const characterClass=String(character.klass||character.class||'Class not set').slice(0,90);
    const level=Number(character.level);
    roster.push({
      id:key,
      name,
      characterClass,
      level:Number.isFinite(level)&&level>=0?Math.trunc(level):null,
      character
    });
  }
  const term=String(query||'').trim().toLocaleLowerCase().slice(0,100);
  return {
    count:roster.length,
    rows:term?roster.filter(row=>[row.name,row.characterClass,row.id]
      .some(text=>text.toLocaleLowerCase().includes(term))):roster
  };
}
