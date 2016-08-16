'use strict';

const logger = require('./logger');

const r = require('rethinkdb');

class Reliable {
  constructor(initialCbs) {
    this.subs = {};
    this.ready = false;
    this.closed = false;
    if (initialCbs) {
      this.subscribe(initialCbs);
    }
  }

  subscribe(cbs) {
    if (this.closed) {
      throw new Error('Cannot subscribe to a closed ReliableConn.');
    }
    const subId = Symbol();
    this.subs[subId] = {
      cbs: cbs,
      close: () => delete this.subs[subId],
    };
    if (this.ready && cbs.onReady) {
      try {
        cbs.onReady.apply(cbs, this.ready);
      } catch (e) {
        // log e
      }
    }
    return this.subs[subId];
  }

  emit() {
    if (!this.closed) {
      this.emitInternal.apply(this, arguments);
    }
  }

  emitInternal() {
    const eventType = arguments.shift();
    // TODO: consider checking to make sure we don't send two
    // `onReady` or `onUnready`s in a row (or even just returning
    // early if we would).
    if (eventType === 'onReady') {
      this.ready = arguments;
    } else if (eventType === 'onUnready') {
      this.ready = false;
    }
    for (const s of Object.getOwnPropertySymbols(this.subs)) {
      try {
        const cbs = this.subs[s].cbs;
        const event = cbs[eventType];
        if (event) { event.apply(cbs, arguments); }
      } catch (e) {
        // TODO: log e
      }
    }
  }

  close(reason) {
    this.closed = true;
    if (this.ready) {
      this.emitInternal('onUnready', new Error(`closed: ${reason}`));
    }
    this.subs = {}; // Just to make sure no subclasses do anything clever.
    return Promise.resolve();
  }
}

class ReliableConn extends Reliable {
  constructor(connOpts) {
    super();
    this.connOpts = connOpts;
    this.connect();
  }

  connect() {
    r.connect(this.connOpts).then((conn) => {
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
    }).catch((e) => {
      if (this.conn) {
        logger.error(`Error in ${JSON.stringify(this)}: ${e.stack}`);
      }
      if (!this.closed) {
        setTimeout(1000, () => this.connect());
      }
    });
  }

  close(reason) {
    let retProm = super.close(reason);
    if (this.conn) {
      retProm = Promise.all([ retProm, this.conn.close() ]);
    }
    return retProm;
  }
}

class ReliableCfeed extends Reliable {
  constructor(reql, reliableConn, cbs) {
    super(cbs);
    this.reql = reql;
    this.reliableConn = reliableConn;

    // RSI: restart this if there's an error on the cfeed rather than the connection.
    this.subscription = reliableConn.subscribe({
      onReady: (conn) => {
        reql.run(conn, {includeTypes: true, includeStates: true}).then((cursor) => {
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
            throw new Error(`cursor closed for some reason: ${res}`);
          }).catch((e) => {
            this.emit('onUnready', e);
          });
        });
      },
    });
  }

  close(reason) {
    let retProm = super.close(reason);
    if (this.cursor) {
      retProm = Promise.all([ retProm, this.cursor.close() ]);
    }
    this.subscription.close();
    return retProm;
  }
}

class ReliableUnion extends Reliable {
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

module.exports = {
  Reliable,
  ReliableConn,
  ReliableCfeed,
  ReliableUnion,
};
