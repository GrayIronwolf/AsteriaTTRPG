import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('homepage replaces old Welcome and World Map cards with one hero',()=>{
  const html=read('index.html');
  const home=html.slice(html.indexOf('<section id="home"'),html.indexOf('<section id="workspace"'));
  assert.match(home,/asteria-home-cinematic/);
  assert.match(home,/assets\/home\/varkhyn-snowstorm\.avif/);
  assert.doesNotMatch(home,/public-home-grid|world-map-preview|home-hero card|map-placeholder/);
  assert.match(home,/data-workspace-section="Asteria Handbook"/);
});
test('hero uses the uploaded image in repository and fades on all sides',()=>{
  const file=new URL('../assets/home/varkhyn-snowstorm.avif',import.meta.url);
  const stat=statSync(file);
  assert.ok(stat.size>1000&&stat.size<500000);
  const css=read('css/asteria-home-header-refresh.css');
  assert.match(css,/mask-image:linear-gradient\(to bottom/);
  assert.match(css,/linear-gradient\(to right/);
  assert.match(css,/linear-gradient\(to bottom/);
  assert.match(css,/object-fit:cover/);
});
test('profile image comes after account button and fills shorter header',()=>{
  const html=read('index.html');
  assert.ok(html.indexOf('id="accountControls"')<html.indexOf('id="asteriaHeaderProfile"'));
  const css=read('css/asteria-home-header-refresh.css');
  assert.match(css,/--core-header-height: clamp\(88px, 8\.33vw, 212px\)/);
  assert.match(css,/border-radius:0!important/);
  assert.match(css,/height:var\(--core-header-height\)!important/);
  assert.match(css,/\.asteria-header-identity/);
});
test('display name is only canonical registered username, Account ID stays unchanged',()=>{
  const html=read('index.html');
  assert.doesNotMatch(html,/id="accountProfileEditDisplay"|id="accountProfileDisplayName"/);
  assert.match(html,/Username \/ display name/);
  const header=read('js/asteria-account-header.js');
  assert.match(header,/const name=verified\.username/);
  assert.match(header,/verified\.status==='assigned'\?verified\.accountId/);
  const profile=read('js/asteria-account-profile.js');
  assert.match(profile,/displayName:String\(lastProfile\.username\|\|''\)/);
  assert.doesNotMatch(profile,/get\('accountProfileEditDisplay'\)/);
});
test('other site navigation and profile avatar actions remain wired',()=>{
  const html=read('index.html');
  for(const s of ['id="compendiumIndexButton"','id="characterForgeTop"','id="campaignsTop"',
    'id="accountMenuLogout"','id="asteriaHeaderAvatarButton"','id="accountProfileAvatarUpload"'])
      assert.ok(html.includes(s),s);
});
