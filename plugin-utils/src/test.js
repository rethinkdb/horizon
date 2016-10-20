'use strict';

const Response = require('@horizon/server/src/response');
const jsonpatch = require('jsonpatch');

// Mock Response object for use by tests
class MockResponse extends Response {
  constructor(events, done) {
    super(events, (obj) => {
      if (obj.patch) {
        jsonpatch.apply_patch(this._value, obj.patch);
      }
      this._messages.push(obj);
    });

    this._value = {};
    this._messages = [];

    this.value = this.complete.then(() => this._value);
    this.messages = this.complete.then(() => this._messages);
  }
}

module.exports = {MockResponse};
