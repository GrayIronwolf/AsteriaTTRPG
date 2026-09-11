import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {readNaturalAC} from '../src/systems/armour/naturalAC.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'js/race-info-data.js'),'utf8'),context);
const imported=context.window.ASTERIA_RACE_INFO_DATA;
const supplemental=JSON.parse(fs.readFileSync(path.join(root,'data/racial-natural-ac-sources.json'),'utf8'));
const recovered=[];const missing=[];
for(const entry of fs.readdirSync(path.join(root,'content/races'),{withFileTypes:true})) {
 if(!entry.isDirectory())continue;
 const file=path.join(root,'content/races',entry.name,'index.md');if(!fs.existsSync(file))continue;
 let text=fs.readFileSync(file,'utf8');
 const title=text.match(/^title:\s*"?([^"\n]+)"?$/m)?.[1];
 const extra=supplemental.verified.find(row=>row.race===title);
 const recorded=readNaturalAC(imported[title]) ?? (extra ? readNaturalAC({naturalAC:extra.raw}) : null);
 const current=Number(text.match(/^naturalAC:\s*(\d+)/m)?.[1]);
 // The old migration inserted unmarked 1s. Never overwrite authored values >1.
 const authored=current>1 || /^naturalACSource:\s*(race-notes|authored)/m.test(text);
 const value=authored?current:recorded;
 const source=value===null?'fallback':authored && !recorded?'authored':'race-notes';
 text=text.replace(/^naturalAC:.*\r?\n/m,'').replace(/^naturalACSource:.*\r?\n/m,'');
 text=text.replace(/^(playable:.*)$/m,`$1\nnaturalAC: ${value??1}\nnaturalACSource: ${source}`);
 fs.writeFileSync(file,text);
 if(value===null)missing.push({race:title,slug:entry.name});else recovered.push({race:title,naturalAC:value,original:imported[title]?.stats?.['Neutral AC']??extra?.raw??current});
}
const report={recovered,missing,conflicts:supplemental.conflicts,note:'Missing values are explicit fallback 1, not authored race statistics. Original +0 is clamped to the existing minimum 1. No Firestore documents are modified.'};
fs.writeFileSync(path.join(root,'data/racial-natural-ac-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({recovered,missingCount:missing.length}));
