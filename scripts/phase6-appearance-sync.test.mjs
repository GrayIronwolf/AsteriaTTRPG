import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
function runtime({uid='alpha',themeSaved=false,fontSaved=false,remote=null}={}){
  const storage=new Map(),handlers={},elements={},written=[],applied=[];
  let account={role:'account',uid},cloud=remote,subscription=null,localTheme={theme:'ranger',accent:'#2f9b55',text:'#f7ead1',areas:{},glow:.3,overlay:.4,panel:.78,motion:'both'},
    localFonts={heading:'cinzel',reading:'inter',size:100};
  if(themeSaved)storage.set('asteria.ui.theme.v2.alpha',JSON.stringify(localTheme));
  if(fontSaved)storage.set('asteria.typography.v1.alpha',JSON.stringify(localFonts));
  function node(id){
    return elements[id] ||= {id,hidden:true,disabled:false,textContent:'',events:{},
      addEventListener(kind,fn){this.events[kind]=fn;},click(){this.events.click?.();}};
  }
  const ids=['appearanceSyncStatus','appearanceSyncControls','appearanceSyncNow','appearanceConflictControls',
    'appearanceConflict-theme','appearanceConflict-typography','appearanceCloud-theme',
    'appearanceCloud-typography','appearanceDevice-theme','appearanceDevice-typography'];
  ids.forEach(node);
  const window={
    AsteriaAuthBridge:{getSession:()=>account},
    AsteriaFirebase:{
      getUser:()=>account.role==='guest'?null:{uid:account.uid},
      subscribeAppearancePreferences(callback){subscription=callback;return ()=>{subscription=null;};},
      async saveAppearancePreference(section,value,expectedRevision,force){
        const revision=Number(cloud?.[section]?.revision||0);
        if(!force&&revision!==expectedRevision)return {ok:false,conflict:true,revision,value:cloud?.[section]?.value};
        cloud={...cloud,[section]:{value,revision:revision+1}};
        written.push({section,value,expectedRevision,force});
        return {ok:true,revision:revision+1};
      }
    },
    AsteriaThemeSystem:{
      getSettings:()=>localTheme,applyCloud(value){localTheme=value;applied.push('theme');},
      scopedStorageKey:()=> 'asteria.ui.theme.v2.'+account.uid
    },
    AsteriaTypography:{
      get:()=>localFonts,applyCloud(value){localFonts=value;applied.push('typography');},
      scopedStorageKey:()=> 'asteria.typography.v1.'+account.uid
    },
    addEventListener(type,callback){handlers[type]=callback;}
  };
  const document={readyState:'loading',addEventListener(type,fn){handlers['document:'+type]=fn;},getElementById:node};
  const context={window,document,localStorage:{
    getItem:key=>storage.get(key)||null,
    setItem:(key,value)=>storage.set(key,value)
  }};
  vm.createContext(context);
  vm.runInContext(read('js/asteria-appearance-sync.js'),context);
  handlers['document:DOMContentLoaded']();
  return {window,storage,elements,handlers,written,applied,
    emit(data=cloud){subscription?.(data);},
    changeAccount(next){account=next;window.AsteriaAppearanceSync.refreshAccount();},
    setTheme(value){localTheme=value;},
    cloud:()=>cloud,
    getTheme:()=>localTheme,
    getFonts:()=>localFonts,
    getStatus:()=>window.AsteriaAppearanceSync.getStatus()
  };
}

test('Cloud appearance hydrates a new device without writing or touching campaign/character data',()=>{
 const remote={
   theme:{revision:3,value:{theme:'cleric',accent:'#f3d36b',motion:'wave'}},
   typography:{revision:5,value:{heading:'cinzel',reading:'arimo',size:110}}
 };
 const t=runtime({remote});
 t.emit();
 assert.deepEqual([...t.applied],['theme','typography']);
 assert.equal(t.getTheme().theme,'cleric');
 assert.equal(t.getFonts().reading,'arimo');
 assert.equal(t.written.length,0,'Cloud hydration cannot trigger a save loop');
 assert.equal(t.getStatus().revisions.theme,3);
 assert.equal(t.getStatus().revisions.typography,5);
 assert.equal(t.elements.appearanceConflictControls.hidden,true);
 assert.match(t.elements.appearanceSyncStatus.textContent,/synced/i);
});

