/* TODO: move somewhere else - this is only for tests
'use strict';

const Response = require('@horizon/server/src/response');
const jsonpatch = require('jsonpatch');

// Mock Response object for use by tests
class MockResponse extends Response {
  constructor(events) {
    super(events, (obj) => {
      this._messages.push(obj);
      if (obj.patch) {
        jsonpatch.apply_patch(this._state, obj.patch);

        if (this._state.synced === true) {
          this._values.push(this._state.val);
        }
      }
    });

    this._state = {};
    this._values = [];
    this._messages = [];

    this.state = this.complete.then(() => this._state);
    this.values = this.complete.then(() => this._values);
    this.messages = this.complete.then(() => this._messages);
  }
}

module.exports = {MockResponse};
*/
