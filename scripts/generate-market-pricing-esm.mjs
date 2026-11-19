/* Canonical UMD-to-ESM pricing conversion. Deterministic, no global mutation.
 * Source stays js/asteria-market-pricing.js until the Phase 10.5 switch.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sourcePath=resolve(root,'js/asteria-market-pricing.js');
const outputPath=resolve(root,'src/systems/items/marketPricingCore.generated.mjs');
const names=[
  "VERSION",
  "MARKET_VALUE_KEYS",
  "MARKET_PRICE_KEYS",
  "LEGACY_VALUE_KEYS",
  "LEGACY_PRICE_KEYS",
  "MARK_TO_COPPER",
  "parseMarketAmount",
  "normalizeMarketPricing",
  "stripLegacyPricingFields",
  "validateMarketPricing",
  "assertValidMarketPricing",
  "createAsteriaItem",
  "migrateLegacyItem",
  "getMarketValue",
  "getMarketPrice",
  "getInventoryResaleValue",
  "getPlayerPurchasePrice",
  "getPlayerSaleValue",
  "getPlayerPurchasePriceCopper",
  "getPlayerSaleValueCopper",
  "marksToCopper",
  "copperToMarks",
  "marketPricingStatus",
  "formatMarks"
];
export function renderPricingEsm(src){
  const marker="  'use strict';\n";
  if(!src.includes('root.AsteriaMarketPricing = api;')||!src.includes(marker)||
     !src.trimEnd().endsWith('});'))throw Error('Unrecognised canonical pricing wrapper.');
  const start=src.indexOf(marker)+marker.length;
  const end=src.lastIndexOf('\n});');
  if(end<=start)throw Error('Canonical pricing factory was not found.');
  const factory=src.slice(start,end);
  if((factory.match(/\breturn Object\.freeze\(\{/g)||[]).length!==1)
    throw Error('Unexpected number of canonical pricing exports.');
  return '/* Generated from js/asteria-market-pricing.js by scripts/generate-market-pricing-esm.mjs.\n'+
    ' * Single canonical pricing implementation: edit the legacy source, then regenerate.\n'+
    ' * No global side effects, runtime dynamic imports or additional pricing logic.\n'+
    " */\n'use strict';\n"+
    factory.replace('return Object.freeze({','const pricing = Object.freeze({')+
    '\nexport const VERSION = pricing.VERSION;\nexport {\n  '+names.filter(x=>x!=='VERSION').join(',\n  ')+'\n};\nexport default pricing;\n';
}
export function verifyPricingEsm({source=sourcePath,output=outputPath}={}){
  const wanted=renderPricingEsm(readFileSync(source,'utf8'));
  const current=readFileSync(output,'utf8');
  if(current!==wanted)throw Error('Generated pricing ESM is stale. Run node scripts/generate-market-pricing-esm.mjs --write.');
  return {ok:true,source,output};
}
const executed=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(executed){
  const mode=process.argv[2];
  try{
    if(mode==='--write'){
      writeFileSync(outputPath,renderPricingEsm(readFileSync(sourcePath,'utf8')));
      console.log('Generated pure ESM pricing from canonical legacy source.');
    }else if(mode==='--check'){
      verifyPricingEsm();console.log('PASS: generated pricing matches canonical legacy source.');
    }else throw Error('Use --check or --write.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
