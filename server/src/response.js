'use strict';

const r = require('rethinkdb');

const events = Symbol('events');
const send = Symbol('send');
const resolve = Symbol('resolve');
const reject = Symbol('reject');
const completed = Symbol('completed');

class Response {
  constructor(_events, _send) {
    this[events] = _events;
    this[send] = _send;
    this[completed] = false;
    this.complete = new Promise((_resolve, _reject) => {
      this[resolve] = _resolve;
      this[reject] = _reject;
    }).catch((err) => {
      this[events].emit('log', 'debug', `Request failed with error: ${err.stack}`);
      try {
        const msg = (err instanceof r.Error.ReqlError) ? err.msg : err.message;
        this[send]({
          error: `${msg}`,
          errorCode: err.code || -1,
        });
      } catch (err2) {
        console.log(`error when sending error: ${err2}`);
      }
      throw err;
    });
  }

  // Each parameter to 'write' may be a patch or an array of patches
  write(patch) {
    if (this[completed]) {
      throw new Error('This response has already completed.');
    }

    if (Array.isArray(patch)) {
      this[send]({patch});
    } else {
      this[send]({patch: [patch]});
    }
  }

  end(patchOrError) {
    if (!this[completed]) {
      this[completed] = true;
      if (patchOrError instanceof Error) {
        this[reject](patchOrError);
      } else {
        if (Array.isArray(patchOrError)) {
          this[send]({complete: true, patch: patchOrError});
        } else if (patchOrError) {
          this[send]({complete: true, patch: [patchOrError]});
        } else {
          this[send]({complete: true});
        }
        this[resolve]();
      }
    }
  }
}

module.exports = Response;
