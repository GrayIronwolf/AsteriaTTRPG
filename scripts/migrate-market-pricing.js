const fs = require('fs');
const path = require('path');
const pricing = require('../js/asteria-market-pricing.js');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'data', 'compendium-index-clean.json');
const reportPath = path.join(root, 'data', 'market-pricing-migration-report.json');
const dryRun = process.argv.includes('--dry-run');

function key(line){
  return String(line || '').match(/^([A-Za-z0-9_ -]+):/)?.[1]?.trim().toLowerCase().replace(/[ _-]+/g,'') || '';
}

function scalar(line){
  return String(line || '').replace(/^[^:]+:\s*/, '').trim().replace(/^['"]|['"]$/g,'');
}

function yaml(value){
  if(value === null) return 'null';
  if(typeof value === 'number') return String(value);
  return JSON.stringify(String(value));
}

function migrateFile(filePath){
  const markdown = fs.readFileSync(filePath, 'utf8');
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if(!match) return { status:'skipped', reason:'missing-frontmatter' };
  const lines = match[1].split(/\r?\n/);
  const known = {};
  lines.forEach(line => {
    const normalized = key(line);
    if(normalized) known[normalized] = scalar(line);
  });
  const source = {
    marketValue:known.marketvalue === 'null' ? null : known.marketvalue,
    marketPrice:known.marketprice === 'null' ? null : known.marketprice,
    sellingPrice:known.sellingprice === 'null' ? null : known.sellingprice,
    purchasePrice:known.purchaseprice === 'null' ? null : known.purchaseprice
  };
  const migrated = pricing.migrateLegacyItem(source);
  if(known.marketvaluesourcetext && known.marketvaluesourcetext !== 'null') migrated.marketValueSourceText = known.marketvaluesourcetext;
  if(known.marketpricesourcetext && known.marketpricesourcetext !== 'null') migrated.marketPriceSourceText = known.marketpricesourcetext;
  if(known.pricingstatus === 'needs-completion' || migrated.marketPrice === null) migrated.pricingNeedsCompletion = true;
  const validation = pricing.validateMarketPricing(migrated, { allowLegacyMissingPrice:true });
  const removeKeys = new Set(['marketvalue','marketprice','sellingprice','purchaseprice','marketvaluesourcetext','marketpricesourcetext','pricingneedscompletion','pricingstatus']);
  const remaining = lines.filter(line => !removeKeys.has(key(line)));
  const insertAt = Math.max(0, remaining.findIndex(line => ['tags','visibility'].includes(key(line))));
  const pricingLines = [
    `market_value: ${yaml(migrated.marketValue)}`,
    `market_price: ${yaml(migrated.marketPrice)}`
  ];
  if(migrated.marketValueSourceText) pricingLines.push(`market_value_source_text: ${yaml(migrated.marketValueSourceText)}`);
  if(migrated.marketPriceSourceText) pricingLines.push(`market_price_source_text: ${yaml(migrated.marketPriceSourceText)}`);
  if(migrated.pricingNeedsCompletion) pricingLines.push('pricing_status: needs-completion');
  remaining.splice(insertAt < 0 ? remaining.length : insertAt, 0, ...pricingLines);
  const newline = markdown.includes('\r\n') ? '\r\n' : '\n';
  const frontmatter = `---${newline}${remaining.join(newline)}${newline}---${newline}`;
  const updated = frontmatter + markdown.slice(match[0].length);
  if(!dryRun) fs.writeFileSync(filePath, updated, 'utf8');
  return {
    status:'migrated',
    marketValue:migrated.marketValue,
    marketPrice:migrated.marketPrice,
    needsCompletion:migrated.pricingNeedsCompletion,
    sourceText:migrated.marketValueSourceText || migrated.marketPriceSourceText || '',
    valid:validation.valid,
    errors:validation.errors
  };
}

if(!fs.existsSync(indexPath)) throw new Error('Generate data/compendium-index-clean.json before migrating market pricing.');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const items = (index.entries || []).filter(entry => entry.section === 'Items' && entry.sourcePath);
const records = items.map(entry => {
  const filePath = path.join(root, ...String(entry.sourcePath).split('/'));
  const result = fs.existsSync(filePath) ? migrateFile(filePath) : { status:'skipped', reason:'missing-file' };
  return { title:entry.title, sourcePath:entry.sourcePath, ...result };
});
const report = {
  version:'asteria-market-pricing-v1',
  generatedAt:new Date().toISOString(),
  dryRun,
  total:records.length,
  migrated:records.filter(record => record.status === 'migrated').length,
  needsCompletion:records.filter(record => record.needsCompletion).length,
  invalid:records.filter(record => record.valid === false).length,
  records
};
if(!dryRun) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(`Market pricing migration ${dryRun ? 'previewed' : 'completed'}: ${report.migrated}/${report.total} item files, ${report.needsCompletion} need Market Price completion.`);
