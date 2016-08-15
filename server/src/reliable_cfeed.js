'use strict';

class Reliable {
  constructor(initialCbs) {
    this.subs = {};
    this.ready = false;
    this.closed = false;
    if (initialCbs) {
      subscribe(initialCbs);
    }
  }

  subscribe(cbs) {
    if (this.closed) {
      throw new Error("Cannot subscribe to a closed ReliableConn.");
    }
    const subId = Symbol();
    subs[subId] = {
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
    return subs[subId];
  }

  emit() {
    if (!this.closed) {
      emitInternal.apply(this, arguments);
    }
  }

  emitInternal() {
    const eventType = arguments.shift();
    // TODO: consider checking to make sure we don't send two
    // `onReady` or `onUnready`s in a row (or even just returning
    // early if we would).
    if (eventType == "onReady") {
      this.ready = arguments;
    } else if (eventType == "onUnready") {
      this.ready = false;
    }
    for (let s of Object.getOwnPropertySymbols(this.subs)) {
      try {
        const cbs = this.subs[s].cbs;
        const event = cbs[eventType];
        if (event) { event.apply(cbs, arguments); }
      } catch (e) {
        // log e
      }
    }
  }

  close(reason) {
    this.closed = true;
    if (this.ready) {
      emitInternal('onUnready', new Error('closed: ' + reason));
    }
    this.subs = {}; // Just to make sure no subclasses do anything clever.
    return Promise.resolve();
  }
}

class ReliableConn extends Reliable{
  constructor(connOpts) {
    super();
    this.connOpts = connOpts;
    connect();
  }

  connect() {
    r.connect(this.connOpts).then((conn) => {
      if (!this.closed) {
        this.conn = conn;
        emit('onReady', conn);
        conn.on('close', () => {
          if (this.ready) {
            emit('onUnready', new Error('connection closed'));
            if (!this.closed) {
              connect();
            }
          }
        })
      } else {
        conn.close();
      }
    }).catch((e) => {
      if (this.conn) {
        // RSI: log a scary error.
      }
      if (!this.closed) {
        setTimeout(1000, connect);
      }
    })
  }

  close(reason) {
    let retProm = super.close(reason);
    if (this.conn) {
      retProm = Promise.all([retProm, this.conn.close()]);
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
          return cursor.eachAsync(change) {
            switch (change.type) {
            case 'state':
              if (change.state === 'ready') {
                emit('onReady');
              }
              break;
            default:
              emit('onChange', change);
            }
          }
        }).then((res) => {
          // If we get here the cursor closed for some reason.
          throw new Error("cursor closed for some reason");
        }).catch((e) => {
          emit('onUnready', e);
        });
      }
    });
  }

  close(reason) {
    let retProm = super.close(reason);
    if (this.cursor) {
      retProm = Promise.all([retProm, this.cursor.close()]);
    }
    this.subscription.close();
    return retProm;
  }
}
