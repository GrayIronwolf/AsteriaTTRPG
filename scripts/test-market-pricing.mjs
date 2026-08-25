import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createAsteriaItem,
  getInventoryResaleValue,
  getMarketPrice,
  getMarketValue,
  getPlayerPurchasePrice,
  getPlayerPurchasePriceCopper,
  getPlayerSaleValue,
  getPlayerSaleValueCopper,
  marketPricingStatus,
  migrateLegacyItem,
  normalizeMarketPricing,
  validateMarketPricing
} from '../src/systems/items/marketPricing.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const tests = [];
const test = (name, run) => tests.push({ name, run });

test('new base items always receive both core fields', () => {
  const item = createAsteriaItem({ name:'Quest Token' });
  assert.equal(item.marketValue, 0);
  assert.equal(item.marketPrice, 0);
  assert.equal(marketPricingStatus(item).id, 'not-tradeable');
});

test('market value is selling baseline and market price is purchase baseline', () => {
  const item = createAsteriaItem({ marketValue:50, marketPrice:75 });
  assert.equal(getMarketValue(item), 50);
  assert.equal(getMarketPrice(item), 75);
  assert.equal(getPlayerSaleValue(item), 50);
  assert.equal(getPlayerPurchasePrice(item), 75);
  assert.equal(getPlayerSaleValueCopper(item), 5000);
  assert.equal(getPlayerPurchasePriceCopper(item), 7500);
});

test('inventory resale uses quantity times market value', () => {
  assert.equal(getInventoryResaleValue({ marketValue:12, marketPrice:20 }, 4), 48);
});

test('positive market value must remain below market price', () => {
  assert.equal(validateMarketPricing({ marketValue:75, marketPrice:50 }).valid, false);
  assert.equal(validateMarketPricing({ marketValue:50, marketPrice:50 }).valid, false);
  assert.throws(() => createAsteriaItem({ marketValue:100, marketPrice:80 }), /Market Value must be lower/);
});

test('negative prices are rejected by business logic', () => {
  assert.equal(validateMarketPricing({ marketValue:-1, marketPrice:5 }).valid, false);
  assert.equal(validateMarketPricing({ marketValue:1, marketPrice:-5 }).valid, false);
});

test('zero-zero is valid and means not normally tradeable', () => {
  const validation = validateMarketPricing({ marketValue:0, marketPrice:0 });
  assert.equal(validation.valid, true);
  assert.equal(marketPricingStatus(validation.item).label, 'Not Normally Tradeable');
});

test('legacy market value is preserved and missing market price remains null', () => {
  const item = migrateLegacyItem({ name:'Iron Ore', market_value:'8 Marks' });
  assert.equal(item.marketValue, 8);
  assert.equal(item.marketPrice, null);
  assert.equal(item.pricingNeedsCompletion, true);
  assert.equal(item.market_value, undefined);
});

test('legacy purchase and selling prices migrate without duplicates', () => {
  const item = migrateLegacyItem({ sellingPrice:'40 Marks', purchasePrice:'65 Marks' });
  assert.equal(item.marketValue, 40);
  assert.equal(item.marketPrice, 65);
  assert.equal(item.sellingPrice, undefined);
  assert.equal(item.purchasePrice, undefined);
});

test('legacy generic runtime value migrates only to market value', () => {
  const item = normalizeMarketPricing({ value:9 }, { legacy:true });
  assert.equal(item.marketValue, 9);
  assert.equal(item.marketPrice, null);
  assert.equal(item.value, undefined);
});

test('ambiguous legacy range is audited and never invents a purchase price', () => {
  const item = migrateLegacyItem({ marketValue:'300-450 Marks (Restricted Trade)' });
  assert.equal(item.marketValue, 300);
  assert.equal(item.marketPrice, null);
  assert.equal(item.marketValueSourceText, '300-450 Marks (Restricted Trade)');
  assert.equal(marketPricingStatus(item).id, 'needs-completion');
});

test('crafted, loot, shop, imported, and future categories share the base creator', () => {
  ['Crafted Armour','Creature Loot','Shop Item','Imported Herb','Mount Equipment'].forEach(type => {
    const item = createAsteriaItem({ name:type, type, marketValue:2, marketPrice:3 });
    assert.deepEqual([item.marketValue,item.marketPrice],[2,3]);
  });
});

test('all generated compendium item records expose both pricing properties', () => {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'data', 'compendium-index-clean.json'), 'utf8'));
  const items = index.entries.filter(entry => entry.section === 'Items');
  assert.ok(items.length > 0);
  items.forEach(item => {
    assert.equal(Object.hasOwn(item, 'marketValue'), true, `${item.title} is missing marketValue`);
    assert.equal(Object.hasOwn(item, 'marketPrice'), true, `${item.title} is missing marketPrice`);
    assert.equal(typeof item.marketValue, 'number', `${item.title} marketValue is not numeric`);
    assert.ok(item.marketPrice === null || typeof item.marketPrice === 'number', `${item.title} marketPrice is neither numeric nor legacy null`);
  });
});

test('migrated item frontmatter contains canonical fields and no legacy duplicates', () => {
  const index = JSON.parse(fs.readFileSync(path.join(root, 'data', 'compendium-index-clean.json'), 'utf8'));
  index.entries.filter(entry => entry.section === 'Items' && entry.sourcePath).forEach(entry => {
    const markdown = fs.readFileSync(path.join(root, ...entry.sourcePath.split('/')), 'utf8');
    const frontmatter = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '';
    assert.match(frontmatter, /^market_value:\s*(?:\d+(?:\.\d+)?|null)\s*$/m, `${entry.title} is missing canonical market_value`);
    assert.match(frontmatter, /^market_price:\s*(?:\d+(?:\.\d+)?|null)\s*$/m, `${entry.title} is missing canonical market_price`);
    assert.doesNotMatch(frontmatter, /^(?:selling[ _]price|purchase[ _]price):/im, `${entry.title} still has duplicate legacy pricing`);
  });
});

test('database and transaction boundaries enforce shared market pricing', () => {
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  const firebase = fs.readFileSync(path.join(root, 'js', 'firebase-auth.js'), 'utf8');
  const crafting = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  assert.match(rules, /function hasValidMarketPricing/);
  assert.match(rules, /hasValidMarketPricing\(request\.resource\.data\)/);
  assert.match(firebase, /createAsteriaItem/);
  assert.match(firebase, /getPlayerPurchasePriceCopper/);
  assert.match(firebase, /getPlayerSaleValueCopper/);
  assert.match(crafting, /marketValue:Number\(p\.marketValue/);
  assert.match(crafting, /marketPrice:Number\(p\.marketPrice/);
  assert.doesNotMatch(crafting.slice(crafting.indexOf('function finalItemSnapshot'), crafting.indexOf('function serializeProjectForm')), /craftedValue|craftedPrice|sellingPrice|purchasePrice/);
});

let passed = 0;
for(const entry of tests) {
  await entry.run();
  passed += 1;
  console.log(`PASS ${entry.name}`);
}
console.log(`Market pricing tests passed: ${passed}`);
