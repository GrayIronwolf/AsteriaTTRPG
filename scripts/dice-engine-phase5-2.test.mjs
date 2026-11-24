import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { OrthographicCamera, Vector3 } from 'three';
import {
  createDiceGesture, sampleDiceGesture, releaseDiceGesture, trayPointerRay, projectTrayPoint
} from '../src/dice/diceTrayInteraction.mjs';
import { diceAtRest, trackDiceRest, applyHandLaunch, handRollGroup } from '../src/dice/diceTrayPhysics.mjs';
import { trayOutline, verifyTrayContainment } from '../src/dice/diceTrayGeometry.mjs';
import { defaultDiceTrayAppearance } from '../src/dice/diceTrayCatalogue.mjs';

const sample = (x, time, z = 0) => ({ x, y: 0, time, point: { x: x / 25, z } });
const gesture = (...samples) => {
  const motion = createDiceGesture(samples[0]);
  for (const value of samples.slice(1)) sampleDiceGesture(motion, value);
  return motion;
};

test('orthographic tray projection follows zoom, pan, orbit and the canvas bounds', () => {
  const camera = new OrthographicCamera(-9, 9, 9, -9, 1, 100);
  camera.position.set(9, 22, 14);
  camera.up.set(0, 0, -1);
  camera.lookAt(2, 0, -3);
  camera.zoom = 1.65;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const bounds = { left: 137, top: 41, width: 608, height: 502 };
  const position = new Vector3(1.2, .7, -1.4);
  const ndc = position.clone().project(camera);
  const pointer = {
    clientX: bounds.left + (ndc.x + 1) * bounds.width / 2,
    clientY: bounds.top + (1 - ndc.y) * bounds.height / 2
  };
  const point = projectTrayPoint(trayPointerRay(camera, bounds, pointer), position.y);
  assert.ok(Math.abs(point.x - position.x) < 1e-6);
  assert.ok(Math.abs(point.z - position.z) < 1e-6);
});

test('tap, hold, slow placement and a flick after a long hold are distinct', () => {
  assert.equal(releaseDiceGesture(gesture(sample(0, 0), sample(1, 70))).kind, 'tap');
  assert.equal(releaseDiceGesture(gesture(sample(0, 0), sample(1, 800))).kind, 'place');
  assert.equal(releaseDiceGesture(gesture(sample(0, 0), sample(20, 120), sample(35, 240))).kind, 'place');
  const flick = releaseDiceGesture(gesture(sample(0, 0), sample(0, 990),
    sample(55, 1020, -1.5), sample(95, 1050, -2.1)));
  assert.equal(flick.kind, 'throw');
  assert.ok(flick.vx > 0 && flick.vz < 0);
  assert.ok(Math.hypot(flick.vx, flick.vz) <= 28);
  const singleMove = releaseDiceGesture(gesture(sample(0, 0), sample(0, 990),
    sample(55, 1020), sample(55, 1030)));
  assert.equal(singleMove.kind, 'throw');
  assert.ok(singleMove.vx > 0);
  assert.equal(releaseDiceGesture(gesture(sample(0, 0),
    sample(80, 1020), sample(80, 1030))).kind, 'throw');
  assert.equal(releaseDiceGesture(gesture(sample(0, 0), sample(80, 32), sample(80, 170))).kind, 'place');
});

test('a drag back to the pickup point is never misclassified as a tap', () => {
  const stopped = gesture(sample(0, 0), sample(100, 60), sample(0, 110), sample(0, 260));
  assert.equal(releaseDiceGesture(stopped).kind, 'place');
  const reversed = gesture(sample(0, 0), sample(100, 80), sample(95, 190), sample(20, 221));
  const result = releaseDiceGesture(reversed);
  assert.equal(result.kind, 'throw');
  assert.ok(result.vx < 0);
});

const makeDie = (position, type = 'd6', isFirst = true) => ({
  type, isFirst, body: new CANNON.Body({
    mass: 1, shape: new CANNON.Box(new CANNON.Vec3(.5, .5, .5)),
    position: new CANNON.Vec3(...position), linearDamping: .1, angularDamping: .1
  })
});

