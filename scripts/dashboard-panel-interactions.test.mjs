import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const player = readFileSync(new URL('../src/dashboards/PlayerDashboardOverview.jsx',import.meta.url),'utf8');
const gm = readFileSync(new URL('../src/dashboards/GMDashboard.jsx',import.meta.url),'utf8');

test('Player action cards work on ordinary click, touch and keyboard activation',()=>{
  assert.doesNotMatch(player,/onDoubleClick=/);
  assert.match(player,/function AbilityCard[\s\S]*?onClick=\{activate\}/);
  assert.match(player,/function LoadoutSlot[\s\S]*?onClick=\{activate\}/);
});

test('Quick item use requires a distinct confirmation and preserves inventory navigation',()=>{
  assert.match(player,/const \[pendingItem, setPendingItem\] = useState\(null\)/);
  assert.match(player,/const result = await useItem\(pendingItem\)/);
  assert.match(player,/if\(result\?\.ok\) setPendingItem\(null\)/);
  assert.match(player,/action=\{<button type="button" onClick=\{\(\) => onNavigate\('inventory'\)\}>Open Inventory<\/button>\}/);
  assert.match(player,/disabled=\{busy \|\| !editable \|\| !itemStillEquipped\}/);
});

test('Spell cast reviews cost and never casts directly from the spell card',()=>{
  assert.match(player,/onActivate=\{spell => setPendingSpell\(spell\)\}/);
  assert.match(player,/const result = await cast\(pendingSpell\)/);
  assert.match(player,/if\(result\?\.ok\) setPendingSpell\(null\)/);
  assert.match(player,/disabled=\{!editable \|\| busy\} onClick=\{confirmCast\}/);
  assert.match(player,/Confirm this spell before spending its resources/);
});

test('GM character-specific title drafts reset and mutation handlers always release busy state',()=>{
  assert.match(gm,/useEffect\(\(\)=>setTitleEdits\(\{\}\),\[manageCharacterId\]\)/);
  assert.match(gm,/const run=async\(operation,success\)=>\{[\s\S]*?finally\{setBusy\(false\);\}\}/);
  assert.match(gm,/const save=async modifier=>\{[\s\S]*?finally \{[\s\S]*?setBusy\(false\);[\s\S]*?\}/);
  assert.match(gm,/className="react-action-message" role="status">\{message\}/);
});
