import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const scene = page => page.locator('.asteria-advanced-dice-scene');
const tray = page => page.getByRole('region', { name: '3D dice tray' });
const result = page => page.locator('[data-result-visible="true"]');
const rollAll = page => page.getByRole('button', { name: 'Roll All', exact: true });
const waitForMode = (page, mode) => scene(page).and(page.locator(`[data-pointer-mode="${mode}"]`))
  .waitFor({ timeout: 5000 }).catch(async error => {
    throw Error(error.message + '\nRecent pointer events: ' +
      JSON.stringify(await page.evaluate(() => window.phase52.input)));
  });
const requireSettled = async (page, total) => {
  await result(page).waitFor({ timeout: 22000 });
  assert.equal(await tray(page).getAttribute('data-roll-state'), 'settled',
    (await page.locator('.asteria-dice-window-messages').allTextContents()).join(' '));
  assert.equal(await result(page).locator('strong').textContent(), String(total));
  assert.equal(await scene(page).getAttribute('data-visual-face-match'), 'true');
};
const state = page => page.evaluate(() => {
  const { engine, recordings, completions, requests } = window.phase52;
  return {
    zoom: engine.camera.zoom, camera: engine.camera.position.toArray(),
    dice: engine.dice.map(({ body, mesh, type }) => ({
      id: body.id, type, position: body.position.toArray(), rotation: body.quaternion.toArray(),
      watcher: mesh.children.some(child => child.name === 'asteria-watcher-visual-eye')
    })), recordings, completions, requests
  };
});

function diePoint(page, index = 0) {
  return page.evaluate(index => {
    const { engine } = window.phase52;
    const rect = engine.renderer.domElement.getBoundingClientRect();
    const screen = engine.dice[index].mesh.position.clone().project(engine.camera);
    return {
      x: Math.round(rect.left + (screen.x + 1) * rect.width / 2),
      y: Math.round(rect.top + (1 - screen.y) * rect.height / 2)
    };
  }, index);
}
const hideResult = page => result(page).getByRole('button', { name: 'Hide result overlay' }).click();

