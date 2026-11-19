import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const getCssLinks=html=>[...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/gi)]
  .map(match=>match[1].split(/[?#]/)[0]);
function traverse(path){
  return readdirSync(resolve(root,path),{withFileTypes:true}).flatMap(node=>
    node.isDirectory()?traverse(join(path,node.name)):[join(path,node.name)]);
}
test('retired universal page-template stylesheet is absent and is never loaded',()=>{
  assert.equal(existsSync(resolve(root,'css/asteria-page-template.css')),false);
  const legacy=read('index.html');
  assert.doesNotMatch(legacy,/href="css\/asteria-page-template\.css/);
  assert.doesNotMatch(legacy,/src="js\/asteria-page-template\.js/);
  const ledger=JSON.parse(read('docs/frontend-overhaul/PHASE-2.5-RETIREMENT-LEDGER.json'));
  const entry=ledger.groups.find(x=>x.id==='disabled-universal-page-template');
  assert.ok(entry.removedFiles.includes('css/asteria-page-template.css'));
  assert.equal(entry.removedInPhase,'9.1');
  assert.equal(entry.expectLoadedInLegacy,false);
});
test('live stylesheet URLs remain resolvable and unique during pre-cutover',()=>{
  const legacy=read('index.html');
  const links=getCssLinks(legacy);
  assert.ok(links.length>=30,'existing website has substantial active legacy CSS dependencies');
  assert.equal(new Set(links).size,links.length,'duplicate CSS includes reintroduce cascade conflicts');
  for(const link of links){
    assert.match(link,/^css\/[a-z0-9-]+\.css$/i);
    assert.ok(existsSync(resolve(root,link)), 'Missing live stylesheet: '+link);
  }
  assert.ok(links.includes('css/styles.css'));
  assert.ok(links.includes('css/asteria-solid-navy-surfaces.css'));
  assert.equal(links.at(-1),'css/asteria-solid-navy-surfaces.css',
    'The approved final live navy palette must remain the last CSS load');
});
test('old header tint override is retired without changing approved final header owner',()=>{
  const wordmark=read('css/asteria-header-wordmark.css');
  const approved=read('css/asteria-aaa-upgrade.css');
  assert.doesNotMatch(wordmark, /background:\s*#192838\s*!important/);
  assert.match(approved,/body \.topbar\.asteria-header\{\s*background:#1E2838!important/);
  assert.match(approved, /@media\(min-width:1680px\)/);
  assert.match(read('css/asteria-solid-navy-surfaces.css'),
    /--asteria-menu-panel-surface:\s*#060D15/);
});
test('new React architecture never imports a legacy CSS layer',()=>{
  const main=read('frontend/src/main.jsx');
  const preview=read('frontend/index.html');
  assert.equal(getCssLinks(preview).length,0);
  const globals=['tokens.css','reset.css','typography.css'];
  for(const name of globals)assert.ok(main.includes("import './styles/"+name+"'"));
  const styles=traverse('frontend/src').filter(p=>p.endsWith('.css'));
  const cssGlobal=styles.filter(p=>!p.endsWith('.module.css'));
  assert.deepEqual(cssGlobal.map(p=>p.replaceAll('\\','/')).sort(),
    globals.map(p=>'frontend/src/styles/'+p).sort());
  for(const path of styles){
    const value=read(path);
    assert.doesNotMatch(value,/!important\b|@import\b/,path);
    if(path.endsWith('.module.css'))assert.doesNotMatch(value,/:global\(/,path);
  }
  assert.doesNotMatch(main+preview,/css\/styles\.css|css\/asteria-|react-dist/);
});
test('legacy styles are protected until final Phase 10 cutover',()=>{
  const legacy=read('index.html');
  assert.match(legacy,/src="js\/app\.js\?/);
  assert.match(legacy,/src="src\/dev-entry\.js\?/);
  assert.doesNotMatch(legacy,/frontend\/src\/main\.jsx/);
  const replacement=read('frontend/src/components/ui/PageLayout.jsx');
  assert.match(replacement,/from '\.\/PageLayout\.module\.css'/);
  const ledger=JSON.parse(read('docs/frontend-overhaul/PHASE-2.5-RETIREMENT-LEDGER.json'));
  assert.equal(ledger.removalPolicy,'none_before_parity_and_approved_production_cutover');
  for(const group of ledger.groups){
    for(const file of group.legacyFiles){
      if(group.removedFiles?.includes(file))continue;
      assert.ok(existsSync(resolve(root,file)),'Live/deferred removal must remain tracked: '+file);
    }
  }
});
