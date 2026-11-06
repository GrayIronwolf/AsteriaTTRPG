import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dashboardKeyboardProposal} from '../src/state/dashboardGridModel.mjs';
import {defaultDashboardLayout,moveDashboardGridPanel,resizeDashboardGridPanel,lockDashboardGridPanel} from '../src/state/dashboardLayoutModel.mjs';
import {trapDialogTab} from '../src/components/dialogFocus.mjs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('Player and GM keyboard movement and resize use existing grid bounds and preserve locks',()=>{
 for(const role of ['player','gm']){
   const id=role==='gm'?'encounter':'weapons';
   const base=defaultDashboardLayout(role),p=base.placements[id];
   const left=dashboardKeyboardProposal(role,id,p,'move','ArrowLeft');
   const right=dashboardKeyboardProposal(role,id,p,'move','ArrowRight');
   assert.equal(left.x,Math.max(0,p.x-1));
   assert.equal(right.x,Math.min(12-p.w,p.x+1));
   const resize=dashboardKeyboardProposal(role,id,p,'resize','ArrowRight');
   assert.equal(resize.w,Math.min(p.w+1,role==='gm'?12:6));
   assert.equal(dashboardKeyboardProposal(role,id,p,'resize','Enter'),null);
   const locked=lockDashboardGridPanel(base,role,id,true);
   assert.deepEqual(moveDashboardGridPanel(locked,role,id,left.x,left.y).placements[id],p);
   assert.deepEqual(resizeDashboardGridPanel(locked,role,id,resize.w,resize.h).placements[id],p);
 }
});

test('Tab focus stays within the editor for forward/backward keyboard navigation',()=>{
 const a={tabIndex:0,getClientRects:()=>[{}],closest:()=>null,focus(){focused='a';}};
 const b={tabIndex:0,getClientRects:()=>[{}],closest:()=>null,focus(){focused='b';}};
 const dialog={querySelectorAll(){return [a,b];}};
 let focused='',prevented=false;
 const e=(shiftKey=false)=>({key:'Tab',shiftKey,preventDefault(){prevented=true;}});
 trapDialogTab(e(),dialog,b);
 assert.equal(focused,'a');assert.equal(prevented,true);
 focused='';prevented=false;
 trapDialogTab(e(true),dialog,a);
 assert.equal(focused,'b');assert.equal(prevented,true);
 focused='';prevented=false;
 trapDialogTab(e(),dialog,documentLike());
 function documentLike(){return {tabIndex:-1};}
 assert.equal(focused,'a');assert.equal(prevented,true);
});

test('Visual editor handles pointer cancel/lost capture, locks and keyboard resizing',()=>{
 const editor=read('src/components/DashboardCustomisation.jsx');
 assert.match(editor,/onPointerMove=\{drag\} onPointerUp=\{end\} onPointerCancel=\{cancel\} onLostPointerCapture=\{cancel\}/);
 assert.match(editor,/if\(!g\|\|g\.pointer!==e\.pointerId\)return/);
 assert.match(editor,/gesture\.current\|\|e\.isPrimary===false/);
 assert.match(editor,/releasePointerCapture\?\.\(e\.pointerId\)/);
 assert.match(editor,/if\(disabled\|\|layout\.lockedPositions\.includes\(id\)\)return/);
 assert.match(editor,/dashboardKeyboardProposal\(role,id,rect,kind,key\)/);
 assert.match(editor,/keyboard\(id,pos,'resize',e\.key\)/);
 assert.match(editor,/trapDialogTab\(e,dialogRef\.current,document\.activeElement\)/);
 assert.match(editor,/e\.stopPropagation\(\)/);
 assert.match(editor,/Apply Changes/);
 assert.match(editor,/onApply\(combined\)/);
});

test('GM unsaved layout draft survives background subscriptions and resets on account changes',()=>{
 const gm=read('src/dashboards/GMDashboard.jsx');
 assert.match(gm,/const dashboardDraftDirty=useRef\(false\)/);
 assert.match(gm,/dashboardDraftDirty\.current=false;[\s\S]*?setDashboardSettingsDraft\(defaultDashboardLayout\('gm'\)\)/);
 assert.match(gm,/if\(!dashboardDraftDirty\.current\)\s*setDashboardSettingsDraft\(normalizeDashboardLayout\(layout,'gm'\)\)/);
 assert.match(gm,/dashboardDraftDirty\.current=true;\s*dashboardDraftRevision\.current\+\+;\s*setDashboardSettingsDraft\(change\)/);
 assert.match(gm,/if\(result\?\.ok&&dashboardDraftRevision\.current===saveRevision\)dashboardDraftDirty\.current=false/);
 assert.match(gm,/onChange=\{updateDashboardSettingsDraft\}/);
 const player=read('src/dashboards/CharacterGallerySettings.jsx');
 assert.match(player,/const savedPreferencesKey=JSON\.stringify\(character\.dashboardPreferences\|\|\{\}\)/);
});

test('Mobile touch targets increase without modifying frame, gameplay, or dashboard placement',()=>{
 const css=read('css/asteria-freeform-dashboard.css');
 const mobile=css.slice(css.indexOf('/* Phase 7 mobile usability'));
 assert.match(mobile,/\.react-grid-editor-lock/);
 assert.match(mobile,/\.react-grid-editor-size-options button/);
 assert.match(mobile,/\.react-grid-editor-scroller\{\s*overscroll-behavior:contain/);
 assert.match(mobile,/@media \(max-width:720px\)/);
 const html=read('index.html');
 for(const asset of ['asteria-smoke-background.css','asteria-dashboard-panel-images.css','asteria-panel-headers.css','asteria-button-images.css'])
   assert.ok(html.includes(asset),asset);
 assert.match(read('src/components/DashboardCustomisation.jsx'),/DashboardPanelFrameContext\.Provider/);
});
