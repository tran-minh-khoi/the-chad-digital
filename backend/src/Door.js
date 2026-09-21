// Encapsulated door state machine: closed -> opening -> open -> closing -> closed.
export class Door {
  static OPEN_TICKS = 3;

  #state = 'closed';
  #timer = 0;
  #held = false;

  get state() { return this.#state; }
  get held() { return this.#held; }
  get isClosed() { return this.#state === 'closed'; }

  /** Start opening, or restart the open timer if already open. */
  open() {
    if (this.#state === 'open') this.#timer = Door.OPEN_TICKS;
    else if (this.#state !== 'opening') this.#state = 'opening';
  }

  /** [◀▶] keep the door open until close() is pressed. */
  hold() {
    this.#held = true;
    this.open();
  }

  /** [▶◀] close immediately (releases any hold). */
  close() {
    this.#held = false;
    if (this.#state === 'open' || this.#state === 'opening') this.#state = 'closing';
  }

  tick() {
    if (this.#state === 'opening') {
      this.#state = 'open';
      this.#timer = Door.OPEN_TICKS;
    } else if (this.#state === 'open') {
      if (!this.#held && --this.#timer <= 0) this.#state = 'closing';
    } else if (this.#state === 'closing') {
      this.#state = 'closed';
    }
  }

  clone() {
    const d = new Door();
    d.#state = this.#state;
    d.#timer = this.#timer;
    d.#held = this.#held;
    return d;
  }
}
