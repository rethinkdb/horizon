'use strict';

const logger = require('./logger');

class Response {
  constructor(socketSend) {
    this._socketSend = socketSend;
    this.complete = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    }).then((data) => {
      this._completed = true;
      this.write(data, 'complete');
    }).catch((err) => {
      this._completed = true;
      logger.debug(`Request failed with error: ${err.stack}`);
      this._socketSend({
        error: `${err}`,
        error_code: err.code || -1,
      });
      throw err;
    });
  }

  write(data, state = undefined) {
    if (this._completed && state !== 'complete') {
      throw new Error('This response has already completed.');
    } else if (!this._completed && state === 'complete') {
      throw new Error(
        '`.write()` cannot be used to send a `state: complete` message.' +
        '  Use `.end()` to complete a Response.');
    }
    this._socketSend({state, data});
  }

  end(dataOrError) {
    if (dataOrError instanceof Error) {
      this._reject(dataOrError);
    } else {
      this._resolve(dataOrError);
    }
  }
}

module.exports = Response;
