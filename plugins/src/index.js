'use strict';

const allPlugins = {
  // Collections API
  above: require('./above'),
  below: require('./below'),
  collection: require('./collection'),
  insert: require('./insert'),
  fetch: require('./fetch'),
  find: require('./find'),
  findAll: require('./findAll'),
  limit: require('./limit'),
  order: require('./order'),
  remove: require('./remove'),
  replace: require('./replace'),
  store: require('./store'),
  timeout: require('./timeout'),
  update: require('./update'),
  upsert: require('./upsert'),
  watch: require('./watch'),

  // Permissions API
  permissions: require('./permissions'),
  permit_all: require('./permit_all'),
};


module.exports = function (options) {
  options.methods = options.methods || Object.keys(allPlugins);
  const subplugins = options.methods.map((name) => {
    if (!allPlugins[name]) {
      throw new Error(`"${name}" is not a default Horizon method.`);
    }
    return allPlugins[name](options);
  });

  return {
    name: 'hz_default_plugins',
    activate: (ctx) =>
      Promise.all(subplugins.map((p) =>
        Promise.resolve().then(() => p.activate(ctx)))).then((results) => ({
          methods: Object.assign({}, results.methods),
        })),

    deactivate: (ctx) =>
      Promise.all(subplugins.map((p) =>
        Promise.resolve().then(() => p.deactivate && p.deactivate(ctx)))),
  };
};

for (const name of allPlugins) {
  module.exports[name] = allPlugins[name];
}
