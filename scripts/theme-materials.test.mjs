import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function themeRuntime(settings={}) {
  const variables=new Map(),storage=new Map();
  const areas=['panelBorder','panelBackground','menuButton','topMenuButton','dashboardPrimary','dashboardTab','divider'];
  const ids=['asteriaThemeSelect','asteriaColourWheel','asteriaTextColourWheel','asteriaGlowSlider','asteriaOverlaySlider','asteriaPanelOpacitySlider',...areas.map(key=>`asteriaArea-${key}`)];
  const nodes=Object.fromEntries(ids.map(id=>[id,{value:'',dataset:{},listeners:{},addEventListener(type,handler){this.listeners[type]=handler;}}]));
  const context={document:{readyState:'loading',addEventListener(){},getElementById:id=>nodes[id],documentElement:{style:{setProperty:(key,value)=>variables.set(key,value)}},body:{dataset:{},removeAttribute(){}}},window:{dispatchEvent(){}},localStorage:{setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},CustomEvent:class{}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('js/asteria-ui-theme-system.js','utf8'),context);
  const api=context.window.AsteriaThemeSystem;
  api.applyTheme(settings);api.refreshControls();
  return {api,nodes,variables,storage};
}

test('global colour wheel updates linked areas while preserving independent colours',()=>{
  const {api,nodes,variables,storage}=themeRuntime({accent:'#123456',areas:{topMenuButton:'#abcdef',panelBackground:'#101010'}});
  nodes.asteriaColourWheel.value='#df5729';nodes.asteriaColourWheel.listeners.input();
  const settings=api.getSettings();
  assert.equal(settings.accent,'#df5729');
  assert.equal(settings.areas.menuButton,'#df5729');
  assert.equal(settings.areas.dashboardTab,'#df5729');
  assert.equal(settings.areas.topMenuButton,'#abcdef');
  assert.equal(settings.areas.panelBackground,'#101010');
  assert.equal(variables.get('--asteria-top-menu-button'),'#abcdef');
  assert.equal(variables.get('--asteria-menu-button'),'#df5729');
  nodes.asteriaColourWheel.listeners.change();
  assert.equal(JSON.parse(storage.get('asteria-ui-theme-v1')).areas.topMenuButton,'#abcdef');
});

test('independent menu controls change only their existing colour area',()=>{
  const {api,nodes,variables}=themeRuntime({theme:'ranger'});
  const input=nodes['asteriaArea-dashboardTab'];input.value='#ad34ef';input.listeners.input();
  assert.equal(api.getSettings().areas.dashboardTab,'#ad34ef');
  assert.equal(api.getSettings().areas.topMenuButton,'#2f9b55');
  assert.equal(api.getSettings().areas.menuButton,'#2f9b55');
  assert.equal(variables.get('--asteria-dashboard-tab'),'#ad34ef');
});

test('class presets still reset their linked areas and glow control reaches zero',()=>{
  const {api,nodes,variables}=themeRuntime({areas:{topMenuButton:'#abcdef'}});
  nodes.asteriaThemeSelect.value='bloodhunter';nodes.asteriaThemeSelect.listeners.change();
  assert.equal(api.getSettings().areas.topMenuButton,'#b51f2e');
  assert.equal(api.getSettings().areas.dashboardTab,'#b51f2e');
  nodes.asteriaGlowSlider.value='0';nodes.asteriaGlowSlider.listeners.input();
  assert.equal(variables.get('--asteria-glow-intensity'),'0');
});
