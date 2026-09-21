import { Elevator } from './Elevator.js';
import { NearestCarStrategy } from './DispatchStrategy.js';

/** Owns the elevators, validates requests, dispatches hall calls and drives the clock. */
export class Building {
  #elevators;
  #strategy;
  #listeners = new Set();
  #log;

  constructor({ floors = 10, elevatorCount = 3, strategy = new NearestCarStrategy(), log = () => {} } = {}) {
    this.floors = floors;
    this.#log = log;
    this.#strategy = strategy;
    this.#elevators = Array.from({ length: elevatorCount }, (_, i) => new Elevator(i + 1));
  }

  /**
   * Hall button ↑/↓ on a floor. With an elevatorId it calls that elevator (each car has its
   * own buttons); without one, the strategy picks the car.
   */
  call(floor, dir, elevatorId) {
    this.#checkFloor(floor);
    if (dir !== 'up' && dir !== 'down') throw new RangeError('direction must be "up" or "down"');
    if ((dir === 'up' && floor === this.floors) || (dir === 'down' && floor === 1)) {
      throw new RangeError(`no "${dir}" button on floor ${floor}`);
    }
    const auto = elevatorId == null;
    const scope = auto ? this.#elevators : [this.#elevator(elevatorId)];
    if (scope.some((e) => e.hasHallCall(floor, dir))) return; // already pending
    const target = auto ? this.#strategy.choose(this.#elevators, floor, dir) : scope[0];
    target.addHallCall(floor, dir);
    this.#log(`call floor ${floor} ${dir} -> E${target.id}${auto ? ' (dispatched)' : ''}`);
    this.#emit();
  }

  /** Destination button pressed inside an elevator. */
  select(elevatorId, floor) {
    this.#checkFloor(floor);
    this.#elevator(elevatorId).addCarCall(floor);
    this.#log(`E${elevatorId} destination ${floor}`);
    this.#emit();
  }

  /** Door buttons at a floor only act on the elevator currently standing there. */
  door(elevatorId, floor, action) {
    const e = this.#elevator(elevatorId);
    if (action !== 'hold' && action !== 'close') throw new RangeError('action must be "hold" or "close"');
    if (e.floor !== floor) return;
    if (action === 'hold') e.holdDoor();
    else e.closeDoor();
    this.#log(`E${elevatorId} door ${action} at floor ${floor}`);
    this.#emit();
  }

  tick() {
    const before = this.#elevators.map((e) => ({ floor: e.floor, door: e.door.state }));
    this.#elevators.forEach((e) => e.tick());
    this.#elevators.forEach((e, i) => {
      if (e.floor !== before[i].floor) this.#log(`E${e.id} moved ${before[i].floor} -> ${e.floor} (${e.direction})`);
      if (e.door.state !== before[i].door) this.#log(`E${e.id} door ${e.door.state} at floor ${e.floor}`);
    });
    this.#emit();
  }

  start(ms) {
    return setInterval(() => this.tick(), ms);
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  snapshot() {
    return { floors: this.floors, elevators: this.#elevators.map((e) => e.toJSON()) };
  }

  #emit() {
    if (!this.#listeners.size) return;
    const s = this.snapshot();
    this.#listeners.forEach((fn) => fn(s));
  }

  #checkFloor(floor) {
    if (!Number.isInteger(floor) || floor < 1 || floor > this.floors) {
      throw new RangeError(`floor must be an integer 1..${this.floors}`);
    }
  }

  #elevator(id) {
    const e = this.#elevators.find((x) => x.id === id);
    if (!e) throw new RangeError(`unknown elevator ${id}`);
    return e;
  }
}
