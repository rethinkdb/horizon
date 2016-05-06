'use strict';

class Index {
  constructor(name, promise) {
    this.name = name;
    this.fields = Index.name_to_fields(name);
    this.promise = promise;
  }

  on_ready(done) {
    this.promise ? this.promise.then(() => done(), (err) => done(err)) : done();
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

Index.name_to_fields = (name) => {

};

Index.fields_to_name = (fields) => {

};

module.exports = Index;