test('A local preference is preserved on conflict until the user explicitly selects a version',async()=>{
 const t=runtime({themeSaved:true,fontSaved:true,remote:{
   theme:{revision:4,value:{theme:'paladin',accent:'#d8d3bd'}},
   typography:{revision:8,value:{heading:'marcellus-sc',reading:'tinos',size:115}}
 }});
 t.emit();
 assert.equal(t.getTheme().theme,'ranger');
 assert.equal(t.getFonts().reading,'inter');
 assert.equal(t.getStatus().conflicts.theme,true);
 assert.equal(t.getStatus().conflicts.typography,true);
 assert.equal(t.elements.appearanceConflictControls.hidden,false);
 t.elements['appearanceCloud-theme'].click();
 assert.equal(t.getTheme().theme,'paladin');
 assert.equal(t.getStatus().conflicts.theme,false);
 t.elements['appearanceDevice-typography'].click();
 await Promise.resolve();await Promise.resolve();
 assert.equal(t.written.at(-1).section,'typography');
 assert.equal(t.written.at(-1).force,true);
 assert.equal(t.getStatus().conflicts.typography,false);
 assert.equal(t.getFonts().reading,'inter');
});

test('Explicit sync saves independent section revisions and does not publish on sign-out',async()=>{
 const t=runtime();
 t.emit(null);
 t.elements.appearanceSyncNow.click();
 await Promise.resolve();await Promise.resolve();
 assert.deepEqual(t.written.map(x=>x.section).sort(),['theme','typography']);
 assert.equal(t.getStatus().revisions.theme,1);
 assert.equal(t.getStatus().revisions.typography,1);
 t.changeAccount({role:'guest',uid:null});
 assert.equal(t.getStatus().uid,'');
 assert.equal(t.elements.appearanceSyncControls.hidden,true);
 const count=t.written.length;
 t.handlers['asteria:appearance-local-change']({detail:{section:'theme'}});
 assert.equal(t.written.length,count,'Guest preferences are never published');
});

test('Cloud conflict detection is per section and excludes gameplay and raw secrets',()=>{
 const source=read('js/firebase-auth.js');
 assert.match(source,/saveAppearancePreference: async function\(section,value,expectedRevision,overwrite=false\)/);
 assert.match(source,/if\(!\['theme','typography'\]\.includes\(section\)\)/);
 assert.match(source,/runTransaction\(db,async transaction=>/);
 assert.match(source,/revision!==expectedRevision/);
 assert.match(source,/doc\(db,'users',uid,'settings','appearance'\)/);
 const scope=source.slice(source.indexOf('saveAppearancePreference: async function'),source.indexOf('subscribeLiveSession: function'));
 for(const forbidden of ['characterId','campaignId','password','accessToken','inventory','xp','coins'])
   assert.ok(!scope.includes(forbidden),'Appearance API must not contain '+forbidden);
 const theme=read('js/asteria-ui-theme-system.js');
 const typography=read('js/asteria-typography.js');
 assert.match(theme,/function applyCloud\(settings\)/);
 assert.match(typography,/applyCloud\(value\)/);
 assert.match(read('js/asteria-appearance-sync.js'),/asteria:firebase-ready/);
 assert.match(read('js/asteria-appearance-sync.js'),/asteria:firebase-signed-out/);
});

test('Sync UI is accessible, mobile-friendly and does not modify approved images or character layout',()=>{
 const html=read('index.html'),css=read('css/asteria-appearance-sync.css');
 for(const id of ['appearanceSyncStatus','appearanceSyncNow','appearanceCloud-theme','appearanceDevice-theme',
   'appearanceCloud-typography','appearanceDevice-typography'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/id="appearanceSyncStatus" role="status" aria-live="polite"/);
 assert.match(html,/js\/asteria-appearance-sync\.js\?v=phase6-update2-20261106/);
 assert.match(css,/@media \(max-width:600px\)/);
 for(const asset of ['asteria-smoke-background.css','asteria-button-images.css','asteria-panel-headers.css',
   'asteria-dashboard-panel-images.css'])assert.ok(html.includes(asset),asset);
 const service=read('src/firebase/asteriaFirebaseService.js');
 assert.match(service,/updateDashboardPreferences/);
 assert.match(service,/saveUserDashboardLayout/);
 assert.match(service,/subscribeUserDashboardLayout/);
});
