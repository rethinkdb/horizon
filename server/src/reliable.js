'use strict';

import * as r from 'rethinkdb';
import {Reliable} from '@horizon/server-utils';
const logger = require('./logger');

export class ReliableConn extends Reliable {
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
        logger.error(
          `Error in ReliableConnection ${JSON.stringify(this.connOpts)}: ${e.stack}`);
      }
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

export class ReliableChangefeed extends Reliable {
  constructor(reql, reliableConn, cbs) {
    super(cbs);
    this.reql = reql;
    this.reliableConn = reliableConn;

    this.make_subscription();
  }

  make_subscription() {
    if (this.closed) { return; }
    this.subscription = this.reliableConn.subscribe({
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
        }).catch((e) => {
          logger.debug(`Changefeed error (${this.reql}): ${e.stack}`);
          if (this.ready) {
            this.emit('onUnready', e);
          }
          if (this.subscription) {
            this.subscription.close();
            this.subscription = null;
            setTimeout(() => this.make_subscription(), 1000);
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
