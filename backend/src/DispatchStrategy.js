/** Base class: decides which elevator answers a hall call. Subclasses override choose(). */
export class DispatchStrategy {
  choose(elevators, floor, dir) {
    throw new Error(`${this.constructor.name}.choose() not implemented`);
  }

  /** Lowest-scoring elevator wins; first one on ties. */
  _best(elevators, score) {
    return elevators.reduce((best, e) => (score(e) < score(best) ? e : best));
  }
}

/** Minimise the passenger's wait: fewest ticks until the car actually serves the call. */
export class NearestCarStrategy extends DispatchStrategy {
  choose(elevators, floor, dir) {
    return this._best(elevators, (e) => e.eta(floor, dir));
  }
}

/** Balance work: the car with the fewest pending stops. */
export class LeastLoadedStrategy extends DispatchStrategy {
  choose(elevators) {
    return this._best(elevators, (e) => e.load);
  }
}

export const strategies = {
  nearest: NearestCarStrategy,
  'least-loaded': LeastLoadedStrategy,
};
