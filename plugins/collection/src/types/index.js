'use strict';

const {indexNameToInfo, primaryIndexName} = require('../indexes');

const compareFields = (a, b) => {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
};

class Index {
  constructor(name, table, conn, log) {
    log('debug', `${table} index registered: ${name}`);
    const info = indexNameToInfo(name);
    this.name = name;
    this.geo = info.geo; // true or false
    this.multi = info.multi; // false or the offset of the multi field
    this.fields = info.fields; // array of fields or nested field paths

    this._waiters = [];
    this._result = null;

    if (this.geo) {
      log('warn', `Unsupported index (geo): ${this.name}`);
    } else if (this.multi !== false) {
      log('warn', `Unsupported index (multi): ${this.name}`);
    }

    if (name !== primaryIndexName) {
      table.indexWait(name).run(conn()).then(() => {
        log('debug', `${table} index ready: ${name}`);
        this._result = true;
        this._waiters.forEach((w) => w(this));
        this._waiters = [];
      }).catch((err) => {
        this._result = err;
        this._waiters.forEach((w) => w(err));
        this._waiters = [];
      });
    } else {
      log('debug', `${table} index ready: ${name}`);
      this._result = true;
    }
  }

  close() {
    this._waiters.forEach((w) => w(new Error('index deleted')));
    this._waiters = [];
  }

  ready() {
    return this._result === true;
  }

  onReady(done) {
    if (this._result === true) {
      done();
    } else if (this._result) {
      done(this);
    } else {
      this._waiters.push(done);
    }
  }

  // `fuzzyFields` may be in any order at the beginning of the index.
  // These must be immediately followed by `orderedFields` in the exact
  // order given.  There may be no other fields present in the index
  // (because the absence of a field would mean that row is not indexed).
  // `fuzzyFields` may overlap with `orderedFields`.
  isMatch(fuzzyFields, orderedFields) {
    // TODO: multi index matching
    if (this.geo || this.multi !== false) {
      return false;
    }

    if (this.fields.length > fuzzyFields.length + orderedFields.length ||
        this.fields.length < fuzzyFields.length ||
        this.fields.length < orderedFields.length) {
      return false;
    }

    for (let i = 0; i < fuzzyFields.length; ++i) {
      let found = false;
      for (let j = 0; j < fuzzyFields.length && !found; ++j) {
        found = compareFields(fuzzyFields[i], this.fields[j]);
      }
      if (!found) { return false; }
    }

    for (let i = 0; i < orderedFields.length; ++i) {
      const pos = this.fields.length - orderedFields.length + i;
      if (pos < 0 || !compareFields(orderedFields[i], this.fields[pos])) {
        return false;
      }
    }

    return true;
  }
}

module.exports = Index;
