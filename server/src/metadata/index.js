'use strict';

const check = require('../error').check;

// Index names are of the format "field1_field2_field3", where the fields
// are given in order of use in a compound index.  If the field names contain
// the characters '\' or '_', they will be escaped with a '\'.
// TODO: what about empty field names?

const name_to_fields = (name) => {
  let escaped = false;
  let field = '';
  const fields = [ ];
  for (const c of name) {
    if (escaped) {
      check(c === '\\' || c === '_', `Unexpected index name: "${name}"`);
      escaped = false;
      field += c;
    } else if (c === '\\') {
      escaped = true;
    } else if (c === '_') {
      fields.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  check(!escaped, `Unexpected index name: "${name}"`);
  fields.push(field);
  return fields;
};

const fields_to_name = (fields) => {
  let res = '';
  for (const field of fields) {
    if (res.length > 0) {
      res += '_';
    }
    for (const c of field) {
      if (c === '\\' || c === '_') {
        res += '\\';
      }
      res += c;
    }
  }
  return res;
};

const primary_index_name = fields_to_name([ 'id' ]);

class Index {
  constructor(name, table, conn) {
    this.name = name;
    this.fields = Index.name_to_fields(name);

    this._waiters = [ ];
    this._result = null;

    if (name !== primary_index_name) {
      table.indexWait(name).run(conn).then(() => {
        this._result = true;
        this._waiters.forEach((w) => w());
        this._waiters = [ ];
      }).catch((err) => {
        this._result = err;
        this._waiters.forEach((w) => w(err));
        this._waiters = [ ];
      });
    } else {
      this._result = true;
    }
  }

  close() {
    this._waiters.forEach((w) => w(new Error('index deleted')));
    this._waiters = [ ];
  }

  ready() {
    return this._result === true;
  }

  on_ready(done) {
    if (this._result === true) {
      done();
    } else if (this._result) {
      done(this._result);
    } else {
      this._waiters.push(done);
    }
  }

  // `fuzzy_fields` may be in any order at the beginning of the index.
  // These must be immediately followed by `ordered_fields` in the exact
  // order given.  There may be no other fields present in the index until
  // after all of `fuzzy_fields` and `ordered_fields` are present.
  // `fuzzy_fields` may overlap with `ordered_fields`.
  is_match(fuzzy_fields, ordered_fields) {
    for (let i = 0; i < fuzzy_fields.length; ++i) {
      const pos = this.fields.indexOf(fuzzy_fields[i]);
      if (pos < 0 || pos >= fuzzy_fields.length) { return false; }
    }

    outer: // eslint-disable-line no-labels
    for (let i = 0; i <= fuzzy_fields.length && i + ordered_fields.length <= this.fields.length; ++i) {
      for (let j = 0; j < ordered_fields.length; ++j) {
        if (this.fields[i + j] !== ordered_fields[j]) {
          continue outer; // eslint-disable-line no-labels
        }
      }
      return true;
    }
    return false;
  }
}

Index.name_to_fields = name_to_fields;
Index.fields_to_name = fields_to_name;

module.exports = { Index };
