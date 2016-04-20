'use strict';
const ast = require('horizon-client');
const vm = require('vm');

const dummy_send = (type, options) => {
  return { request_id: new Any(), type, options };
}

class Any { }
class UserId { }

const env = {
  collection: (name) => new ast.Collection(dummy_send, name, false),
  any: new Any(),
  user: {
    id: new UserId(),
  },
}

const make_template = (str) => {
  const sandbox = extend({}, env);
  return vm.runInNewContext(str, sandbox);
}

const template_compare = (query, template, context) => {
  for (const key of query) {
    const query_value = query[key];
    const template_value = template[key];
    if (template_value === undefined) {
      return false;
    } else if (template_value instanceof Any) {
      continue;
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
          template_value.length != query_value.length) {
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
    } else {
      if (template_value !== query_value) {
        return false;
      }
    }
  }

  // Make sure all template keys were handled
  for (const key of template) {
    if (query[key] === undefined) {
      return false;
    }
  }
}

class Template {
  constructor(str) {
    this._value = make_template(str);
    check(this._value !== null);
    check(!Array.isArray(this._value));
    check(typeof this._value === 'object');
  }

  is_match(raw_query, context) {
     return template_compare(raw_query, this._value, context);
  }
}

module.exports = { Template };
