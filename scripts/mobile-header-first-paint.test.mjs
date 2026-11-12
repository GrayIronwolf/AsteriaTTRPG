import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('final mobile layout stylesheet is loaded last before the body paints',()=>{
  const html=read('index.html');
  const stylesheet='css/asteria-mobile-header-stability.css?v=mobile-first-paint-20261112';
  const body=html.indexOf('<body');
  const css=html.indexOf(stylesheet);
  assert.ok(css>0&&css<body);
  assert.ok(css>html.indexOf('css/asteria-home-header-refresh.css'));
  assert.equal((html.match(/asteria-mobile-header-stability\.css/g)||[]).length,1);
});

test('mobile-only header navigation is hidden until moved into the drawer, preserving desktop controls',()=>{
  const css=read('css/asteria-mobile-header-stability.css');
  const compact=css.slice(css.indexOf('@media (max-width:1679px)'),
    css.indexOf('/* Logo, account and menu'));
  assert.match(compact,/body \.asteria-header > #globalNavigation\s*\{\s*display:none!important/);
  assert.match(compact,/body #settingsPanel #mobileNavigationSlot #globalNavigation\s*\{\s*display:flex!important/);
  const nav=read('js/asteria-navigation.js');
  assert.match(nav,/matchMedia\('\(max-width: 1679px\)'\)/);
  assert.match(nav,/mobileNavigationSlot'\)\?\.appendChild\(nav\)/);
  assert.match(nav,/desktopNavParent\?\.insertBefore\(nav,desktopAccountsParent\)/);
  assert.doesNotMatch(css,/@media\s*\(min-width:1680px\)/);
});

test('mobile top bar stays in one bounded row and preserves account/profile/menu interactions',()=>{
  const css=read('css/asteria-mobile-header-stability.css');
  const compact=css.slice(css.indexOf('@media (max-width:720px)'));
  for(const selector of ['body .topbar.asteria-header',
    'body .asteria-header .asteria-header-brand',
    'body .asteria-header .top-actions',
    'body .asteria-header #accountControls',
    'body .asteria-header #accountControls #loginToggle',
    'body .asteria-header #settingsToggle',
    'body .asteria-header .asteria-header-profile:not([hidden])']){
    assert.ok(compact.includes(selector),selector);
  }
  assert.match(compact,/flex-wrap:nowrap!important/);
  assert.match(compact,/flex:1 1 0!important/);
  assert.match(compact,/position:static!important/);
  assert.match(compact,/max-width:166px!important/);
  const html=read('index.html');
  for(const id of ['loginToggle','settingsToggle','accountMenuWrap','asteriaHeaderProfile'])
    assert.ok(html.includes('id="'+id+'"'),id);
});

test('initial header and home buttons have their approved image classes before JS executes',()=>{
  const html=read('index.html');
  const expected=[
    ['compendiumIndexButton','long'],['compendiumQuickToggle','icon'],
    ['characterForgeTop','long'],['campaignsTop','long'],
    ['loginToggle','small'],['settingsToggle','icon']
  ];
  for(const [id,size] of expected){
    const tag=html.match(new RegExp('<(?:button|a)[^>]*id="'+id+'"[^>]*>'))?.[0]||'';
    assert.ok(tag.includes('asteria-menu-button'),id);
    assert.ok(tag.includes('data-asteria-button-size="'+size+'"'),id);
  }
  for(const label of ['Explore the World','Open Handbook']){
    const tag=html.match(new RegExp('<button[^>]*>'+label+'</button>'))?.[0]||'';
    assert.ok(tag.includes('asteria-menu-button'),label);
    assert.ok(tag.includes('data-asteria-button-size="long"'),label);
  }
  const css=read('css/asteria-button-images.css');
  assert.match(css,/--asteria-approved-frame/);
  assert.match(css,/\.asteria-menu-button::before|\.asteria-menu-button,#globalNavigation/);
  const script=read('js/asteria-menu-buttons.js');
  assert.match(script,/classList\.contains\('asteria-menu-button'\)/);
  assert.match(script,/const BUTTON_FAMILIES=Object\.freeze/);
});

test('mobile accessibility drawer and gameplay functionality remain unchanged',()=>{
  const html=read('index.html');
  assert.match(html,/<aside id="settingsPanel" class="settings-panel" role="dialog"/);
  assert.match(html,/aria-controls="settingsPanel" aria-expanded="false"/);
  assert.match(html,/id="mobileNavigationSlot"/);
  assert.match(html,/id="mobileAccountSlot"/);
  assert.match(html,/id="compendiumIndexButton"/);
  assert.match(html,/id="campaignsTop"/);
  assert.match(html,/id="characterForgeTop"/);
  assert.match(html,/id="loginToggle"/);
  assert.match(html,/id="asteriaHeaderProfile"[^>]*hidden/);
  assert.match(html,/id="asteriaHeaderAvatarButton"/);
});
