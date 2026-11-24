import { Body } from 'cannon-es';
import { fitDieInsideTray } from './diceTrayInteraction.mjs';

const LIFT = .48;
const REST_STEPS = 8;
const MAX_SETTLING_STEPS = 240;
const REST_SPEED_SQUARED = .01;

function placeBody(die, position) {
  die.body.position.copy(position);
  die.body.aabbNeedsUpdate = true;
  die.mesh.position.copy(position);
  die.mesh.updateMatrixWorld();
}

export function holdTrayDie(die) {
  const { body } = die;
  body.updateAABB();
  const origin = body.position.clone();
  const placement = origin.clone();
  const floorHeight = origin.y - body.aabb.lowerBound.y + .01;
  const type = body.type;
  body.type = Body.KINEMATIC;
  body.velocity.setZero();
  body.angularVelocity.setZero();
  body.position.y += LIFT;
  placeBody(die, body.position);
  return { die, origin, placement, floorHeight, type, moved: false };
}

export function moveHeldDie(hold, point, obstacles) {
  const { die, placement, floorHeight } = hold;
  const { body } = die;
  const previous = body.position.clone();
  body.position.set(point.x, floorHeight, point.z);
  body.updateAABB();
  const blocked = obstacles.some(other => {
    if (other === body) return false;
    if (other.aabbNeedsUpdate) other.updateAABB();
    return body.aabb.overlaps(other.aabb);
  });
  if (blocked) {
    body.position.copy(previous);
    body.aabbNeedsUpdate = true;
    return;
  }
  placement.copy(body.position);
  hold.moved = true;
  body.position.y += LIFT;
  placeBody(die, body.position);
}

export function releaseHeldDie(hold, cancel) {
  if (!hold) return;
  const { die, type, origin, placement } = hold;
  die.body.type = type;
  placeBody(die, cancel ? origin : placement);
}

export function handRollGroup(dice, grabbed) {
  const index = dice.indexOf(grabbed);
  if (index < 0) return [];
  if (grabbed.type !== 'd100') return [grabbed];
  const start = grabbed.isFirst ? index : index - 1;
  const pair = dice.slice(Math.max(0, start), start + 2);
  return pair.length === 2 && pair.every(die => die.type === 'd100') &&
    pair[0].isFirst && !pair[1].isFirst ? pair : [grabbed];
}

export function applyHandLaunch(die, launch, outline) {
  const { body, mesh } = die;
  const { position, quaternion, vx, vz, grabbedIsFirst } = launch;
  const speed = Math.hypot(vx, vz);
  const margin = body.boundingRadius + outline.thickness / 2 + .015;
  // The other percentile half starts alongside the selected one, with enough
  // vertical separation to stay distinct if the rim clamps both to a corner.
  const companion = die.type === 'd100' && die.isFirst !== grabbedIsFirst;
  const offset = companion && speed ? body.boundingRadius * 1.4 / speed : 0;
  const start = fitDieInsideTray({
    x: position.x - vz * offset, z: position.z + vx * offset
  }, outline, margin) || position;
  body.position.set(start.x, position.y + (companion ? body.boundingRadius * 2.1 : 0), start.z);
  body.quaternion.copy(quaternion);
  body.updateInertiaWorld(true);
  body.velocity.set(vx, Math.min(3, .5 + speed * .09), vz);
  const spin = Math.min(24, speed / Math.max(.4, body.boundingRadius));
  const spinScale = speed ? spin / speed : 0;
  body.angularVelocity.set(vz * spinScale, spin * (companion ? -.18 : .18), -vx * spinScale);
  body.aabbNeedsUpdate = true;
  mesh?.position.copy(body.position);
  mesh?.quaternion.copy(body.quaternion);
}

export function diceAtRest(world, dice, contacts = world.contacts) {
  if (!dice.length) return false;
  const supported = new Set();
  for (const { bi, bj, ni, enabled } of contacts) {
    if (!enabled) continue;
    if (ni.y > .35) supported.add(bj);
    else if (ni.y < -.35) supported.add(bi);
  }
  return dice.every(({ body }) => body.world === world && body.type === Body.DYNAMIC &&
    body.velocity.lengthSquared() < REST_SPEED_SQUARED &&
    body.angularVelocity.lengthSquared() < REST_SPEED_SQUARED &&
    supported.has(body));
}

export function trackDiceRest(engine, expectedCount, signal) {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    let quietSteps = 0;
    let liveSteps = 0;
    let complete = false;
    const finish = settled => {
      if (complete) return;
      complete = true;
      engine.world.removeEventListener('postStep', step);
      signal.removeEventListener('abort', cancel);
      engine._animationHolds--;
      resolve(settled);
    };
    const cancel = () => finish(false);
    const step = () => {
      if (engine._replay || engine.dice.length !== expectedCount) {
        quietSteps = 0;
        return;
      }
      liveSteps++;
      quietSteps = !engine.isRolling?.() && diceAtRest(engine.world, engine.dice) ? quietSteps + 1 : 0;
      // A cocked or continuously rocking result must leave time for a tower retry.
      if (quietSteps === REST_STEPS || liveSteps === MAX_SETTLING_STEPS) {
        queueMicrotask(() => {
          if (quietSteps >= REST_STEPS || liveSteps >= MAX_SETTLING_STEPS) {
            finish(quietSteps >= REST_STEPS);
          }
        });
      }
    };
    // Open Dice can resolve after one slow step and idle immediately. Keep
    // its own loop stepping until we have an actual sustained resting pose.
    engine._animationHolds++;
    engine.world.addEventListener('postStep', step);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

export function cancelPendingDiceRoll(engine) {
  // Open Dice's reset fences predictions. An earlier roll can still be
  // waiting for its materials, so invalidate that generation as well.
  engine._tableEpoch++;
  engine._rollGeneration++;
}

export function startHandRoll(engine, diceToRoll, hand, outline, tower, signal) {
  const removed = handRollGroup(engine.dice, hand.die);
  const retained = engine.dice.filter(die => !removed.includes(die));
  const resumeTower = tower?.suspendGuidance();
  const applyBefore = engine._applyDiePhysics;
  const predictBefore = engine._predict;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal.removeEventListener('abort', dispose);
    engine._applyDiePhysics = applyBefore;
    engine._predict = predictBefore;
    resumeTower?.();
  };
  signal.addEventListener('abort', dispose, { once: true });

  engine._applyDiePhysics = die => applyHandLaunch(die, hand, outline);
  engine._predict = async function (config) {
    const prediction = await predictBefore.call(this, config);
    if (!prediction.live || signal.aborted) return prediction;
    // 1.13 predicts impacts with existing dice but normally resimulates
    // them live. Replay the recording for both the new and retained bodies
    // so the same collisions determine the face shown and the motion seen.
    const byBody = new Map(retained.map(die => [die.body, die]));
    return { ...prediction, live: false, recorded: prediction.onTable.map(body => byBody.get(body)) };
  };

  // Retire the selected die (or both percentile halves) using the engine's
  // regular texture and batch cleanup. Other dice remain in the real world.
  engine.dice.length = 0;
  engine.dice.push(...removed);
  try {
    const completion = engine.roll(diceToRoll);
    return {
      completion, retainedCount: retained.length, dispose,
      results: () => engine._computeBatchResults(engine.dice.slice(retained.length))
    };
  } catch (error) {
    dispose();
    throw error;
  } finally {
    engine.dice.push(...retained);
  }
}
