const fs=require('fs');
const path=require('path');
const {generate,folders}=require('./generate-compendium');
const root=path.resolve(__dirname,'..');

function validate(index,{report=false}={}) {
  const errors=[], warnings=[], ids=new Set(), routes=new Set(), definitions=new Set();
  const paths=new Set(index.entries.map(entry=>entry.sourcePath));
  function exactFile(file) {
    let directory=root;
    for(const segment of file.split('/')) {
      if(!fs.existsSync(directory)||!fs.readdirSync(directory).includes(segment))return false;
      directory=path.join(directory,segment);
    }
    return fs.statSync(directory).isFile();
  }
  for(const entry of index.entries) {
    const identity=[entry.domain,entry.domain==='talent'?entry.metadata.className:'',entry.slug].join(':');
    if(ids.has(entry.id)||routes.has(entry.route)||definitions.has(identity))errors.push({entry:entry.id,problem:'Duplicate identity or route'});
    ids.add(entry.id);routes.add(entry.route);definitions.add(identity);
    if(!/^content\/[a-z-]+\/[a-z0-9-]+\/index\.md$/.test(entry.sourcePath)||!exactFile(entry.sourcePath))errors.push({entry:entry.id,problem:'Invalid canonical source path'});
    if(folders[entry.sourcePath.split('/')[1]]!==entry.domain||!entry.title||!Array.isArray(entry.categoryPath)||entry.categoryPath.some(value=>typeof value!=='string'))errors.push({entry:entry.id,problem:'Invalid schema'});
    for(const [key,value] of Object.entries({...entry.metadata.images,image:entry.metadata.image,symbol:entry.metadata.symbol}))if(typeof value==='string'&&/\.(png|jpe?g|webp|gif|svg)$/i.test(value)&&!entry.images[key])errors.push({entry:entry.id,problem:'Unresolved metadata artwork',reference:value});
    for(const file of Object.values(entry.images||{}).filter(Boolean))if(!/^https?:\/\//.test(file)&&!exactFile(file))errors.push({entry:entry.id,problem:'Missing artwork',file});
    if(entry.domain==='item')for(const field of ['marketValue','marketPrice'])if(entry[field]!==null&&(!Number.isFinite(entry[field])||entry[field]<0))errors.push({entry:entry.id,problem:'Invalid price',field});
    // Source notes may reference attachments that were never uploaded. They render
    // a missing-artwork label, and are reported instead of issuing broken requests.
    for(const match of entry.body.matchAll(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
      const file=match[1];
      if(!fs.existsSync(path.join(root,file))&&!fs.existsSync(path.join(root,entry.sourceFolder,file)))warnings.push({source:entry.sourcePath,problem:'Unresolved source attachment',reference:file});
    }
    if(entry.domain==='item'&&(entry.marketValue===null||entry.marketPrice===null))warnings.push({source:entry.sourcePath,problem:'Authored pricing incomplete'});
  }
  function walk(dir) {for(const item of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,item.name);if(item.isDirectory())walk(full);else if(item.name.endsWith('.md')&&item.name!=='README.md'){const relative=path.relative(root,full).split(path.sep).join('/');if(!paths.has(relative))errors.push({source:relative,problem:'Content page omitted from registry'});}}}
  walk(path.join(root,'content'));
  const result={entries:index.entries.length,errors,warnings,ambiguousLegacyAliases:Object.entries(index.aliases).filter(([,targets])=>Array.isArray(targets)).map(([alias,targets])=>({alias,targets}))};
  if(report)fs.writeFileSync(path.join(root,'docs/compendium-validation.json'),JSON.stringify(result,null,2)+'\n');
  return result;
}
if(require.main===module){
  const result=validate(generate({check:true}),{report:process.argv.includes('--report')});
  console.log(`Compendium validation: ${result.entries} entries, ${result.errors.length} errors, ${result.warnings.length} existing content gaps.`);
  if(result.errors.length){console.error(JSON.stringify(result.errors,null,2));process.exitCode=1;}
}
module.exports={validate};
