/* Asteria placeholder identity catalogue.
 * This file contains approved public display metadata only: name, category and
 * permanent Asteria ID. Do NOT paste Obsidian markdown, mechanics or lore here.
 * ID assignments must come from a separately verified mapping register.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.AsteriaIndexCards=api;
})(typeof window==='object'?window:null,function(){
  'use strict';
  const ID=/^\d{2}-\d{2}-\d{3}-\d{3}$/;
  const categoryDomains=Object.freeze({
    'Races':'race','Classes':'class','Talents':'talent',
    'Spells & Magic':'spell','Items':'item','Resources & Materials':'item',
    'Schematics':null,'Recipes':null,'Blueprints':null,'Patterns':null,
    'Formulas':null,'Designs':null
  });
  // Deliberately empty: no guessed assignments, unapproved names or vault prose.
  const verifiedMappings=Object.freeze([]);
  function normalize(rows){
    if(!Array.isArray(rows))throw Error('Asteria index mapping must be an array');
    const byId=new Set(),byWebsite=new Set(),byIdentity=new Set();
    return Object.freeze(rows.map(row=>{
      if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid mapping record');
      const keys=Object.keys(row);
      if(keys.some(key=>!['asteriaId','name','category','websiteId'].includes(key)))throw Error('Only name, category and verified identity metadata may be published');
      const {asteriaId,name,category,websiteId}=row;
      if(typeof asteriaId!=='string'||!ID.test(asteriaId))throw Error('Unverified Asteria ID');
      if(typeof name!=='string'||!name.trim()||name.length>140||/[<>\n\r]/.test(name))throw Error('Invalid card name');
      if(!Object.prototype.hasOwnProperty.call(categoryDomains,category))throw Error('Unknown Asteria category');
      if(websiteId!==undefined&&(typeof websiteId!=='string'||!websiteId.trim()||websiteId.length>256))throw Error('Invalid website identity');
      const identity=category+'|'+name.trim().toLocaleLowerCase();
      if(byId.has(asteriaId)||byIdentity.has(identity)||(websiteId&&byWebsite.has(websiteId)))throw Error('Duplicate or ambiguous Asteria mapping');
      byId.add(asteriaId);byIdentity.add(identity);if(websiteId)byWebsite.add(websiteId);
      return Object.freeze({asteriaId,name:name.trim(),category,websiteId:websiteId||null,domain:categoryDomains[category]});
    }));
  }
  let mappings=normalize(verifiedMappings);
  const indexByWebsite=()=>new Map(mappings.filter(row=>row.websiteId).map(row=>[row.websiteId,row]));
  const indexByAsteria=()=>new Map(mappings.map(row=>[row.asteriaId,row]));
  function forWebsite(id){return indexByWebsite().get(id)||null;}
  function all(){return mappings.slice();}
  function forAsteria(id){return indexByAsteria().get(id)||null;}
  function placeholders(existingIds=[],domain=null){
    const present=new Set(existingIds);
    return mappings.filter(row=>!row.websiteId&&!present.has(row.asteriaId)&&(!domain||row.domain===domain));
  }
  // Testing/preview helper only: production mappings are the explicit frozen list above.
  function preview(rows,existingIds=[],domain=null){
    const checked=normalize(rows),present=new Set(existingIds);
    return checked.filter(row=>!row.websiteId&&!present.has(row.asteriaId)&&(!domain||row.domain===domain));
  }
  return Object.freeze({categories:Object.freeze(Object.keys(categoryDomains)),all,forWebsite,forAsteria,placeholders,preview,validate:normalize});
});