test('throw starts at the hand with directional velocity and spin and collides with dice and the rim', () => {
  const thrown = makeDie([-3, .8, 0]);
  const other = makeDie([-.7, .5, 0]);
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -50, 0) });
  const floor = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  const wall = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(.05, 3, 0),
    shape: new CANNON.Box(new CANNON.Vec3(.17, 3.25, 5)) });
  for (const body of [floor, wall, other.body, thrown.body]) world.addBody(body);
  const outline = trayOutline(defaultDiceTrayAppearance('knights-iron'), { width: 500, height: 500 });
  const launch = { position: { x: -3, y: .8, z: 0 }, quaternion: new CANNON.Quaternion(),
    vx: 16, vz: 0, grabbedIsFirst: true };
  applyHandLaunch(thrown, launch, outline);
  assert.equal(thrown.body.position.x, -3);
  assert.equal(thrown.body.velocity.x, 16);
  assert.ok(thrown.body.angularVelocity.z < 0);
  let hitDie = false, hitWall = false;
  thrown.body.addEventListener('collide', event => { if (event.body === other.body) hitDie = true; });
  other.body.addEventListener('collide', event => { if (event.body === wall) hitWall = true; });
  for (let i = 0; i < 240; i++) world.step(1 / 60);
  assert.ok(hitDie);
  assert.ok(hitWall);
  assert.ok(thrown.body.position.x < .05 && other.body.position.x < .05);
});

test('percentile halves form one roll and do not overlap at a corner launch', () => {
  const ones = makeDie([0, 0, 0], 'd100');
  const tens = makeDie([0, 0, 0], 'd100', false);
  const other = makeDie([0, 0, 0]);
  assert.deepEqual(handRollGroup([other, ones, tens], tens), [ones, tens]);
  assert.deepEqual(handRollGroup([other, ones, tens], other), [other]);
  const outline = trayOutline(defaultDiceTrayAppearance());
  const launch = { position: { x: outline.halfX, y: 1, z: 0 }, quaternion: new CANNON.Quaternion(),
    vx: 15, vz: 0, grabbedIsFirst: false };
  for (const item of [ones, tens]) {
    applyHandLaunch(item, launch, outline);
    assert.ok(verifyTrayContainment(outline, item.body.position,
      item.body.boundingRadius + outline.thickness / 2 - .001));
  }
  assert.ok(ones.body.position.distanceTo(tens.body.position) >
    ones.body.boundingRadius + tens.body.boundingRadius);
});

test('settling requires support and sustained quiet physics steps after replay', async () => {
  const world = new CANNON.World();
  const die = makeDie([0, 1, 0]);
  world.addBody(die.body);
  const floor = new CANNON.Body({ mass: 0 });
  const contacts = [{ bi: floor, bj: die.body, ni: { y: 1 }, enabled: true }];
  assert.equal(diceAtRest(world, [die], []), false);
  die.body.sleep();
  assert.equal(diceAtRest(world, [die], []), false);
  die.body.wakeUp();
  assert.equal(diceAtRest(world, [die], contacts), true);
  die.body.angularVelocity.set(0, .3, 0);
  assert.equal(diceAtRest(world, [die], contacts), false);
  die.body.angularVelocity.setZero();
  const engine = { world, dice: [die], _replay: {}, _animationHolds: 0 };
  world.contacts = contacts;
  const controller = new AbortController();
  const rest = trackDiceRest(engine, 1, controller.signal);
  for (let i = 0; i < 20; i++) world.dispatchEvent({ type: 'postStep' });
  assert.equal(engine._animationHolds, 1);
  engine._replay = null;
  for (let i = 0; i < 4; i++) world.dispatchEvent({ type: 'postStep' });
  die.body.velocity.set(0, .25, 0);
  world.dispatchEvent({ type: 'postStep' });
  die.body.velocity.setZero();
  for (let i = 0; i < 7; i++) world.dispatchEvent({ type: 'postStep' });
  assert.equal(engine._animationHolds, 1);
  world.dispatchEvent({ type: 'postStep' });
  assert.equal(await rest, true);
  assert.equal(engine._animationHolds, 0);
  world.contacts = [];
  const cocked = trackDiceRest(engine, 1, controller.signal);
  for (let i = 0; i < 240; i++) world.dispatchEvent({ type: 'postStep' });
  assert.equal(await cocked, false);
  assert.equal(engine._animationHolds, 0);
  const interrupted = trackDiceRest(engine, 1, controller.signal);
  controller.abort();
  assert.equal(await interrupted, false);
  assert.equal(engine._animationHolds, 0);
});
