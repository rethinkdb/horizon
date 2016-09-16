'use strict';

const logger = require('./logger');

class Response {
  constructor(socketSend) {
    this._socketSend = socketSend;
    this.complete = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    }).catch((err) => {
      logger.debug(`Request failed with error: ${err.stack}`);
      this._socketSend({
        error: `${err.message}`,
        error_code: err.code || -1,
      });
      throw err;
    });
  }

  // Each parameter to 'write' may be a patch or an array of patches
  write(patch) {
    if (this._completed) {
      throw new Error('This response has already completed.');
    }

    if (Array.isArray(patch)) {
      this._socketSend({patch});
    } else {
      this._socketSend({patch: [patch]});
    }
  }

  end(patchOrError) {
    logger.debug(`Ending request with ${patchOrError}`);
    if (!this._completed) {
      this._completed = true;
      if (patchOrError instanceof Error) {
        this._reject(patchOrError);
      } else {
        if (Array.isArray(patchOrError)) {
          this._socketSend({state: 'complete', patch: patchOrError});
        } else if (patchOrError) {
          this._socketSend({state: 'complete', patch: [patchOrError]});
        } else {
          this._socketSend({state: 'complete'});
        }
        this._resolve();
      }
    }
  }
}

module.exports = Response;
