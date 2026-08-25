const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const raceRoot = path.join(root, 'content', 'races');

function markdownFiles(directory, output=[]){
  if(!fs.existsSync(directory)) return output;
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const target=path.join(directory,entry.name);
    if(entry.isDirectory())markdownFiles(target,output);
    else if(entry.isFile()&&entry.name.toLowerCase()==='index.md')output.push(target);
  }
  return output;
}

function frontmatter(source){
  const block=String(source||'').match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if(!block)return {};
  const output={};
  block[1].split(/\r?\n/).forEach(line=>{
    if(/^\s/.test(line))return;
    const match=line.match(/^([^:#][^:]*):\s*(.*)$/);
    if(!match)return;
    const key=match[1].trim();
    let value=match[2].trim().replace(/^['"]|['"]$/g,'');
    if(/^-?\d+(?:\.\d+)?$/.test(value))value=Number(value);
    else if(/^(true|false)$/i.test(value))value=value.toLowerCase()==='true';
    output[key]=value;
  });
  return output;
}

let racesUpdated = 0;
for(const entry of fs.readdirSync(raceRoot, { withFileTypes:true })) {
  if(!entry.isDirectory()) continue;
  const file = path.join(raceRoot, entry.name, 'index.md');
  if(!fs.existsSync(file)) continue;
  const source = fs.readFileSync(file,'utf8');
  if(/^naturalAC\s*:/mi.test(source)) continue;
  const next = source.replace(/^(playable\s*:\s*.*)$/mi, '$1\nnaturalAC: 1');
  if(next !== source) { fs.writeFileSync(file,next,'utf8'); racesUpdated += 1; }
}

const highSteel = path.join(root,'content','materials','3-unusual','metals','high-steel-ingot','index.md');
let highSteelUpdated = false;
if(fs.existsSync(highSteel)) {
  const source = fs.readFileSync(highSteel,'utf8');
  if(!/^materialBaseAC\s*:/mi.test(source)) {
    const next = source.replace(/^(armor_modifier\s*:\s*.*)$/mi,'$1\nmaterialBaseAC: 3');
    fs.writeFileSync(highSteel,next,'utf8');
    highSteelUpdated = true;
  }
}

async function writeReport(){
  const {migrateLegacyArmourItem,resolveMaterialBaseAC}=await import('../src/systems/armour/armourSystem.mjs');
  const files=markdownFiles(path.join(root,'content'));
  const records=files.map(file=>({file,metadata:frontmatter(fs.readFileSync(file,'utf8'))}));
  const materials=records.map(record=>record.metadata).filter(metadata=>{
    const keys=Object.keys(metadata).map(key=>key.toLowerCase().replace(/[^a-z0-9]/g,''));
    return keys.includes('materialbaseac')||keys.includes('armormodifier')||keys.includes('armourmodifier');
  });
  const armourCandidates=records.filter(({metadata})=>String(metadata.type||'').toLowerCase()==='item'&&/armou?r|shield|helm|mail|cuirass|plate|greave|boot|gauntlet|bracer|coif/i.test(`${metadata.title||''} ${metadata.category||''} ${metadata.subcategory||''}`));
  const itemReports=armourCandidates.map(({file,metadata})=>{
    const migrated=migrateLegacyArmourItem(metadata,{materials});
    return {
      sourcePath:path.relative(root,file).replace(/\\/g,'/'),
      title:metadata.title||path.basename(path.dirname(file)),
      mapped:migrated.mapped,
      inferred:{armourPieceType:migrated.item.armourPieceType||'',material:migrated.item.material||'',materialBaseAC:migrated.item.materialBaseAC??null,quality:migrated.item.quality||'',allowedSlots:migrated.item.allowedSlots||[]},
      warnings:migrated.warnings
    };
  });
  const raceReports=fs.readdirSync(raceRoot,{withFileTypes:true}).filter(entry=>entry.isDirectory()).map(entry=>{
    const file=path.join(raceRoot,entry.name,'index.md');
    const metadata=fs.existsSync(file)?frontmatter(fs.readFileSync(file,'utf8')):{};
    const value=Number(metadata.naturalAC??metadata.natural_ac);
    return {slug:entry.name,naturalAC:Number.isFinite(value)?value:null,valid:Number.isFinite(value)&&value>=1&&value<=12};
  });
  const report={
    version:'asteria-armour-class-migration-v1',
    generatedAt:new Date().toISOString(),
    summary:{raceFiles:raceReports.length,validRaceNaturalAC:raceReports.filter(record=>record.valid).length,materialDefinitions:materials.length,armourCandidates:itemReports.length,safelyMappedArmour:itemReports.filter(record=>record.mapped).length,flaggedArmour:itemReports.filter(record=>!record.mapped).length},
    rules:{preserveUnmappedItems:true,storedFinalAC:false,materialLookup:'Compendium metadata first; flagged fallback when unavailable'},
    invalidRaces:raceReports.filter(record=>!record.valid),
    armourItems:itemReports,
    materialSources:materials.map(metadata=>({title:metadata.title||'',materialBaseAC:resolveMaterialBaseAC({material:metadata.title||metadata.material_family},{materials}).value}))
  };
  const target=path.join(root,'data','armour-migration-report.json');
  fs.writeFileSync(target,`${JSON.stringify(report,null,2)}\n`,'utf8');
  return report;
}

writeReport().then(report=>{
  console.log(`Armour metadata migration: ${racesUpdated} race files updated; High Steel ${highSteelUpdated ? 'updated' : 'already current'}; ${report.summary.flaggedArmour} legacy armour entries flagged in data/armour-migration-report.json.`);
}).catch(error=>{
  console.error(error.stack||error.message||error);
  process.exitCode=1;
});
