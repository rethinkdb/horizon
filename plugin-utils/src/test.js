'use strict';

const Response = require('@horizon/server/dist/response');

// Mock Response object for use by tests
class MockResponse extends Response {
  constructor() {
    super((obj) => {
      if (obj.data) {
        for (const item of obj.data) {
          this._data.push(item);
        }
      }
      this._messages.push(obj);
    });

    this._data = [];
    this._messages = [];

    this.data = this.complete.then(() => this._data);
    this.messages = this.complete.then(() => this._messages);
  }
};

module.exports = {MockResponse};
