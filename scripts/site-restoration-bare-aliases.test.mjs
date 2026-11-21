import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {parseSiteRoute} from '../frontend/src/router/siteRoutes.mjs';

const route=hash=>parseSiteRoute({hash});
let server,loader;
before(async()=>{
  server=await createServer({configFile:false,
    root:fileURLToPath(new URL('../frontend',import.meta.url)),
    appType:'custom',server:{middlewareMode:true,hmr:false,watch:null}});
  loader=await server.ssrLoadModule('/src/compendium/publicEntryLoader.mjs');
});
after(async()=>{await server?.close();});

test('bare published aliases open the precise definition while preserving tab parameters',async()=>{
  for(const [hash,domain,id] of [
    ['#creature-ash-imp','creature','creature-manifest:creature:ash-imp'],
    ['#wiki-materials-pure-silver-ingot','item','item:content-materials-4-rare-metals-pure-silver-ingot-index'],
    ['#1.0%20Rule%20of%20cool','handbook','handbook:hoZRdlTZX7EAAAAAAAAkhw'],
    ['#content/PHASE-4-ADVANCED-WORLD-SYSTEMS.md','location','location:content-phase-4-advanced-world-systems'],
    ['#/content/PHASE-4-ADVANCED-WORLD-SYSTEMS.md','location','location:content-phase-4-advanced-world-systems']
  ]){
    const incoming=route(hash+'?tab=Overview');
    const resolved=await loader.resolveCompendiumBookmark?.(incoming);
    assert.equal(resolved?.id,'compendium-entry',hash);
    assert.equal(resolved.hash,incoming.hash);
    assert.equal(resolved.query.get('tab'),'Overview');
    assert.equal(resolved.params.domain,domain);
    assert.equal((await loader.loadPublicEntry(domain,resolved.params.slug)).entry?.id,id,hash);
  }
});

test('the class directory does not mask a published nested Talent source path',async()=>{
  const incoming=route('#content/classes/cleric/talents/tier-1/channel-divinity/index.md?tab=Rank+1');
  const resolved=await loader.resolveCompendiumBookmark(incoming);
  assert.equal(resolved?.params.domain,'talent');
  assert.equal(resolved.query.get('tab'),'Rank 1');
  const result=await loader.loadPublicEntry(resolved.params.domain,resolved.params.slug);
  assert.equal(result.entry?.id,'talent:content-classes-cleric-talents-tier-1-channel-divinity-index');
});

test('ambiguous bare titles show choices and unknown or protected routes keep their disposition',async()=>{
  const incoming=route('#Mana%20Well?tab=Ranks');
  const resolved=await loader.resolveCompendiumBookmark?.(incoming);
  assert.equal(resolved?.id,'compendium-entry');
  assert.deepEqual(resolved.params.choices.map(item=>item.slug).sort(),['cleric-mana-well','spellblade-mana-well'].sort());
  for(const hash of ['#home','#/account/settings','#/react/gm/campaign',
    '#/join/000012345678','#/react/character/incomplete','#/no-such-route',
    '#fake-alias-unknown','#account/private/index.md','#https://example.test/path.md']){
    assert.equal(await loader.resolveCompendiumBookmark?.(route(hash)),null,hash);
  }
});
