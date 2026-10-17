import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { trapDialogTab } from '../src/components/dialogFocus.mjs';

function control({ visible = true, hidden = false, tabIndex = 0 } = {}) {
  return { tabIndex, focused:0, focus(){this.focused++;}, getClientRects:()=>visible?[{}]:[], closest:()=>hidden?{}:null };
}
function key(shiftKey = false, name = 'Tab') {
  return {key:name,shiftKey,prevented:false,preventDefault(){this.prevented=true;}};
}
test('dialog captures first forward and backward Tab from its initially focused container', () => {
  const first=control(), last=control(), dialog={querySelectorAll:()=>[first,last]};
  const forward=key();trapDialogTab(forward,dialog,dialog);
  assert.equal(forward.prevented,true);assert.equal(first.focused,1);
  const backward=key(true);trapDialogTab(backward,dialog,dialog);
  assert.equal(backward.prevented,true);assert.equal(last.focused,1);
});
test('dialog wraps at both ends, excludes hidden controls and leaves ordinary tabbing alone', () => {
  const hidden=control({hidden:true}), collapsed=control({visible:false}), excluded=control({tabIndex:-1}), first=control(), middle=control(), last=control();
  const dialog={querySelectorAll:()=>[hidden,excluded,first,middle,last,collapsed]};
  const forward=key();trapDialogTab(forward,dialog,last);assert.equal(first.focused,1);
  const backward=key(true);trapDialogTab(backward,dialog,first);assert.equal(last.focused,1);
  const ordinary=key();trapDialogTab(ordinary,dialog,middle);assert.equal(ordinary.prevented,false);
  assert.equal(hidden.focused,0);assert.equal(collapsed.focused,0);
  assert.equal(excluded.focused,0);
});
test('empty dialog keeps Tab inside and unrelated keys are untouched', () => {
  const dialog={querySelectorAll:()=>[]};
  const tab=key();trapDialogTab(tab,dialog,dialog);assert.equal(tab.prevented,true);
  const arrow=key(false,'ArrowDown');trapDialogTab(arrow,dialog,dialog);assert.equal(arrow.prevented,false);
});
function shell() {
  const nodes=Object.fromEntries(['settingsPanel','settingsToggle','shade'].map(id=>[id,{
    attributes:{},inert:false,open:false,
    classList:{contains:()=>false},
    setAttribute(name,value){this.attributes[name]=value;},
    querySelector(){return null;}
  }]));
  const trigger=control();
  const document={readyState:'loading',addEventListener(){},getElementById:id=>nodes[id],activeElement:trigger,body:{classList:{toggle(){}}}};
  const context={document,window:{},requestAnimationFrame:fn=>fn()};
  vm.createContext(context);
  const source=fs.readFileSync('js/asteria-core-shell.js','utf8').replace(/\}\)\(\);\s*$/, 'window.testShell={syncSettingsAccessibility};})();');
  vm.runInContext(source,context);
  return {nodes,trigger,api:context.window.testShell};
}
test('settings keyboard access follows its actual open state', () => {
  const {nodes,api}=shell();let open=false;
  nodes.settingsPanel.classList.contains=()=>open;
  api.syncSettingsAccessibility();assert.equal(nodes.settingsPanel.inert,true);assert.equal(nodes.settingsPanel.attributes['aria-hidden'],'true');
  open=true;api.syncSettingsAccessibility();assert.equal(nodes.settingsPanel.inert,false);assert.equal(nodes.settingsToggle.attributes['aria-expanded'],'true');
  open=false;api.syncSettingsAccessibility();assert.equal(nodes.settingsPanel.inert,true);
});
