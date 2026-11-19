import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
test('the compiled cutover frontend must not include the UMD global pricing wrapper',()=>{
 const dir=resolve('frontend-dist/assets');
 const files=readdirSync(dir).filter(p=>p.endsWith('.js'));
 assert.ok(files.length>3,'Expected compiled frontend chunks');
 for(const file of files){
  const source=readFileSync(join(dir,file),'utf8');
  assert.doesNotMatch(source,/AsteriaMarketPricing|root\.AsteriaMarketPricing\s*=/,
    'Modern bundle contains legacy global pricing wrapper: '+file);
 }
 const legacy=readFileSync('src/systems/items/marketPricing.mjs','utf8');
 assert.match(legacy,/import '\.\.\/\.\.\/\.\.\/js\/asteria-market-pricing\.js'/);
 const newConfig=readFileSync('vite.site.config.mjs','utf8');
 assert.match(newConfig,/marketPricing\\?\.mjs|marketPricing\\\.mjs|marketPricing\.mjs/);
});