test('Phase 5.2 Chromium acceptance', { timeout: 180000 }, async t => {
  const server = await createServer({
    root: path.join(process.cwd(), 'scripts', 'dice-prototype'),
    configFile: false, server: { host: '127.0.0.1', port: 0 }, logLevel: 'warn'
  });
  await server.listen();
  t.after(() => server.close());
  const browser = await chromium.launch({
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ?
      { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : { channel: 'chrome' }),
    headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox']
  });
  t.after(() => browser.close());
  const url = 'http://127.0.0.1:' + server.httpServer.address().port + '/phase4.html?physical';

  const open = async (options = {}) => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 850 }, ...options });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('asteria:dice:presentation:v1', JSON.stringify({
        version: 1, graphics: 'performance', effects: 'off', criticalEffects: 'off',
        element: 'none', soundPack: 'auto', volume: 'medium', muted: true, reducedMotion: 'off'
      }));
    });
    await page.goto(url);
    await tray(page).and(page.locator('[data-roll-state="ready"]')).waitFor();
    return { page, errors };
  };

  await t.test('mouse grab, camera isolation, drag, directional throw, private history and replay', async () => {
    const { page, errors } = await open();
    try {
      await page.getByRole('button', { name: 'Open dice selection' }).click();
      await page.getByRole('button', { name: 'Add d6' }).click();
      await page.getByRole('button', { name: 'Close dice selection' }).click();
      await rollAll(page).click();
      await page.locator('[data-roll-phase="requesting"]').waitFor();
      assert.equal(await result(page).count(), 0);
      await page.locator('[data-roll-phase="animating"]').waitFor();
      assert.ok(await rollAll(page).isDisabled());
      await page.getByRole('button', { name: 'Open roll history' }).click();
      assert.equal(await page.locator('.asteria-dice-window-history-list li').count(), 0);
      await page.getByRole('button', { name: 'Close roll history' }).click();
      await requireSettled(page, 20);
      assert.deepEqual((await state(page)).completions.map(row => row.resultVisible), [false]);
      await hideResult(page);

      const initial = await state(page);
      let point = await diePoint(page);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await waitForMode(page, 'die');
      assert.ok((await state(page)).dice[0].position[1] > initial.dice[0].position[1] + .3);
      await page.mouse.wheel(0, -100);
      await scene(page).dispatchEvent('lostpointercapture', { pointerId: 800, pointerType: 'touch' });
      await page.waitForTimeout(330);
      assert.equal((await state(page)).zoom, initial.zoom);
      await page.mouse.up();
      await waitForMode(page, 'idle');
      assert.deepEqual((await state(page)).dice, initial.dice);
      assert.equal((await state(page)).requests.length, 1);

      await page.mouse.down();
      await waitForMode(page, 'die');
      await page.mouse.down({ button: 'right' });
      await page.mouse.up();
      await page.mouse.move(point.x + 64, point.y);
      await page.mouse.up({ button: 'right' });
      await waitForMode(page, 'idle');
      assert.deepEqual((await state(page)).dice, initial.dice);
      assert.equal((await state(page)).requests.length, 1);
      await page.mouse.move(point.x, point.y);

      await page.mouse.down({ button: 'right' });
      await page.mouse.move(point.x + 45, point.y);
      await page.mouse.up({ button: 'right' });
      await waitForMode(page, 'idle');
      // Camera transforms are applied by a React effect after the input event.
      // Wait for that observable result rather than sampling the previous frame.
      await page.waitForFunction(before => window.phase52.engine.camera.position.toArray()
        .some((value, index) => value !== before[index]), initial.camera);
      const orbited = await state(page);
      assert.notDeepEqual(orbited.camera, initial.camera);
      assert.deepEqual(orbited.dice, initial.dice);
      await page.mouse.down({ button: 'middle' });
      await waitForMode(page, 'camera');
      await page.mouse.move(point.x + 30, point.y + 34);
      await page.mouse.up({ button: 'middle' });
      await waitForMode(page, 'idle');
      await page.waitForFunction(before => window.phase52.engine.camera.position.toArray()
        .some((value, index) => value !== before[index]), orbited.camera);
      const panned = await state(page);
      assert.notDeepEqual(panned.camera, orbited.camera);
      assert.deepEqual(panned.dice, orbited.dice);
      await page.mouse.wheel(0, -100);
      await page.waitForFunction(zoom => window.phase52.engine.camera.zoom > zoom, initial.zoom);
      point = await diePoint(page);
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
      await waitForMode(page, 'die');
      const direction = point.x > 690 ? -1 : 1;
      await page.mouse.move(point.x + direction * 75, point.y + 30, { steps: 3 });
      await page.waitForTimeout(150);
      await page.mouse.up();
      await waitForMode(page, 'idle');
      const placed = await state(page);
      assert.ok(Math.abs(placed.dice[0].position[0] - initial.dice[0].position[0]) > .5);
      assert.deepEqual(placed.camera, panned.camera);
      assert.equal(placed.requests.length, 1);

      await page.getByRole('button', { name: 'Open dice customisation settings' }).click();
      await page.getByRole('combobox', { name: 'Core dice design' }).selectOption('dice-watcher');
      await page.getByRole('button', { name: 'Close customisation settings' }).click();
      await page.getByRole('button', { name: 'Reset tray camera' }).click();
      point = await diePoint(page);
      const sign = point.x > 650 ? -1 : 1;
      const session = await page.context().newCDPSession(page);
      const mouse = event => session.send('Input.dispatchMouseEvent', event);
      await mouse({ type: 'mouseMoved', ...point, buttons: 0 });
      await mouse({ type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
      await waitForMode(page, 'die');
      await page.waitForTimeout(380);
      const timestamp = Date.now() / 1000;
      for (const [dx, dy, elapsed] of [[35, 5, 0], [100, 12, .02], [150, 15, .04]]) {
        await mouse({
          type: 'mouseMoved', x: point.x + sign * dx, y: point.y + dy, button: 'left', buttons: 1,
          timestamp: timestamp + elapsed
        });
      }
      const held = (await state(page)).dice[0].position;
      await mouse({
        type: 'mouseReleased', x: point.x + sign * 150, y: point.y + 15,
        button: 'left', buttons: 0, clickCount: 1, timestamp: timestamp + .05
      });
      await page.waitForFunction(() => window.phase52.requests.length === 2, undefined, { timeout: 4000 })
        .catch(async error => {
          throw Error(error.message + '\nRecent pointer events: ' +
            JSON.stringify(await page.evaluate(() => window.phase52.input)));
        });
      await requireSettled(page, 17);
      const after = await state(page);
      assert.deepEqual(after.requests[1], [{ count: 1, sides: 20 }]);
      assert.equal(after.dice[0].id, initial.dice[1].id, 'Other dice stay on the table');
      assert.deepEqual(after.dice.map(die => die.watcher), [false, true]);
      const recording = after.recordings.at(-1);
      assert.equal(recording.ids.length, 2);
      assert.ok(recording.impacts > 0);
      const launch = recording.first.at(-1);
      assert.ok(Math.abs(launch[0] - held[0]) < 4);
      assert.ok(sign * launch[7] > 1 && sign * launch[12] < -1);
      assert.ok(Math.hypot(...recording.last.at(-1).slice(7, 10)) < .1);
      assert.ok(after.completions.every(item => !item.resultVisible));

      await page.getByRole('button', { name: 'Open roll history' }).click();
      assert.equal(await page.locator('.asteria-dice-window-history-list li').count(), 2);
      await page.locator('.asteria-dice-window-history-list li').last()
        .getByRole('button', { name: 'Replay' }).click();
      assert.equal(await result(page).count(), 0);
      await requireSettled(page, 20);
      assert.equal((await state(page)).requests.length, 2);
      await page.getByRole('button', { name: 'Close roll history' }).click();
      await page.getByRole('button', { name: 'Clear tray' }).click();
      await page.getByRole('button', { name: 'Replay', exact: true }).click();
      await requireSettled(page, 17);
      assert.equal((await state(page)).recordings.at(-1).ids.length, 1);
      assert.equal((await state(page)).requests.length, 2);
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  });

  await t.test('touch tap, held die to pinch, and release outside with pointer capture', async () => {
    const { page, errors } = await open({ viewport: { width: 440, height: 820 }, hasTouch: true, isMobile: true });
    try {
      await rollAll(page).click();
      await requireSettled(page, 17);
      await hideResult(page);
      let point = await diePoint(page);
      await page.touchscreen.tap(point.x, point.y);
      await page.waitForFunction(() => window.phase52.requests.length === 2);
      await requireSettled(page, 17);
      await hideResult(page);

      const session = await page.context().newCDPSession(page);
      const touch = (type, touchPoints) => session.send('Input.dispatchTouchEvent', { type, touchPoints });
      const initial = await state(page);
      point = await diePoint(page);
      const first = { ...point, id: 0 };
      const direction = point.x > 220 ? -1 : 1;
      const second = { x: point.x + direction * 45, y: point.y + 10, id: 1 };
      await touch('touchStart', [first]);
      await waitForMode(page, 'die');
      await touch('touchStart', [first, second]);
      await waitForMode(page, 'pinch');
      assert.deepEqual((await state(page)).dice, initial.dice);
      await touch('touchMove', [first, { ...second, x: second.x + direction * 45 }]);
      await page.waitForFunction(zoom => window.phase52.engine.camera.zoom > zoom, initial.zoom);
      await touch('touchEnd', []);
      await waitForMode(page, 'idle');
      assert.equal((await state(page)).requests.length, 2);

      await page.getByRole('button', { name: 'Reset tray camera' }).click();
      point = await diePoint(page);
      await touch('touchStart', [{ ...point, id: 0 }]);
      await waitForMode(page, 'die');
      await touch('touchMove', [{ x: point.x + direction * 32, y: point.y + 20, id: 0 }]);
      await touch('touchCancel', []);
      await waitForMode(page, 'idle');
      assert.deepEqual((await state(page)).dice, initial.dice);
      assert.equal((await state(page)).requests.length, 2);

      await touch('touchStart', [{ ...point, id: 0 }]);
      await waitForMode(page, 'die');
      const bounds = await scene(page).boundingBox();
      await touch('touchMove', [{ x: 1, y: Math.round(bounds.y + bounds.height - 20), id: 0 }]);
      await page.waitForTimeout(170);
      await touch('touchEnd', []);
      await waitForMode(page, 'idle');
      const placed = await state(page);
      assert.notDeepEqual(placed.dice, initial.dice);
      assert.equal(placed.requests.length, 2);

      point = await diePoint(page);
      const flickDirection = point.x > 220 ? -1 : 1;
      await touch('touchStart', [{ ...point, id: 0 }]);
      await waitForMode(page, 'die');
      const timestamp = Date.now() / 1000;
      for (const [dx, elapsed] of [[15, 0], [60, .025], [110, .05]]) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: point.x + flickDirection * dx, y: point.y - 6, id: 0 }],
          timestamp: timestamp + elapsed
        });
      }
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchEnd', touchPoints: [], timestamp: timestamp + .06
      });
      await page.waitForFunction(() => window.phase52.requests.length === 3, undefined, { timeout: 4000 });
      await requireSettled(page, 17);
      const thrown = await state(page);
      assert.ok(flickDirection * thrown.recordings.at(-1).first[0][7] > 1);
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  });

  await t.test('reduced motion falls back on each roll and replay with the same verified result', async () => {
    const { page, errors } = await open();
    try {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      // Explicit device preferences can opt out of the system setting.
      await page.getByRole('button', { name: 'Open dice customisation settings' }).click();
      await page.getByRole('tab', { name: 'Effects & performance' }).click();
      await page.getByRole('checkbox', { name: 'Enable 3D animation' }).uncheck();
      await page.getByRole('button', { name: 'Close customisation settings' }).click();
      await rollAll(page).click();
      await result(page).waitFor({ timeout: 3000 });
      assert.equal(await tray(page).getAttribute('data-roll-state'), 'paused');
      assert.equal(await result(page).locator('strong').textContent(), '17');
      await page.getByRole('button', { name: 'Replay', exact: true }).click();
      await result(page).waitFor({ timeout: 3000 });
      assert.equal(await result(page).locator('strong').textContent(), '17');
      assert.equal(await page.evaluate(() => window.phase52.requests.length), 1);
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  });

  await t.test('a timed-out asset load cannot start a stale visual roll', async () => {
    const { page, errors } = await open();
    try {
      await page.clock.install();
      await page.evaluate(() => {
        const { engine } = window.phase52;
        const loadSets = engine._ensureSetAssets.bind(engine);
        engine._ensureSetAssets = () => new Promise(resolve => {
          window.phase52.finishAssetLoad = () => resolve(loadSets());
        });
      });
      await rollAll(page).click();
      await page.waitForFunction(() => Boolean(window.phase52.finishAssetLoad));
      assert.equal(await result(page).count(), 0);
      await page.clock.fastForward(21000);
      await result(page).waitFor();
      assert.equal(await result(page).locator('strong').textContent(), '17');
      await page.evaluate(() => window.phase52.finishAssetLoad());
      await page.waitForFunction(() => window.phase52.engine._pendingSetRolls === 0);
      const timedOut = await state(page);
      assert.deepEqual(timedOut.dice, []);
      assert.deepEqual(timedOut.recordings, []);
      assert.equal(timedOut.requests.length, 1);
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  });
});
