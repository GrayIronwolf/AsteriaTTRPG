import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {renderPricingEsm,verifyPricingEsm} from './generate-market-pricing-esm.mjs';
import * as esm from '../src/systems/items/marketPricing.mjs';

const canonical=readFileSync('js/asteria-market-pricing.js','utf8');
const original=runInNewContext(canonical+';globalThis.AsteriaMarketPricing',{});
const canonicalKeys=Object.keys(original).sort();

test('pure pricing export uses exactly the canonical names and changes no browser global',()=>{
  assert.deepEqual(Object.keys(esm).filter(x=>x!=='default').sort(),canonicalKeys);
  assert.equal(globalThis.AsteriaMarketPricing,undefined);
  assert.equal(esm.default.VERSION,original.VERSION);
  assert.deepEqual(esm.default.MARKET_VALUE_KEYS,Array.from(original.MARKET_VALUE_KEYS));
  assert.ok(verifyPricingEsm().ok);
});

test('same market-pricing semantics across legacy and ESM on concrete records',()=>{
  const inputs=[
    {marketValue:20,marketPrice:35},
    {sellingPrice:'40 Marks',purchasePrice:'65 Marks'},
    {market_value:'8 Marks'},
    {value:'300-450 Marks (Restricted Trade)'},
    {marketValue:0,marketPrice:0}
  ];
  for(const item of inputs){
    for(const method of ['normalizeMarketPricing','migrateLegacyItem','marketPricingStatus',
      'getMarketValue','getMarketPrice','getPlayerPurchasePriceCopper','getPlayerSaleValueCopper']){
      assert.equal(JSON.stringify(esm[method](item)),JSON.stringify(original[method](item)),method);
    }
  }
  assert.equal(esm.getPlayerPurchasePriceCopper(inputs[0]),3500);
  assert.equal(esm.getPlayerSaleValueCopper(inputs[0]),2000);
});

test('wrapper drift cannot silently ship stale ESM pricing',()=>{
  assert.match(renderPricingEsm(canonical),/export default pricing/);
  assert.throws(()=>renderPricingEsm('return Object.freeze({});'),/wrapper/);
  const changed=canonical.replace('MARK_TO_COPPER = 100','MARK_TO_COPPER = 101');
  assert.notEqual(renderPricingEsm(changed),readFileSync('src/systems/items/marketPricingCore.generated.mjs','utf8'));
});
