import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Character and campaign artwork use isolated fixed-height columns',()=>{
 const css=read('src/styles/asteria-react.css');
 const jsx=read('src/components/DashboardInformation.jsx');
 assert.match(css,/grid-template-rows:190px;/);
 assert.match(css,/react-player-hud-portrait\{\s*grid-column:1;grid-row:1/);
 assert.match(css,/react-player-hud-campaign-art\{\s*grid-column:3;grid-row:1/);
 assert.match(css,/\.react-player-hud-art > img\{[\s\S]*?object-fit:cover/);
 assert.match(css,/\.react-player-portrait-caption,[\s\S]*?\.react-player-campaign-caption\{[\s\S]*?position:absolute;inset:auto 0 0/);
 assert.match(jsx,/react-player-hud-portrait/);
 assert.match(jsx,/react-player-hud-campaign-art/);
 assert.match(jsx,/hudImagePosition\(character\.portraitPosition/);
 assert.match(jsx,/hudImagePosition\(campaign\.imagePosition/);
});

test('Character overview is more compact but visible labels and tools survive',()=>{
 const css=read('src/styles/asteria-react.css');
 const jsx=read('src/components/DashboardInformation.jsx');
 assert.match(css,/\.react-player-hud-information[\s\S]*?> :is\(\.react-player-resources,\.react-player-characteristics\) > \.react-player-topbar-heading\{\s*display:none/);
 assert.match(css,/\.react-characteristic-paper--summary\{[\s\S]*?min-height:48px;height:48px/);
 assert.match(jsx,/aria-label="Character resources"/);
 assert.match(jsx,/aria-label="Character characteristics"/);
 assert.match(jsx,/onResourceChange/);
});
test('Dashboard category buttons display full labels on a 196px rail',()=>{
 const css=read('src/components/DashboardNavigation.module.css');
 const jsx=read('src/components/DashboardNavigation.jsx');
 const global=read('src/styles/asteria-react.css');
 assert.match(css,/width:196px;min-width:196px;max-width:196px/);
 assert.match(css,/font-size:\.79rem;line-height:1\.15/);
 assert.match(global,/grid-template-columns:196px minmax\(0,1fr\)/);
 assert.match(jsx,/group\.label/);
 assert.match(jsx,/aria-label="Find dashboard page"/);
});
test('Fold button remains operable but is translucent and consumes less vertical space',()=>{
 const css=read('src/styles/asteria-react.css');
 const jsx=read('src/components/DashboardHeaderFold.jsx');
 assert.match(css,/\.asteria-dashboard-header-fold\{\s*height:12px;min-height:12px/);
 assert.match(css,/background:rgba\(28,51,69,\.28\)/);
 assert.match(jsx,/aria-expanded=\{expanded\}/);
 assert.match(jsx,/onClick=\{toggle\}/);
});
