import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diceResult} from '../src/state/diceRollModel.mjs';
import {defaultDiceTrayAppearance} from '../src/dice/diceTrayCatalogue.mjs';
import {defaultDiceAppearance} from '../src/dice/diceAppearanceCatalogue.mjs';
import {
 GRAPHICS,EFFECT_LEVELS,ELEMENTS,REDUCED_MOTION,SOUND_PACKS,
 PRESENTATION_VERSION,PRESENTATION_STORAGE_KEY,defaultDicePresentation,
 validateDicePresentation,deviceDicePresentation,isReducedDiceMotion,
 diceGraphicsProfile,diceEffectForRecord,diceSoundAppearance
} from '../src/dice/dicePresentationModel.mjs';
const defaults=()=>defaultDicePresentation();
const record=(face=20,sides=20)=>{
 const result=diceResult({pool:[{count:1,sides}],modifier:5,label:'3.10 visual only'},
  ()=>face,1730000000000,'phase-3-10-'+face+'-'+sides);
 return result;
};
test('Phase 3.10 supplies validated enum settings and a private device storage key',()=>{
 assert.equal(PRESENTATION_VERSION,1);
 assert.match(PRESENTATION_STORAGE_KEY,/presentation:v1/);
 assert.deepEqual(GRAPHICS,['auto','high','balanced','performance']);
 assert.deepEqual(EFFECT_LEVELS,['off','subtle','full']);
 assert.equal(ELEMENTS.length,14);
 assert.deepEqual(REDUCED_MOTION,['system','on','off']);
 assert.ok(SOUND_PACKS.includes('metal')&&SOUND_PACKS.includes('magical'));
 assert.deepEqual(validateDicePresentation(defaults()),defaults());
});
test('unknown, forged, oversized or malformed settings are rejected',()=>{
 const invalid=[
  {...defaults(),version:2},{...defaults(),uid:'other'},
  {...defaults(),graphics:'ultra-999'},
  {...defaults(),soundPack:'script://evil'},
  {...defaults(),element:'other'},
  {...defaults(),criticalEffects:'unbounded'},
  {...defaults(),reducedMotion:'invalid'},
  {...defaults(),muted:'false'},
  {...defaults(),volume:'1000'},
  {...defaults(),effects:'full',extra:'x'.repeat(1500)}
 ];
 for(const row of invalid)assert.throws(()=>validateDicePresentation(row));
 assert.deepEqual(deviceDicePresentation('{'),defaults());
 assert.deepEqual(deviceDicePresentation(JSON.stringify({...defaults(),uid:'other'})),defaults());
 assert.deepEqual(deviceDicePresentation(JSON.stringify(defaults())),defaults());
});
test('automatic quality adapts; explicit tiers stay predictable',()=>{
 const cases=[
  [{deviceMemory:1,hardwareConcurrency:2,viewportWidth:360},'performance'],
  [{deviceMemory:4,hardwareConcurrency:6,viewportWidth:700},'balanced'],
  [{deviceMemory:8,hardwareConcurrency:8,viewportWidth:1400},'high']
 ];
 for(const [env,wanted]of cases){
  const v=diceGraphicsProfile(defaults(),env);
  assert.equal(v.tier,wanted);
  assert.ok(v.pixelRatio>.5&&v.pixelRatio<=1.5);
  assert.ok(v.particleLimit<=20&&v.watcherLimit<=6);
 }
 for(const tier of GRAPHICS.filter(x=>x!=='auto'))
  assert.equal(diceGraphicsProfile({...defaults(),graphics:tier},cases[0][0]).tier,tier);
 assert.equal(diceGraphicsProfile({...defaults(),graphics:'performance'},cases[0][0]).particleLimit,0);
});
test('system and explicit reduced motion disable particles without changing dice totals',()=>{
 assert.equal(isReducedDiceMotion(defaults(),{systemReducedMotion:true}),true);
 assert.equal(isReducedDiceMotion({...defaults(),reducedMotion:'off'},
  {systemReducedMotion:true}),false);
 const before=record();
 const config={...defaults(),element:'fire',criticalEffects:'full',effects:'full'};
 const profile=diceGraphicsProfile({...config,reducedMotion:'on'},{viewportWidth:1300});
 assert.equal(profile.reducedMotion,true);
 assert.equal(profile.watcherLimit,0);
 assert.deepEqual(diceEffectForRecord(before,config,profile).count,0);
 assert.equal(before.total,25);
});
test('Natural 20, Natural 1, ordinary rolls and elemental palettes are cosmetic',()=>{
 const p={...defaults(),element:'arcane',criticalEffects:'full',effects:'full'};
 const profile=diceGraphicsProfile(p,{viewportWidth:1280,deviceMemory:8});
 const nat20=record(20),nat1=record(1),ordinary=record(6);
 assert.equal(diceEffectForRecord(nat20,p,profile).critical,'success');
 assert.equal(diceEffectForRecord(nat1,p,profile).critical,'failure');
 assert.equal(diceEffectForRecord(ordinary,p,profile).critical,null);
 assert.equal(diceEffectForRecord(ordinary,p,profile).element,'arcane');
 assert.equal(diceEffectForRecord(nat20,p,profile).count,20);
 assert.equal(diceEffectForRecord(nat20,{...p,element:'none',
  criticalEffects:'off'},profile).count,0);
 assert.equal(record(20).total,25);
 assert.equal(record(1).total,6);
});
test('audio supports six old tray materials, mute and existing volume levels',()=>{
 const t=defaultDiceTrayAppearance('knights-iron');
 for(const sound of SOUND_PACKS.filter(s=>s!=='auto'))
  assert.equal(diceSoundAppearance(t,{...defaults(),soundPack:sound}).sound,sound);
 const muted=diceSoundAppearance(t,{...defaults(),muted:true}, {sound:'metal'});
 assert.equal(muted.sound,'off');
 const auto=diceSoundAppearance(t,defaults(),{sound:'magical'});
 assert.equal(auto.sound,'magical');
 assert.equal(diceSoundAppearance(t,{...defaults(),volume:'low'}).soundVolume,'low');
 assert.equal(diceSoundAppearance(t,defaults()).designId,t.designId);
});
test('only the existing tray renderer owns audio; effects never control Firebase rolls',()=>{
 const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const tray=src('src/dice/AsteriaDiceTray.jsx');
 const fx=src('src/dice/DiceOutcomeEffects.jsx');
 const controls=src('src/dice/DiceEffectsControls.jsx');
 assert.match(tray,/DiceOutcomeEffects/);
 assert.match(tray,/DiceEffectsControls/);
 assert.match(tray,/diceSoundAppearance/);
 assert.match(tray,/engine\.roll\(diceToRoll\)/);
 assert.match(tray,/profile|graphics/);
 assert.match(tray,/status==='settled'/);
 assert.match(controls,/Mute dice sounds/);
 assert.match(fx,/aria-hidden="true"/);
 assert.doesNotMatch(fx+controls,/firebaseService|Math\.random|new DiceRoller|engine\.roll/);
 assert.doesNotMatch(src('src/dice/dicePresentationModel.mjs'),/firebaseService|new CANNON|Math\.random/);
});
test('112 authoritative predetermined results remain stable with every visual setting',()=>{
 const types=[4,6,8,10,12,20,100];
 let count=0;
 for(let i=0;i<112;i++){
  const sides=types[i%types.length],face=i%14===0?1:i%15===0?sides:i%sides+1;
  const saved=record(face,sides),snapshot=JSON.stringify(saved);
  const p={...defaults(),graphics:GRAPHICS[i%GRAPHICS.length],
   element:ELEMENTS[i%ELEMENTS.length],effects:EFFECT_LEVELS[i%EFFECT_LEVELS.length],
   muted:i%2===0,volume:['low','medium','high'][i%3]};
  diceEffectForRecord(saved,p,diceGraphicsProfile(p,{viewportWidth:1200}));
  diceSoundAppearance(defaultDiceTrayAppearance(),p);
  assert.equal(JSON.stringify(saved),snapshot);
  assert.equal(saved.total,face+5);
  count++;
 }
 assert.equal(count,112);
});
