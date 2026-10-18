const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// A projection of the canonical definitions, never a second authored catalogue.
function deliveryFiles({root, payload, hydrate, headingName}) {
  const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0,16);
  const words = [...new Set(payload.entries.flatMap(entry => entry.searchTerms.match(/[\p{L}\p{N}]+/gu) || []))].sort();
  const wordIds = new Map(words.map((word,index) => [word,index]));
  function codes(entry) {
    const ids = [...new Set((entry.searchTerms.match(/[\p{L}\p{N}]+/gu) || []).map(word => wordIds.get(word)))].sort((a,b)=>a-b);
    const bytes=[];let previous=0;
    for(const id of ids) {
      let delta=id-previous;previous=id;
      while(delta>=128){bytes.push((delta&127)|128);delta>>>=7;}
      bytes.push(delta);
    }
    return Buffer.from(bytes).toString('base64');
  }
  const files=[],parts=[],entries=[];
  const commonMetadata = ['id','title','slug','domain','type','categoryPath','aliases','tags','visibility','images'];
  function flush(domain,records) {
    if(!records.length)return;
    const compact=records.map(entry=>{
      const {sections,content,name,tabs,description,searchTerms,...record}=entry;
      return {...record,metadata:Object.fromEntries(Object.entries(record.metadata).filter(([key])=>!key.endsWith('Markdown')&&key!=='rankDetails'))};
    });
    const text=JSON.stringify({domain,entries:compact})+'\n';
    const url=`compendium-parts/${domain}-${hash(text)}.json`,part=parts.length;
    parts.push({domain,url,ids:records.map(entry=>entry.id)});
    files.push([path.join(root,'data',url),text]);
    for(const entry of records) {
      const {sections,content,name,tabs,description,searchTerms,body,imageReferences,sourceFolder,...record}=entry;
      const metadata=Object.fromEntries(Object.entries(record.metadata).filter(([key,value])=>!key.endsWith('Markdown')&&key!=='rankDetails'&&!(commonMetadata.includes(key)&&JSON.stringify(record[key])===JSON.stringify(value))));
      entries.push({...record,metadata,body:'',part,searchCodes:codes(entry)});
    }
  }
  for(const domain of Object.keys(payload.domains)) {
    let group=[],size=0;
    for(const entry of payload.entries.filter(entry=>entry.domain===domain)) {
      const next=Buffer.byteLength(JSON.stringify(entry.body))+Buffer.byteLength(JSON.stringify(entry.metadata));
      if(group.length&&size+next>200000){flush(domain,group);group=[];size=0;}
      group.push(entry);size+=next;
    }
    flush(domain,group);
  }
  entries.sort((a,b)=>a.id.localeCompare(b.id));
  const index={...payload,tabTemplates:{...payload.tabTemplates,handbook:['Rules','Related','GM Notes']},lazy:true,entries,aliases:{},parts,searchWords:words.join(' ')};
  const text=`/* Generated delivery index from content/. Full pages load on demand. */\n(function(root){\n  const headingName = ${headingName.toString()};\n  const hydrate = ${hydrate.toString()};\n  const data = ${JSON.stringify(index)};\n  for(const entry of data.entries) {\n    for(const key of ${JSON.stringify(commonMetadata)}) if(entry.metadata[key]===undefined && entry[key]!==undefined) entry.metadata[key]=entry[key];\n    entry.name=entry.title;entry.content='';entry.sections={};entry.tabs=data.tabTemplates[entry.domain];entry.description=entry.summary;\n    entry.searchTerms=[entry.title,entry.domain,entry.categoryPath.join(' '),entry.tags.join(' '),entry.summary,JSON.stringify(entry.filters)].join(' ').toLowerCase();\n  }\n  data.hydrate=hydrate;\n  data.baseUrl=new URL('./',document.currentScript.src).href;\n  root.ASTERIA_UNIVERSAL_COMPENDIUM_INDEX=data;\n})(window);\n`;
  files.push([path.join(root,'data/compendium-index.js'),text]);
  return files;
}
function writeDelivery(options,{check=false}={}) {
  const files=deliveryFiles(options);
  for(const [file,content] of files) {
    if(check){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==content)throw new Error(`Compendium delivery is stale: ${path.relative(options.root,file)}`);}
    else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,content);}
  }
  return files;
}
module.exports={deliveryFiles,writeDelivery};
