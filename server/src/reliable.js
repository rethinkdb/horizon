'use strict';

const r = require('rethinkdb');

const subs = Symbol('subs');
const events = Symbol('events');

class Reliable {
  constructor(context, initialCbs) {
    this[events] = context.horizon.events;
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
      } catch (err) {
        this[events].emit('log', 'error', 'Unexpected error in reliable callback, ' +
                          `event: 'onReady', error: ${err.stack}`);
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
        const cb = sub.cbs[eventType];
        if (cb) {
          cb.apply(sub.cbs, args);
        }
      } catch (err) {
        this[events].emit('log', 'error', 'Unexpected error in reliable callback, ' +
                          `event: ${eventType}, error: ${err.stack}`);
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

class ReliableUnion extends Reliable {
  constructor(context, reqs, cbs) {
    super(context, cbs);
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

class ReliableConn extends Reliable {
  constructor(context, options) {
    super(context);
    this.options = options;
    this.connect();
  }

  connect() {
    r.connect(this.options).then((conn) => {
      if (!this.closed) {
        this.conn = conn;
        this.emit('onReady', conn);
        conn.on('close', () => {
          if (this.ready) {
            this.emit('onUnready', new Error('connection closed'));
            if (!this.closed) {
              this.connect();
            }
          }
        });
      } else {
        conn.close();
      }
    }).catch((err) => {
      this.emit('onError', err);
      if (!this.closed) {
        setTimeout(() => this.connect(), 1000);
      }
    });
  }

  maybeConnection() {
    return this.ready ? this.conn : null;
  }

  connection() {
    if (!this.ready) {
      throw new Error('Not connected');
    }
    return this.conn;
  }

  close(reason) {
    let retProm = super.close(reason);
    if (this.conn) {
      retProm = Promise.all([retProm, this.conn.close()]);
    }
    return retProm;
  }
}

const rdbConnection = Symbol('rdbConnection');

class ReliableChangefeed extends Reliable {
  constructor(context, reql, cbs) {
    super(context, cbs);
    this.reql = reql;
    this[rdbConnection] = context.horizon.reliableConn;

    this._makeSubscription();
  }

  _makeSubscription() {
    if (this.closed) { return; }
    this.subscription = this[rdbConnection].subscribe({
      onReady: (conn) => {
        this.reql.run(conn, {includeTypes: true, includeStates: true}).then((cursor) => {
          if (this.closed) {
            cursor.close();
            return;
          }
          this.cursor = cursor;
          return cursor.eachAsync((change) => {
            switch (change.type) {
            case 'state':
              if (change.state === 'ready') {
                this.emit('onReady');
              }
              break;
            default:
              this.emit('onChange', change);
            }
          }).then((res) => {
            // If we get here the cursor closed for some reason.
            throw new Error(`cursor closed unexpectedly: ${res}`);
          });
        }).catch((err) => {
          this.emit('onError', err);
          if (this.ready) {
            this.emit('onUnready', err);
          }
          if (this.subscription) {
            this.subscription.close();
            this.subscription = null;
            setTimeout(() => this._makeSubscription(), 1000);
          }
        });
      },
    });
  }

  close(reason) {
    let retProm = super.close(reason);
    if (this.cursor) {
      retProm = Promise.all([retProm, this.cursor.close()]);
    }
    if (this.subscription) {
      this.subscription.close();
      this.subscription = null;
    }
    return retProm;
  }
}

module.exports = {
  Reliable,
  ReliableUnion,
  ReliableConn,
  ReliableChangefeed,
};
