/* Phase 4.5 original screenshot reference audit.
 * A new React capture never qualifies as an original screenshot.
 * This audit can report READY FOR COMPARISON, but never VISUALLY APPROVED.
 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const REQUIRED_PAIRS=Object.freeze([
  'player:mobile','player:desktop','gm:mobile','gm:desktop',
  'readonly:mobile','readonly:desktop'
]);
const PNG_MAGIC=Buffer.from([137,80,78,71,13,10,26,10]);

function auditReferences(manifestPath=null){
  const blockers=[],seen=new Set();
  let verifiedReferences=0;
  const report=()=>({
    status:blockers.length?'blocked':'ready-for-browser-comparison',
    requiredPairs:[...REQUIRED_PAIRS],presentPairs:[...seen].sort(),
    verifiedReferences,blockers
  });
  if(!manifestPath){
    blockers.push('ASTERIA_PARITY_CASES is not set: genuine pre-migration references are missing.');
    for(const pair of REQUIRED_PAIRS)blockers.push('Missing authenticated original: '+pair);
    return report();
  }
  const file=path.resolve(manifestPath);
  if(!fs.existsSync(file)){
    blockers.push('Original reference manifest missing: '+path.basename(file));
    for(const pair of REQUIRED_PAIRS)blockers.push('Missing authenticated original: '+pair);
    return report();
  }
  let manifest;
  try{manifest=JSON.parse(fs.readFileSync(file,'utf8'));}
  catch(error){blockers.push('Cannot read reference manifest: '+error.message);return report();}
  if(!manifest||!Array.isArray(manifest.cases)){
    blockers.push('Approved reference manifest must contain a cases array.');
    return report();
  }
  const dir=path.dirname(file),names=new Set();
  for(const [i,item] of manifest.cases.entries()){
    if(!item||typeof item!=='object'){blockers.push('Invalid case '+(i+1));continue;}
    const category=Number.isInteger(item.width)&&item.width>=320&&item.width<=480?'mobile':
      Number.isInteger(item.width)&&item.width>=1024?'desktop':null;
    const pair=item.role+':'+category;
    if(!REQUIRED_PAIRS.includes(pair)){
      blockers.push('Only authenticated Player, GM and read-only mobile/desktop cases are allowed.');
      continue;
    }
    if(seen.has(pair))blockers.push('Duplicate authenticated original: '+pair);
    seen.add(pair);
    if(!Number.isInteger(item.height)||item.height<600)blockers.push(pair+': invalid viewport height.');
    if(item.fixedTime!==undefined&&(!Number.isSafeInteger(item.fixedTime)||!Number.isFinite(new Date(item.fixedTime).getTime())))
      blockers.push(pair+': fixed browser time must be a valid millisecond timestamp.');
    if(!/^[a-z0-9_-]+$/i.test(item.name||''))blockers.push(pair+': safe case name required.');
    if(names.has(item.name))blockers.push(pair+': duplicate case name.');
    names.add(item.name);
    const selector=item.role==='gm'?'[data-testid="site-gm-dashboard"]':
      '[data-testid="site-player-dashboard"]';
    if(item.selector!==selector)blockers.push(pair+': full authenticated dashboard selector is required.');
    if(typeof item.url!=='string'||!/^https?:\/\/127\.0\.0\.1:\d+\//.test(item.url))
      blockers.push(pair+': React test URL must point to local 127.0.0.1.');
    if(typeof item.approvedBy!=='string'||!item.approvedBy.trim())
      blockers.push(pair+': legacy screenshot approver must be identified.');
    if(typeof item.legacyRevision!=='string'||!/^[a-f0-9]{40}$/i.test(item.legacyRevision))
      blockers.push(pair+': actual pre-migration commit SHA required.');
    if(typeof item.referenceSha256!=='string'||!/^[a-f0-9]{64}$/i.test(item.referenceSha256))
      blockers.push(pair+': original PNG SHA-256 required.');
    if(item.maxDifference!==undefined&&
      (typeof item.maxDifference!=='number'||item.maxDifference<0||item.maxDifference>0.1))
      blockers.push(pair+': pixel threshold must be 0 to 10%.');
    if(typeof item.reference!=='string'||!item.reference.toLowerCase().endsWith('.png')||
      path.isAbsolute(item.reference)){
      blockers.push(pair+': original PNG must be a relative path below the manifest directory.');
      continue;
    }
    const reference=path.resolve(dir,item.reference);
    if(!reference.startsWith(dir+path.sep)){
      blockers.push(pair+': original PNG path must not escape the manifest directory.');
      continue;
    }
    if(!fs.existsSync(reference)){
      blockers.push(pair+': approved original PNG missing.');
      continue;
    }
    const png=fs.readFileSync(reference);
    if(png.length<24||!png.subarray(0,8).equals(PNG_MAGIC)||
      png.toString('ascii',12,16)!=='IHDR'){
      blockers.push(pair+': approved image is not a PNG.');
      continue;
    }
    const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
    if(width!==item.width||height<item.height)
      blockers.push(pair+': full-page PNG must match CSS width (DPR 1) and cover viewport height.');
    const hash=createHash('sha256').update(png).digest('hex');
    if(hash!==String(item.referenceSha256||'').toLowerCase())
      blockers.push(pair+': original PNG SHA-256 mismatch.');
    else if(width===item.width&&height>=item.height)verifiedReferences++;
  }
  for(const pair of REQUIRED_PAIRS)if(!seen.has(pair))
    blockers.push('Missing authenticated original: '+pair);
  return report();
}

if(require.main===module){
  const outputIndex=process.argv.indexOf('--output');
  const output=outputIndex>=0?process.argv[outputIndex+1]:null;
  if(outputIndex>=0&&!output)throw Error('--output requires a file path');
  const result=auditReferences(process.env.ASTERIA_PARITY_CASES||null);
  const json=JSON.stringify(result,null,2)+'\n';
  if(output){
    const target=path.resolve(output);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,json);
  }
  process.stdout.write(json);
  if(process.argv.includes('--require-ready')&&result.status!=='ready-for-browser-comparison')
    process.exitCode=2;
}
module.exports={auditReferences,REQUIRED_PAIRS};
