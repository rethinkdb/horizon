'use strict';

const check = require('../error').check;

const ast = require('@horizon/client/lib/ast');
const vm = require('vm');

class Any {
  constructor() {
    this._values = Array.from(arguments);
  }

  matches(value) {
    if (this._value.length === 0) {
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

const dummy_send = (type, options) => {
  template = { request_id: new Any(), type, options };
};

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

// Monkey-patch the ast functions so we don't clobber certain things
ast.TermBase.prototype.watch = function () {
  return dummy_send('subscribe', this._query);
};
ast.TermBase.prototype.fetch = function () {
  return dummy_send('query', this._query);
};
ast.Collection.prototype.store = function (docs) {
  return dummy_send('store', wrap_write(this._query, docs));
};
ast.Collection.prototype.upsert = function (docs) {
  return dummy_send('upsert', wrap_write(this._query, docs));
};
ast.Collection.prototype.insert = function (docs) {
  return dummy_send('insert', wrap_write(this._query, docs));
};
ast.Collection.prototype.replace = function (docs) {
  return dummy_send('replace', wrap_write(this._query, docs));
};
ast.Collection.prototype.update = function (docs) {
  return dummy_send('update', wrap_write(this._query, docs));
};
ast.Collection.prototype.remove = function (doc) {
  return dummy_send('remove', wrap_write(this._query, wrap_remove(doc)));
};
ast.Collection.prototype.removeAll = function (docs) {
  return dummy_send('remove', wrap_write(this._query,
                                         docs.map(doc => wrap_remove(doc))));
};

const env = {
  collection: (name) => new ast.Collection(dummy_send, name, false),
  any: function() { return new Any(...arguments); },
  user: {
    id: new UserId(),
  },
  template: null,
};

const make_template = (str) => {
  const sandbox = Object.assign({}, env);
  vm.runInNewContext(str, sandbox);
  return sandbox.template;
};

const template_compare = (query, template, context) => {
  console.log(`Comparing query (${JSON.stringify(query)}) and template (${JSON.stringify(template)})`);
  for (const key in query) {
    const query_value = query[key];
    const template_value = template[key];
    if (template_value === undefined) {
      return false;
    } else if (template_value instanceof Any) {
      if (!template_value.matches(query_value)) {
        return false;
      }
    } else if (template_value instanceof UserId) {
      if (query_value !== context.user_id) {
        return false;
      }
    } else if (template_value === null) {
      if (query_value !== null) {
        return false;
      }
    } else if (Array.isArray(template_value)) {
      if (!Array.isArray(query_value) ||
          template_value.length !== query_value.length) {
        return false;
      }
      for (let i = 0; i < template_value.length; ++i) {
        if (!template_compare(query_value[i], template_value[i], context)) {
          return false;
        }
      }
    } else if (typeof template_value === 'object') {
      if (typeof query_value !== 'object' ||
          !template_compare(query_value, template_value, context)) {
        return false;
      }
    } else if (template_value !== query_value) {
      return false;
    }
  }

  // Make sure all template keys were handled
  for (const key in template) {
    if (query[key] === undefined) {
      return false;
    }
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
