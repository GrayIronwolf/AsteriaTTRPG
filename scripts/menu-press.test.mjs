import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function runtime(){
  const listeners={},windowListeners={};
  const document={readyState:'complete',body:{},querySelectorAll:()=>[],addEventListener:(type,handler)=>{listeners[type]=handler;}};
  const window={addEventListener:(type,handler)=>{windowListeners[type]=handler;}};
  vm.runInNewContext(fs.readFileSync('js/asteria-menu-buttons.js','utf8'),{document,window,MutationObserver:class{observe(){}}});
  const attributes=new Map();
  const button={disabled:false,getAttribute:name=>attributes.get(name),setAttribute:(name,value)=>attributes.set(name,value),removeAttribute:name=>attributes.delete(name)};
  const target={closest:()=>button};
  const key=(type,value)=>listeners[type]({key:value,target,preventDefault(){assert.fail('visual enhancement must not suppress native activation');}});
  return {listeners,windowListeners,document,button,attributes,key};
}

test('Enter and Space hold the top face until release without suppressing native clicks',()=>{
  const {key,attributes}=runtime();
  for(const value of ['Enter',' ']){
    key('keydown',value);assert.equal(attributes.has('data-menu-pressed'),true);
    key('keyup','ArrowRight');assert.equal(attributes.has('data-menu-pressed'),true);
    key('keyup',value);assert.equal(attributes.has('data-menu-pressed'),false);
  }
  key('keydown','ArrowRight');assert.equal(attributes.has('data-menu-pressed'),false);
});

test('cancel, focus loss, hidden page and window blur release the visual press',()=>{
  const {key,attributes,listeners,windowListeners,document}=runtime();
  for(const release of [listeners.focusout,listeners.pointercancel,windowListeners.blur,()=>{document.hidden=true;listeners.visibilitychange();}]){
    key('keydown','Enter');assert.equal(attributes.has('data-menu-pressed'),true);
    release();assert.equal(attributes.has('data-menu-pressed'),false);
  }
});

test('disabled and aria-disabled menu controls never get a keyboard press state',()=>{
  const {key,button,attributes}=runtime();
  button.disabled=true;key('keydown','Enter');assert.equal(attributes.has('data-menu-pressed'),false);
  button.disabled=false;attributes.set('aria-disabled','true');key('keydown',' ');assert.equal(attributes.has('data-menu-pressed'),false);
});
