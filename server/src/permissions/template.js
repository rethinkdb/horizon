'use strict';

const check = require('../error').check;
const remake_error = require('../utils').remake_error;

const ast = require('@horizon/client/lib/ast');
const validIndexValue = require('@horizon/client/lib/util/valid-index-value').default;
const vm = require('vm');

let template_compare;

class Any {
  constructor(values) {
    this._values = values || [ ];
  }

  matches(value, context) {
    if (value === undefined) {
      return false;
    } else if (this._values.length === 0) {
      return true;
    }

    for (const item of this._values) {
      if (template_compare(value, item, context)) {
        return true;
      }
    }

    return false;
  }
}

// This works the same as specifying a literal object in a template, except that
// unspecified key/value pairs are allowed.
class AnyObject {
  constructor(obj) {
    this._obj = obj || { };
  }

  matches(value, context) {
    if (value === null || typeof value !== 'object') {
      return false;
    }

    for (const key in this._obj) {
      if (!template_compare(value[key], this._obj[key], context)) {
        return false;
      }
    }

    return true;
  }
}

// This matches an array where each item matches at least one of the values
// specified at construction.
class AnyArray {
  constructor(values) {
    this._values = values || [ ];
  }

  matches(value, context) {
    if (!Array.isArray(value)) {
      return false;
    }

    for (const item of value) {
      let match = false;
      for (const template of this._values) {
        if (template_compare(item, template, context)) {
          match = true;
          break;
        }
      }
      if (!match) {
        return false;
      }
    }

    return true;
  }
}

class UserId { }

const wrap_write = (query, docs) => {
  if (docs instanceof AnyArray ||
      Array.isArray(docs)) {
    query.data = docs;
  } else {
    query.data = [ docs ];
  }
  return query;
};

const wrap_remove = (doc) => {
  if (validIndexValue(doc)) {
    return { id: doc };
  }
  return doc;
};

// Add helper methods to match any subset of the current query for reads or writes
ast.TermBase.prototype.anyRead = function() {
  return this._sendRequest(new Any([ 'query', 'subscribe' ]),
                           new AnyObject(this._query));
};

ast.Collection.prototype.anyWrite = function() {
  let docs = arguments;
  if (arguments.length === 0) {
    docs = new AnyArray(new Any());
  }
  return this._sendRequest(new Any([ 'store', 'upsert', 'insert', 'replace', 'update', 'remove' ]),
                           wrap_write(new AnyObject(this._query), docs));
};

// Monkey-patch the ast functions so we don't clobber certain things
ast.TermBase.prototype.watch = function() {
  return this._sendRequest('subscribe', this._query);
};
ast.TermBase.prototype.fetch = function() {
  return this._sendRequest('query', this._query);
};
ast.Collection.prototype.store = function(docs) {
  return this._sendRequest('store', wrap_write(this._query, docs));
};
ast.Collection.prototype.upsert = function(docs) {
  return this._sendRequest('upsert', wrap_write(this._query, docs));
};
ast.Collection.prototype.insert = function(docs) {
  return this._sendRequest('insert', wrap_write(this._query, docs));
};
ast.Collection.prototype.replace = function(docs) {
  return this._sendRequest('replace', wrap_write(this._query, docs));
};
ast.Collection.prototype.update = function(docs) {
  return this._sendRequest('update', wrap_write(this._query, docs));
};
ast.Collection.prototype.remove = function(doc) {
  return this._sendRequest('remove', wrap_write(this._query, wrap_remove(doc)));
};
ast.Collection.prototype.removeAll = function(docs) {
  return this._sendRequest('remove', wrap_write(this._query,
                                                docs.map((doc) => wrap_remove(doc))));
};

const env = {
  collection: (name) => new ast.Collection((type, options) =>
    ({ request_id: new Any(),
       type: Array.isArray(type) ? new Any(type) : type,
       options }), name, false),
  any: function() { return new Any(Array.from(arguments)); },
  anyObject: function(obj) { return new AnyObject(obj); },
  anyArray: function() { return new AnyArray(Array.from(arguments)); },
  userId: function() { return new UserId(); },
};

const make_template = (str) => {
  try {
    const sandbox = Object.assign({}, env);
    return vm.runInNewContext(str, sandbox);
  } catch (err) {
    throw remake_error(err);
  }
};

// eslint-disable-next-line prefer-const
template_compare = (query, template, context) => {
  if (template === undefined) {
    return false;
  } else if (template instanceof Any ||
             template instanceof AnyObject ||
             template instanceof AnyArray) {
    if (!template.matches(query, context)) {
      return false;
    }
  } else if (template instanceof UserId) {
    if (query !== context.id) {
      return false;
    }
  } else if (template === null) {
    if (query !== null) {
      return false;
    }
  } else if (Array.isArray(template)) {
    if (!Array.isArray(query) ||
        template.length !== query.length) {
      return false;
    }
    for (let i = 0; i < template.length; ++i) {
      if (!template_compare(query[i], template[i], context)) {
        return false;
      }
    }
  } else if (typeof template === 'object') {
    if (typeof query !== 'object') {
      return false;
    }

    for (const key in query) {
      if (!template_compare(query[key], template[key], context)) {
        return false;
      }
    }

    // Make sure all template keys were handled
    for (const key in template) {
      if (query[key] === undefined) {
        return false;
      }
    }
  } else if (template !== query) {
    return false;
  }

  return true;
};

const incomplete_template_message = (str) =>
  `Incomplete template "${str}", ` +
  'consider adding ".fetch()", ".watch()", ".anyRead()", or ".anyWrite()"';

class Template {
  constructor(str) {
    this._value = make_template(str);
    check(this._value !== null, `Invalid template: ${str}`);
    check(!Array.isArray(this._value), `Invalid template: ${str}`);
    check(typeof this._value === 'object', `Invalid template: ${str}`);
    if (!(this._value instanceof Any) && !(this._value instanceof AnyObject)) {
      if (this._value.request_id === undefined &&
          this._value.type === undefined &&
          this._value.options === undefined &&
          this._value.anyRead) {
        this._value = this._value.anyRead();
      }
      check(this._value.request_id !== undefined, incomplete_template_message(str));
      check(this._value.type !== undefined, incomplete_template_message(str));
      check(this._value.options !== undefined, incomplete_template_message(str));
    }
  }

  is_match(raw_query, context) {
    return template_compare(raw_query, this._value, context);
  }
}

module.exports = { Template };
