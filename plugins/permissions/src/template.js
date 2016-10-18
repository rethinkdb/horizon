'use strict';

const assert = require('assert');
const vm = require('vm');

const {isObject, remakeError} = require('@horizon/plugin-utils');

const templateData = Symbol('templateData');

function templateCompare(query, template, context) {
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
      if (!templateCompare(query[i], template[i], context)) {
        return false;
      }
    }
  } else if (typeof template === 'object') {
    if (typeof query !== 'object') {
      return false;
    }

    for (const key in query) {
      if (!templateCompare(query[key], template[key], context)) {
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
}

class Any {
  constructor(values) {
    this._values = values || [];
  }

  matches(value, context) {
    if (value === undefined) {
      return false;
    } else if (this._values.length === 0) {
      return true;
    }

    for (const item of this._values) {
      if (templateCompare(value, item, context)) {
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
      if (!templateCompare(value[key], this._obj[key], context)) {
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
    this._values = values || [];
  }

  matches(value, context) {
    if (!Array.isArray(value)) {
      return false;
    }

    for (const item of value) {
      let match = false;
      for (const template of this._values) {
        if (templateCompare(item, template, context)) {
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

// The chained object in the template is of the format:
// {
//   [templateData]: {
//     any: <BOOL>,
//     options: {
//       <OPTION>: <ARGS>,
//     }
//   }
// }
function proxyGet(target, property) {
  const data = target[templateData];

  if (data.options[property] !== undefined) {
    throw new Error('"${property}" is already specified for the request.');
  }

  if (property === 'any') {
    // TODO: maybe make this return the next object directly,
    // rather than a method with no args?
    return (...args) => {
      if (args.length !== 0) {
        throw new Error('".any()" does not take arguments');
      }
      return new Proxy({
        [templateData]: {
          any: true,
          options: data.options,
        },
      }, {get: proxyGet});
    };
  }

  return (...args) => {
    let value = args;
    if (args.length === 1 && args[0] instanceof Any) {
      value = args[0];
    }
    return new Proxy({
      [templateData]: {
        any: data.any,
        options: Object.assign({property: value}, data.options),
      },
    }, {get: proxyGet});
  };
}

const env = {
  request: new Proxy({}, {get: proxyGet}),
  horizon: (...args) => new Proxy({}, {get: proxyGet}).collection(...args),
  any: function() { return new Any(Array.from(arguments)); },
  anyObject: function(obj) { return new AnyObject(obj); },
  anyArray: function() { return new AnyArray(Array.from(arguments)); },
  userId: function() { return new UserId(); },
};

function makeTemplate(str) {
  try {
    const sandbox = Object.assign({}, env);
    return vm.runInNewContext(str, sandbox);
  } catch (err) {
    throw remakeError(err);
  }
}

class Template {
  constructor(str) {
    const result = makeTemplate(str);
    assert(isObject(result), `Invalid template: ${str}`);

    if ((result instanceof Any || result instanceof AnyObject)) {
      this.value = result;
    } else if (result[templateData] === undefined) {
      // Assume this is a literal object for the options
      assert(isObject(result), `Invalid template: ${str}`);
      this.value = result;
    } else {
      const data = result[templateData];
      this.value = data.options;
      assert(isObject(this.value), `Invalid template: ${str}`);
      assert(!(this.value instanceof AnyArray), `Invalid template: ${str}`);

      // If `any` was chained onto the request at some point, we'll allow
      // unspecified options with any args
      if (data.any) {
        this.value = AnyObject(this.value);
      }
    }

    // RSI: make sure the templates are complete
    // maybe do a check the first time we match templates -
    // that each template contains a terminal based on the server's capabilities
    // (contains a terminal or allows any unspecified options)
    // RSI: ease-of-use things like anyRead/anyWrite?
  }

  isMatch(queryOptions, context) {
    return templateCompare(queryOptions, this.value, context);
  }
}

module.exports = Template;
