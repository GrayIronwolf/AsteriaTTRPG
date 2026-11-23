import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defaultDiceAppearance} from '../src/dice/diceAppearanceCatalogue.mjs';
import {defaultDiceTrayAppearance} from '../src/dice/diceTrayCatalogue.mjs';
import {diceResult} from '../src/state/diceRollModel.mjs';
import {prepareAsteriaDicePreview} from '../src/dice/openDiceAdapter.mjs';
import {STUDIO_LOOKS,STUDIO_UNDO_LIMIT,createDiceStudioState,changeDiceStudio,
  undoDiceStudio,redoDiceStudio,applyDiceStudioLook,matchDiceTrayPalette,
  restoreDiceStudio} from '../src/dice/diceStudioModel.mjs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');

test('four visual-only looks reference existing dice and tray designs',()=>{
  assert.equal(STUDIO_LOOKS.length,4);
  for(const look of STUDIO_LOOKS){
    const s=applyDiceStudioLook(createDiceStudioState(),look.id);
    assert.equal(s.current.dice.familyId,look.diceId);
    assert.equal(s.current.tray.designId,look.trayId);
  }
  assert.throws(()=>applyDiceStudioLook(createDiceStudioState(),'invalid'),/Unknown/);
});
test('appearance edits validate, preserve other editor and do not mutate old snapshots',()=>{
  const before=createDiceStudioState();
  const after=changeDiceStudio(before,{dice:{...before.current.dice,primaryColor:'#abcdef'}});
  assert.equal(after.current.dice.primaryColor,'#ABCDEF');
  assert.equal(after.current.tray,before.current.tray);
  assert.equal(before.current.dice.primaryColor,defaultDiceAppearance().primaryColor);
  assert.equal(after.past.length,1);
  assert.throws(()=>changeDiceStudio(before,{dice:{...before.current.dice,primaryColor:'red'}}),/HEX/);
  assert.throws(()=>changeDiceStudio(before,{rollTotal:100}),/Unsupported/);
  assert.equal(changeDiceStudio(before,{dice:before.current.dice}),before);
});
test('undo, redo and divergent edits are correct and bounded',()=>{
  let state=createDiceStudioState();
  assert.equal(undoDiceStudio(state),state);
  assert.equal(redoDiceStudio(state),state);
  state=changeDiceStudio(state,{dice:{...state.current.dice,primaryColor:'#AABBCC'}});
  state=changeDiceStudio(state,{tray:{...state.current.tray,frameColor:'#102030'}});
  const undone=undoDiceStudio(state);
  assert.equal(undone.current.tray.frameColor,defaultDiceTrayAppearance().frameColor);
  assert.equal(undone.current.dice.primaryColor,'#AABBCC');
  const redone=redoDiceStudio(undone);
  assert.equal(redone.current.tray.frameColor,'#102030');
  const diverged=changeDiceStudio(undone,{dice:{...undone.current.dice,numberColor:'#103050'}});
  assert.equal(diverged.future.length,0);
  assert.equal(redoDiceStudio(diverged),diverged);
  for(let i=0;i<STUDIO_UNDO_LIMIT+7;i++){
    state=changeDiceStudio(state,{dice:{...state.current.dice,
      primaryColor:'#'+(0x100000+i).toString(16).padStart(6,'0')}});
  }
  assert.equal(state.past.length,STUDIO_UNDO_LIMIT);
});
test('match tray to selected dice palette preserves physical geometry choices',()=>{
  const base=createDiceStudioState(defaultDiceAppearance('dice-ruby'),
    {...defaultDiceTrayAppearance('walnut-octagon'),size:'compact',wallHeight:'high'});
  const updated=matchDiceTrayPalette(base);
  assert.equal(updated.current.tray.designId,'walnut-octagon');
  assert.equal(updated.current.tray.size,'compact');
  assert.equal(updated.current.tray.wallHeight,'high');
  assert.equal(updated.current.tray.frameColor,base.current.dice.secondaryColor);
  assert.equal(updated.current.tray.interiorColor,base.current.dice.primaryColor);
  assert.equal(updated.current.tray.trimColor,base.current.dice.numberColor);
});
test('restore selected appearance or full studio is undoable',()=>{
  let state=applyDiceStudioLook(createDiceStudioState(),'royal');
  state=changeDiceStudio(state,{tray:{...state.current.tray,wear:'ancient'}});
  state=restoreDiceStudio(state,'tray');
  assert.equal(state.current.tray.wear,'pristine');
  assert.equal(state.current.dice.familyId,'dice-celestial');
  state=restoreDiceStudio(state,'dice');
  assert.equal(state.current.dice.familyId,'dice-celestial');
  state=restoreDiceStudio(state,'all');
  assert.equal(state.current.dice.familyId,defaultDiceAppearance().familyId);
  assert.equal(state.current.tray.designId,defaultDiceTrayAppearance().designId);
  assert.equal(undoDiceStudio(state).current.dice.familyId,'dice-celestial');
  assert.throws(()=>restoreDiceStudio(state,'tower'),/Unknown/);
});
test('preview-only appearance and preset switches cannot change server roll',()=>{
  const record=diceResult({pool:[{sides:20,count:1}],modifier:5,label:'studio'},
    ()=>20,1730000000000,'studio-server');
  const preview=prepareAsteriaDicePreview(record);
  let state=createDiceStudioState();
  for(const look of STUDIO_LOOKS)state=applyDiceStudioLook(state,look.id);
  state=matchDiceTrayPalette(state);
  state=undoDiceStudio(state);
  assert.deepEqual(prepareAsteriaDicePreview(record),preview);
  assert.equal(record.total,25);
  assert.equal(record.natural,'natural-20');
});
test('studio reuses 3D renderers, has real selectors and avoids Firebase writes',()=>{
  const ui=read('src/dice/DiceCustomizationStudio.jsx');
  const work=read('src/dashboards/AdvancedDiceWorkspace.jsx');
  const tray=read('src/dice/AsteriaDiceTray.jsx');
  const picker=read('src/dice/CoreDicePicker.jsx');
  assert.match(ui,/role="tablist"/);
  assert.match(ui,/<CoreDicePicker/);
  assert.match(ui,/<DiceTrayStudio/);
  assert.match(ui,/Match tray colours to dice/);
  assert.match(ui,/onUndo/);
  assert.match(ui,/onRedo/);
  assert.match(work,/<DiceCustomizationStudio/);
  assert.match(work,/studioManaged/);
  assert.match(tray,/onTrayAppearanceChange/);
  assert.match(picker,/CoreDicePreview/);
  assert.match(picker,/onPreviewKeyDown/);
  assert.doesNotMatch(ui+read('src/dice/diceStudioModel.mjs'),/firebaseService|advancedDiceAction|Math\.random/);
});
