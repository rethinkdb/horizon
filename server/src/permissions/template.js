'use strict';

const check = require('../error').check;

const ast = require('@horizon/client/lib/ast');
const validIndexValue = require('@horizon/client/lib/util/valid-index-value');
const vm = require('vm');

let template_compare;

class Any {
  constructor() {
    this._values = Array.from(arguments);
  }

  matches(value) {
    if (this._values.length === 0) {
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

class UserId { }

const wrap_write = (query, docs) => {
  const result = Object.assign({}, query);
  result.data = Array.isArray(docs) ? docs : [ docs ];
  return result;
};

const wrap_remove = (doc) => {
  if (validIndexValue(doc)) {
    return { id: doc };
  }
  return doc;
};

// Add helper methods to match any subset of the current query for reads or writes
ast.TermBase.prototype.any_read = function() {
  return this._sendRequest('query', this._query);
};
ast.TermBase.prototype.any_write = function() {
  return this._sendRequest('query', this._query);
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
  collection: (name) => new ast.Collection((type, opts) =>
    ({ request_id: new Any(), type, opts }), name, false),
  any: function() { return new Any(...arguments); },
  userId: function() { return new UserId(); },
};

const make_template = (str) => {
  const sandbox = Object.assign({}, env);
  return vm.runInNewContext(str, sandbox);
};

template_compare = (query, template, context) => {
  if (template instanceof Any) {
    if (!template.matches(query)) {
      return false;
    }
  } else if (template === undefined) {
    return false;
  } else if (template instanceof UserId) {
    if (query !== context.user_id) {
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

class Template {
  constructor(str) {
    this._value = make_template(str);
    check(this._value !== null, `Invalid template (incomplete): ${str}`);
    check(!Array.isArray(this._value), `Invalid template: ${str}`);
    check(typeof this._value === 'object', `Invalid template: ${str}`);
  }

  is_match(raw_query, context) {
    return template_compare(raw_query, this._value, context);
  }
}

module.exports = { Template };
