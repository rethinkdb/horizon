'use strict';

const assert = require('assert');

const primaryIndexName = 'id';

// Index names are of the format "hz_[<flags>_]<JSON>" where <flags> may be
// omitted or "multi_<offset>" or "geo" (at the moment).  <JSON> is a JSON array
// specifying which fields are indexed in which order.  The value at each index
// in the array is either a nested array (for indexing nested fields) or a string
// for a root-level field name.
//
// Example:
//  Fields indexed: foo.bar, baz
//  Index name: hz_[["foo","bar"],"baz"]
function indexNameToInfo(name) {
  if (name === primaryIndexName) {
    return {geo: false, multi: false, fields: ['id']};
  }

  const re = /^hz_(?:(geo)_)?(?:multi_([0-9])+_)?\[/;

  const matches = name.match(re);
  assert(matches !== null, `Unexpected index name (invalid format): "${name}"`);

  const json_offset = matches[0].length - 1;

  const info = {
    name,
    geo: Boolean(matches[1]),
    multi: isNaN(matches[2]) ? false : Number(matches[2]),
  };

  // Parse remainder as JSON
  try {
    info.fields = JSON.parse(name.slice(json_offset));
  } catch (err) {
    assert(false, `Unexpected index name (invalid JSON): "${name}"`);
  }

  // Sanity check fields
  const validate_field = (f) => {
    assert(Array.isArray(f), `Unexpected index name (invalid field): "${name}"`);
    f.forEach((s) => assert(typeof s === 'string',
                            `Unexpected index name (invalid field): "${name}"`));
  };

  assert(Array.isArray(info.fields),
         `Unexpected index name (fields are not an array): "${name}"`);
  assert((info.multi === false) || (info.multi < info.fields.length),
         `Unexpected index name (multi index out of bounds): "${name}"`);
  info.fields.forEach(validate_field);
  return info;
}

function indexInfoToName(info) {
  let res = 'hz_';
  if (info.geo) {
    res += 'geo_';
  }
  if (info.multi !== false) {
    res += 'multi_' + info.multi + '_';
  }
  res += JSON.stringify(info.fields);
  return res;
}

function indexInfoToReql(info) {
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
}

module.exports = {
  indexInfoToName,
  indexInfoToReql,
  indexNameToInfo,
  primaryIndexName,
};
