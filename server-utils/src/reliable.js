'use strict';

import * as r from 'rethinkdb';

const subs = Symbol('subs');

export class Reliable {
  constructor(initialCbs) {
    this[subs] = new Map();
    this.ready = false;
    this.closed = false;
    if (initialCbs) {
      this.subscribe(initialCbs);
    }
  }

  numSubs() {
    return this[subs].size;
  }

  subscribe(cbs) {
    if (this.closed) {
      throw new Error('Cannot subscribe to a closed ReliableConn.');
    }
    const subId = Symbol();
    this[subs].set(subId, {
      cbs: cbs,
      close: () => this[subs].delete(subId),
    });
    if (this.ready && cbs.onReady) {
      try {
        cbs.onReady.apply(cbs, this.ready);
      } catch (e) {
        // RSI: use logging facilities
        console.error('Unexpected error in reliable callback, ' +
                      `event: subscribe onReady, error: ${e.stack}`);
      }
    }
    return this[subs].get(subId);
  }

  emit() {
    if (!this.closed) {
      this.emitInternal.apply(this, arguments);
    }
  }

  emitInternal(eventType, ...args) {
    // TODO: consider checking to make sure we don't send two
    // `onReady` or `onUnready`s in a row (or even just returning
    // early if we would).
    if (eventType === 'onReady') {
      this.ready = args;
    } else if (eventType === 'onUnready') {
      this.ready = false;
    }
    this[subs].forEach((sub) => {
      try {
        const event = sub.cbs[eventType];
        if (event) {
          event.apply(sub.cbs, args);
        }
      } catch (e) {
        // RSI: use logging facilities
        console.error('Unexpected error in reliable callback, ' +
                      `event: ${eventType}, error: ${e.stack}`);
      }
    });
  }

  close(reason) {
    this.closed = true;
    if (this.ready) {
      this.emitInternal('onUnready', new Error(`closed: ${reason}`));
    }
    this[subs].clear(); // Just to make sure no subclasses do anything clever.
    return Promise.resolve();
  }
}

export class ReliableUnion extends Reliable {
  constructor(reqs, cbs) {
    super(cbs);
    this.reqs = reqs;
    this.subs = {};
    this.emitArg = {};
    this.readyNeeded = 0;
    for (const k in reqs) {
      this.subs[k] = reqs[k].subscribe({
        onReady: (...rest) => {
          this.readyNeeded -= 1;
          this.emitArg[k] = rest;
          this.maybeEmit();
        },
        onUnready: (...rest) => {
          this.readyNeeded += 1;
          this.emitArg[k] = rest;
          this.maybeEmit();
        },
      });
      this.readyNeeded += 1;
    }
  }

  maybeEmit() {
    if (this.readyNeeded === 0 && !this.ready) {
      this.emit('onReady', this.emitArg);
    } else if (this.readyNeeded !== 0 && this.ready) {
      this.emit('onUnready', this.emitArg);
    }
  }

  close(reason) {
    for (const k in this.subs) {
      this.subs[k].close();
    }
    return super.close(reason);
  }
}
