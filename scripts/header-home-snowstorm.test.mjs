import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('homepage replaces old Welcome and World Map cards with one hero',()=>{
  const html=read('index.html');
  const home=html.slice(html.indexOf('<section id="home"'),html.indexOf('<section id="workspace"'));
  assert.match(home,/asteria-home-cinematic/);
  const slides=['spider','logo','dragon','varkhyn'];
  for(const slide of slides) assert.match(home,new RegExp('assets/home/asteria-home-'+slide+'\\\\.webp'));
  assert.equal((home.match(/class=\"asteria-home-cinematic-art aaa-home-slide/g)||[]).length,4);
  assert.match(home,/id=\"aaaCarouselNext\"/);
  assert.match(home,/id=\"aaaCarouselPrevious\"/);
  assert.doesNotMatch(home,/src=\"assets\\/home\\/varkhyn-snowstorm\\.avif/);
  assert.doesNotMatch(home,/public-home-grid|world-map-preview|home-hero card|map-placeholder/);
  assert.match(home,/data-workspace-section="Asteria Handbook"/);
});
test('Home carousel uses the four approved optimized images and retains edge fades',()=>{
  for(const name of ['spider','logo','dragon','varkhyn']){
    const file=new URL('../assets/home/asteria-home-'+name+'.webp',import.meta.url);
    const stat=statSync(file);
    assert.ok(stat.size>1000&&stat.size<500000,name);
  }
  const css=read('css/asteria-aaa-upgrade.css');
  assert.match(css,/\\.aaa-home-slide/);
  assert.match(css,/mask-image/);
  const oldCss=read('css/asteria-home-header-refresh.css');
  assert.match(oldCss,/mask-image:linear-gradient\\(to bottom/);
});
test('profile image comes after account button and fills shorter header',()=>{
  const html=read('index.html');
  assert.ok(html.indexOf('id="accountControls"')<html.indexOf('id="asteriaHeaderProfile"'));
  const css=read('css/asteria-home-header-refresh.css');
  assert.match(css,/--core-header-height: clamp\(76px, 6\.55vw, 160px\)/);
  assert.match(css,/border-radius:0!important/);
  assert.match(css,/height:var\(--core-header-height\)!important/);
  assert.match(css,/\.asteria-header-identity/);
});
test('display name is only canonical registered username, Account ID stays unchanged',()=>{
  const html=read('index.html');
  assert.doesNotMatch(html,/id="accountProfileEditDisplay"|id="accountProfileDisplayName"/);
  assert.match(html,/Username/);
  const header=read('js/asteria-account-header.js');
  assert.match(header,/const name=verified\.username/);
  assert.match(header,/verified\.status==='assigned'\?verified\.accountId/);
  const profile=read('js/asteria-account-profile.js');
  assert.match(profile,/get\('accountProfileUsernameEditForm'\)\.hidden=false/);
  assert.doesNotMatch(profile,/get\('accountProfileEditDisplay'\)/);
});
test('other site navigation and profile avatar actions remain wired',()=>{
  const html=read('index.html');
  for(const s of ['id="compendiumIndexButton"','id="characterForgeTop"','id="campaignsTop"',
    'data-asteria-account-action="logout"','id="asteriaHeaderAvatarButton"','id="accountProfileAvatarUpload"'])
      assert.ok(html.includes(s),s);
});
