/** Read generated PUBLIC Forge rule projections, never the raw Compendium. */
const importers=import.meta.glob('./public-rules/*.json',{import:'default'});
export const FORGE_DOMAINS=Object.freeze([
 'race','class','religion','origin','skill','item','talent'
]);
const MAX_RULES={race:1000,class:1000,religion:1000,origin:1000,
 skill:2000,item:10000,talent:10000};
export async function loadPublicForgeRules(){
 const result={};
 for(const domain of FORGE_DOMAINS){
  const importer=importers['./public-rules/'+domain+'.json'];
  if(!importer)throw new Error('Public Forge rules are not built: '+domain);
  const shard=await importer();
  if(shard.version!==1||shard.domain!==domain||
     !Array.isArray(shard.entries)||shard.entries.length>MAX_RULES[domain]||
     shard.entries.some(row=>!row || row.domain!==domain||
       typeof row.id!=='string'||!row.id.startsWith(domain+':')||
       typeof row.title!=='string'||typeof row.slug!=='string'||
       typeof row.rules!=='object'||!Array.isArray(row.categoryPath)||
       typeof row.playable!=='boolean'))
    throw new Error('Malformed public Forge rule projection: '+domain);
  result[domain]=Object.freeze(shard.entries.filter(entry=>entry.playable===true)
    .map(entry=>Object.freeze(entry)));
 }
 return Object.freeze(result);
}
