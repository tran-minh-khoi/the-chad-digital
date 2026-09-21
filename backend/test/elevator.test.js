import test from 'node:test';
import assert from 'node:assert/strict';
import { Elevator } from '../src/Elevator.js';
import { Building } from '../src/Building.js';
import { NearestCarStrategy, LeastLoadedStrategy } from '../src/DispatchStrategy.js';

/** Tick until pred() holds; returns the floors where the door started opening, in order. */
function run(e, pred, max = 200) {
  const stops = [];
  for (let i = 0; i < max && !pred(); i++) {
    e.tick();
    if (e.door.state === 'opening') stops.push(e.floor);
  }
  assert.ok(pred(), 'condition not reached');
  return stops;
}
const settled = (e) => e.direction === 'idle' && e.door.isClosed;

// Spec example: on floor 5, elevator going up from 1 to 10.
test('going up: ↑ on floor 5 stops the elevator', () => {
  const e = new Elevator(1);
  e.addCarCall(10);
  run(e, () => e.floor === 4);
  e.addHallCall(5, 'up');
  assert.deepEqual(run(e, () => settled(e) && e.floor === 10), [5, 10]);
});

test('going up: ↓ on floor 5 is skipped, picked up on the way back down', () => {
  const e = new Elevator(1);
  e.addCarCall(10);
  run(e, () => e.floor === 4);
  e.addHallCall(5, 'down');
  assert.deepEqual(run(e, () => settled(e) && e.floor === 5), [10, 5]);
});

test('door: hold keeps it open, close shuts it immediately', () => {
  const e = new Elevator(1);
  e.addCarCall(1);
  e.holdDoor();
  for (let i = 0; i < 20; i++) e.tick();
  assert.equal(e.door.state, 'open');
  e.closeDoor();
  assert.equal(e.door.state, 'closing');
  e.tick();
  assert.equal(e.door.state, 'closed');
});

test('strategies are interchangeable', () => {
  const [a, b] = [new Elevator(1, 1), new Elevator(2, 9)];
  assert.equal(new NearestCarStrategy().choose([a, b], 8, 'up'), b);
  a.addCarCall(5);
  a.addCarCall(6);
  assert.equal(new LeastLoadedStrategy().choose([a, b]), b);
});

test('building validates input and dedupes hall calls', () => {
  const b = new Building();
  assert.throws(() => b.call(10, 'up'), RangeError);
  assert.throws(() => b.call(1, 'down'), RangeError);
  assert.throws(() => b.select(9, 3), RangeError);
  b.call(5, 'up');
  b.call(5, 'up');
  const pending = b.snapshot().elevators.flatMap((e) => e.hallCalls.up);
  assert.deepEqual(pending, [5]);
});

test('hall button of a specific elevator calls only that elevator', () => {
  const b = new Building();
  b.call(7, 'down', 3);
  b.call(7, 'down', 3);
  const calls = b.snapshot().elevators.map((e) => e.hallCalls.down);
  assert.deepEqual(calls, [[], [], [7]]);
  assert.throws(() => b.call(7, 'down', 9), RangeError);
});
