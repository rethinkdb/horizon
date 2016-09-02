'use strict';

const {indexNameToInfo, primaryIndexName} = require('../indexes');

const {logger} = require('@horizon/server');

const compare_fields = (a, b) => {
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
  constructor(name, table, conn) {
    logger.debug(`${table} index registered: ${name}`);
    const info = indexNameToInfo(name);
    this.name = name;
    this.geo = info.geo; // true or false
    this.multi = info.multi; // false or the offset of the multi field
    this.fields = info.fields; // array of fields or nested field paths

    this._waiters = [];
    this._result = null;

    if (this.geo) {
      logger.warn(`Unsupported index (geo): ${this.name}`);
    } else if (this.multi !== false) {
      logger.warn(`Unsupported index (multi): ${this.name}`);
    }

    if (name !== primaryIndexName) {
      table.indexWait(name).run(conn).then(() => {
        logger.debug(`${table} index ready: ${name}`);
        this._result = true;
        this._waiters.forEach((w) => w(this));
        this._waiters = [];
      }).catch((err) => {
        this._result = err;
        this._waiters.forEach((w) => w(err));
        this._waiters = [];
      });
    } else {
      logger.debug(`${table} index ready: ${name}`);
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

  on_ready(done) {
    if (this._result === true) {
      done();
    } else if (this._result) {
      done(this);
    } else {
      this._waiters.push(done);
    }
  }

  // `fuzzy_fields` may be in any order at the beginning of the index.
  // These must be immediately followed by `ordered_fields` in the exact
  // order given.  There may be no other fields present in the index
  // (because the absence of a field would mean that row is not indexed).
  // `fuzzy_fields` may overlap with `ordered_fields`.
  is_match(fuzzy_fields, ordered_fields) {
    // TODO: multi index matching
    if (this.geo || this.multi !== false) {
      return false;
    }

    if (this.fields.length > fuzzy_fields.length + ordered_fields.length ||
        this.fields.length < fuzzy_fields.length ||
        this.fields.length < ordered_fields.length) {
      return false;
    }

    for (let i = 0; i < fuzzy_fields.length; ++i) {
      let found = false;
      for (let j = 0; j < fuzzy_fields.length && !found; ++j) {
        found = compare_fields(fuzzy_fields[i], this.fields[j]);
      }
      if (!found) { return false; }
    }

    for (let i = 0; i < ordered_fields.length; ++i) {
      const pos = this.fields.length - ordered_fields.length + i;
      if (pos < 0 || !compare_fields(ordered_fields[i], this.fields[pos])) {
        return false;
      }
    }

    return true;
  }
}

module.exports = Index;
