'use strict';

const check = require('../error').check;
const logger = require('../logger');

// Index names are of the format "hz_[<flags>_]<JSON>" where <flags> may be
// omitted or "multi_<offset>" or "geo" (at the moment).  <JSON> is a JSON array
// specifying which fields are indexed in which order.  The value at each index
// in the array is either a nested array (for indexing nested fields) or a string
// for a root-level field name.
//
// Example:
//  Fields indexed: foo.bar, baz
//  Index name: hz_[["foo","bar"],"baz"]
const primary_index_name = 'id';

const name_to_info = (name) => {
  if (name === primary_index_name) {
    return { geo: false, multi: false, fields: [ [ 'id' ] ] };
  }

  const re = /^hz_(?:(geo)_)?(?:multi_([0-9])+_)?\[/;

  const matches = name.match(re);
  check(matches !== null, `Unexpected index name (invalid format): "${name}"`);

  const json_offset = matches[0].length - 1;

  const info = { name, geo: Boolean(matches[1]), multi: isNaN(matches[2]) ? false : Number(matches[2]) };

  // Parse remainder as JSON
  try {
    info.fields = JSON.parse(name.slice(json_offset));
  } catch (err) {
    check(false, `Unexpected index name (invalid JSON): "${name}"`);
  }

  // Sanity check fields
  const validate_field = (f) => {
    check(Array.isArray(f), `Unexpected index name (invalid field): "${name}"`);
    f.forEach((s) => check(typeof s === 'string',
                           `Unexpected index name (invalid field): "${name}"`));
  };

  check(Array.isArray(info.fields),
        `Unexpected index name (fields are not an array): "${name}"`);
  check((info.multi === false) || (info.multi < info.fields.length),
        `Unexpected index name (multi index out of bounds): "${name}"`);
  info.fields.forEach(validate_field);
  return info;
};

const info_to_name = (info) => {
  let res = 'hz_';
  if (info.geo) {
    res += 'geo_';
  }
  if (info.multi !== false) {
    res += 'multi_' + info.multi + '_';
  }
  res += JSON.stringify(info.fields);
  return res;
};

const info_to_reql = (info) => {
  if (info.geo && (info.multi !== false)) {
    throw new Error('multi and geo cannot be specified on the same index');
  }

  if (info.multi !== false) {
    const multi_field = info.fields[info.multi];
    return (row) =>
      row(multi_field).map((value) => info.fields.map((f, i) => {
        if (i === info.multi) {
          return value;
        } else {
          let res = row;
          f.forEach((field_name) => { res = res(field_name); });
          return res;
        }
      }));
  } else {
    return (row) =>
      info.fields.map((f) => {
        let res = row;
        f.forEach((field_name) => { res = res(field_name); });
        return res;
      });
  }
};

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
    const info = name_to_info(name);
    this.name = name;
    this.geo = info.geo; // true or false
    this.multi = info.multi; // false or the offset of the multi field
    this.fields = info.fields; // array of fields or nested field paths

    this._waiters = [ ];
    this._result = null;

    if (this.geo) {
      logger.warn(`Unsupported index (geo): ${this.name}`);
    } else if (this.multi !== false) {
      logger.warn(`Unsupported index (multi): ${this.name}`);
    }

    if (name !== primary_index_name) {
      table.indexWait(name).run(conn).then(() => {
        logger.debug(`${table} index ready: ${name}`);
        this._result = true;
        this._waiters.forEach((w) => w());
        this._waiters = [ ];
      }).catch((err) => {
        this._result = err;
        this._waiters.forEach((w) => w(err));
        this._waiters = [ ];
      });
    } else {
      logger.debug(`${table} index ready: ${name}`);
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
      if (pos < 0 || !compare_fields(ordered_fields[i], this.fields[pos])) { return false; }
    }

    return true;
  }
}

module.exports = { Index, primary_index_name, name_to_info, info_to_name, info_to_reql };
