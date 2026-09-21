import { Door } from './Door.js';

const opposite = (d) => (d === 'up' ? 'down' : 'up');

/**
 * One car. Owns its position, direction, door and pending stops (all private).
 * Rule: a moving car only stops for hall calls in its own direction, plus the
 * turning point (the last stop of its run) where it may reverse for the other one.
 */
export class Elevator {
  #floor;
  #direction = 'idle'; // 'up' | 'down' | 'idle'
  #door = new Door();
  #cars = new Set(); // destinations pressed inside the car
  #halls = { up: new Set(), down: new Set() }; // hall calls assigned to this car

  constructor(id, floor = 1) {
    this.id = id;
    this.#floor = floor;
  }

  get floor() { return this.#floor; }
  get direction() { return this.#direction; }
  get door() { return this.#door; }
  /** Pending stops; used by strategies as a load measure. */
  get load() { return this.#stops().length; }

  addCarCall(floor) { this.#cars.add(floor); }
  addHallCall(floor, dir) { this.#halls[dir].add(floor); }
  hasHallCall(floor, dir) { return this.#halls[dir].has(floor); }
  holdDoor() { this.#door.hold(); }
  closeDoor() { this.#door.close(); }

  /** Advance the simulation by one step (1 floor of travel or 1 door phase). */
  tick() {
    if (this.#stopsHere()) {
      this.#arrive();
      this.#door.open();
    } else if (this.#door.isClosed) {
      this.#move();
    } else {
      this.#door.tick();
    }
  }

  /** Ticks until this car would serve a hall call, found by simulating a copy. */
  eta(floor, dir) {
    const sim = this.clone();
    sim.addHallCall(floor, dir);
    for (let t = 1; t <= 200; t++) {
      sim.tick();
      if (!sim.hasHallCall(floor, dir)) return t;
    }
    return Infinity; // e.g. door held open forever
  }

  clone() {
    const e = new Elevator(this.id, this.#floor);
    e.#direction = this.#direction;
    e.#door = this.#door.clone();
    e.#cars = new Set(this.#cars);
    e.#halls = { up: new Set(this.#halls.up), down: new Set(this.#halls.down) };
    return e;
  }

  toJSON() {
    return {
      id: this.id,
      floor: this.#floor,
      direction: this.#direction,
      door: { state: this.#door.state, held: this.#door.held },
      carCalls: [...this.#cars],
      hallCalls: { up: [...this.#halls.up], down: [...this.#halls.down] },
    };
  }

  #stops() {
    return [...this.#cars, ...this.#halls.up, ...this.#halls.down];
  }

  #hasStopsBeyond(dir) {
    return this.#stops().some((s) => (dir === 'up' ? s > this.#floor : s < this.#floor));
  }

  #stopsHere() {
    const f = this.#floor;
    const d = this.#direction;
    if (this.#cars.has(f)) return true;
    if (d === 'idle') return this.#halls.up.has(f) || this.#halls.down.has(f);
    if (this.#halls[d].has(f)) return true;
    // turning point: end of the run, serve the opposite call and reverse
    return !this.#hasStopsBeyond(d) && this.#halls[opposite(d)].has(f);
  }

  /** Consume the stops served at this floor and set the direction shown to passengers. */
  #arrive() {
    const f = this.#floor;
    const d = this.#direction;
    this.#cars.delete(f);
    if (d === 'idle') {
      const next = this.#halls.up.has(f) ? 'up' : this.#halls.down.has(f) ? 'down' : 'idle';
      if (next !== 'idle') {
        this.#halls[next].delete(f);
        this.#direction = next;
      }
      return;
    }
    this.#halls[d].delete(f);
    if (!this.#hasStopsBeyond(d) && this.#halls[opposite(d)].has(f)) {
      this.#halls[opposite(d)].delete(f);
      this.#direction = opposite(d);
    }
  }

  #move() {
    this.#direction = this.#nextDirection();
    if (this.#direction === 'up') this.#floor++;
    else if (this.#direction === 'down') this.#floor--;
  }

  #nextDirection() {
    const f = this.#floor;
    const above = this.#stops().filter((s) => s > f);
    const below = this.#stops().filter((s) => s < f);
    if (this.#direction === 'up' && above.length) return 'up';
    if (this.#direction === 'down' && below.length) return 'down';
    if (!above.length) return below.length ? 'down' : 'idle';
    if (!below.length) return 'up';
    return Math.min(...above) - f <= f - Math.max(...below) ? 'up' : 'down';
  }
}
