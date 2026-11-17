import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../js/asteria-gameplay-systems.js',import.meta.url),'utf8');
const start=source.indexOf('  function refreshVisibleForgeHubAfterCharacterLoad(){');
const end=source.indexOf("\n  window.addEventListener('asteria:owned-characters-loaded', refreshVisibleForgeHubAfterCharacterLoad);",start);
assert.ok(start>0 && end>start,'Expected actual Forge account-load guard');

function scenario({viewShowing=false,rootPresent=false,rootInView=true,hub=true,hidden=false,mode='hub'}={}){
  const view={classList:{
    contains:name=>name==='show'?viewShowing:name==='clean-hidden'?hidden:false
  },contains:()=>rootInView};
  const root={isConnected:rootPresent,classList:{contains:name=>name==='phase3-forge-hub-shell'?hub:false}};
  let renders=0;
  const context={
    forgeMode:mode,
    activeSystem:'characterCreator',
    byId:id=>id==='workspace'?view:id==='phase3GameplayShell'&&rootPresent?root:null,
    render:()=>{renders++;}
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start,end)+';this.refreshVisibleForgeHubAfterCharacterLoad=refreshVisibleForgeHubAfterCharacterLoad;',context);
  context.refreshVisibleForgeHubAfterCharacterLoad();
  return renders;
}

test('Firebase restored characters must not open Character Forge while Home is shown',()=>{
  assert.equal(scenario({viewShowing:false,rootPresent:false}),0,'Fresh login must stay Home');
  assert.equal(scenario({viewShowing:false,rootPresent:true}),0,'Previously mounted Forge must stay closed');
  assert.equal(scenario({viewShowing:true,rootPresent:true,hidden:true}),0,'Hidden workspace must stay hidden');
  assert.equal(scenario({viewShowing:true,rootPresent:true,hub:false}),0,'Other workspace must not be replaced');
  assert.equal(scenario({viewShowing:true,rootPresent:true,rootInView:false}),0,'Detached Forge must stay closed');
  assert.equal(scenario({viewShowing:true,rootPresent:true,mode:'create'}),0,'Draft creation must not reset');
});
test('The open Character Forge gallery still updates when owned characters finish loading',()=>{
  assert.equal(scenario({viewShowing:true,rootPresent:true}),1,'Visible hub refreshes in place');
});
test('Delayed Forge content completion is guarded against Home navigation',()=>{
  const body=source.slice(source.indexOf('  function render(){'),source.indexOf('  function renderCharacterForgeHub()'));
  assert.match(body,/const refreshIfStillVisible = \(\) =>/);
  assert.match(body,/view\?\.classList\.contains\('show'\)/);
  assert.match(body,/!root\.isConnected/);
  assert.match(body,/readyForView\(root,dependencies,refreshIfStillVisible\)/);
});
