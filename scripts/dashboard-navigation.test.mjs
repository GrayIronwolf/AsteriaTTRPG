import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDashboardTab, resolveRosterSelection } from '../src/state/dashboardNavigation.mjs';

test('retains the active Player tab while it is available', () => {
  const tabs = [{ id: 'dashboard' }, { id: 'skills' }, { id: 'party' }];
  assert.equal(resolveDashboardTab(tabs, 'skills'), 'skills');
  assert.equal(resolveDashboardTab(tabs, 'party'), 'party');
});

test('falls back when a Player loses campaign-only tabs', () => {
  const tabs = [{ id: 'dashboard' }, { id: 'character' }];
  assert.equal(resolveDashboardTab(tabs, 'party'), 'dashboard');
  assert.equal(resolveDashboardTab(tabs, 'information'), 'dashboard');
  assert.equal(resolveDashboardTab([{ id: 'main' }], 'missing', 'main'), 'main');
  assert.equal(resolveDashboardTab([{ id: 'skills' }], 'missing'), 'skills');
  assert.equal(resolveDashboardTab([], 'missing'), '');
});

test('keeps valid GM roster selection without switching characters', () => {
  const roster = { a: { id: 'a' }, b: { id: 'b' } };
  assert.equal(resolveRosterSelection(roster, 'b'), 'b');
});

test('recovers GM selection when the selected character is removed', () => {
  const roster = { a: { id: 'a' }, c: { id: 'c' } };
  assert.equal(resolveRosterSelection(roster, 'b'), 'a');
  assert.equal(resolveRosterSelection(roster, ''), 'a');
  assert.equal(resolveRosterSelection({ a: null, c: { id: 'c' } }, 'a'), 'c');
  assert.equal(resolveRosterSelection({}, 'missing'), '');
});
