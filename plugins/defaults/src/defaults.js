'use strict';

// Collections API
const defaultMethods = {
  above: require('@horizon/plugin-above'),
  below: require('@horizon/plugin-below'),
  collection: require('@horizon/plugin-collection'),
  insert: require('@horizon/plugin-insert'),
  fetch: require('@horizon/plugin-fetch'),
  find: require('@horizon/plugin-find'),
  findAll: require('@horizon/plugin-findAll'),
  limit: require('@horizon/plugin-limit'),
  order: require('@horizon/plugin-order'),
  remove: require('@horizon/plugin-remove'),
  replace: require('@horizon/plugin-replace'),
  store: require('@horizon/plugin-store'),
  timeout: require('@horizon/plugin-timeout'),
  update: require('@horizon/plugin-update'),
  upsert: require('@horizon/plugin-upsert'),
  watch: require('@horizon/plugin-watch'),
};

// Permissions API
const defaultPermissions = {
  permissions: require('@horizon/plugin-permissions'),
  'permit-all': require('@horizon/plugin-permit-all'),
};

// Combines some subset of the default plugins into a single plugin for ease-of-use
// `raw_config` can be omitted or an object with any or all of these properties:
//   `methods`: an array of default methods to include, defaults to all of them
//   `permissions`:
//      false: no permissions plugin will be loaded (the collections API won't work
//        unless some other plugin provides the 'hz_permissions' prereq)
//      'permissions': the standard permissions plugin will be loaded (default)
//      'permit-all': a dummy permissions plugin will be loaded that allows all requests
module.exports = (raw_config) => {
  const config = raw_config || {};
  const subplugins = (config.methods || Object.keys(defaultMethods)).map((name) => {
    const plugin = defaultMethods[name];
    if (!plugin) {
      throw new Error(`Method "${name}" is not provided by a default Horizon plugin.`);
    }
    return plugin(config);
  });

  if (config.permissions === undefined) {
    // Use the secure thing by default
    subplugins.push(defaultPermissions.permissions(config));
  } else if (config.permissions !== false) {
    const plugin = defaultPermissions[config.permissions];
    if (!plugin) {
      throw new Error(`Unrecognized permissions plugin name "${config.permissions}", ` +
                      'expected "permissions" or "permit-all".');
    }
    subplugins.push(plugin(config));
  }

  return {
    name: 'hz_defaults',
    activate: (ctx, onReady, onUnready) => {
      // Some subplugins may need to notify about readiness
      const readyPlugins = new Map();
      function ready(name) {
        readyPlugins.set(name);
        if (readyPlugins.size === subplugins.length) {
          onReady();
        }
      }
      function unready(name) {
        if (readyPlugins.size === subplugins.length) {
          onUnready();
        }
        readyPlugins.delete(name);
      }

      const promises = subplugins.map((plugin) => {
        const promise = Promise.resolve().then(() =>
          plugin.activate(ctx, () => ready(plugin.name), () => unready(plugin.name))
        );
        if (plugin.activate.length < 2) {
          ready(plugin.name);
        }
        return promise;
      });

      return Promise.all(promises).then((results) => ({
        methods: Object.assign({}, ...results.map((i) => i.methods)),
      }));
    },
    deactivate: (ctx) =>
      Promise.all(subplugins.map((p) =>
        Promise.resolve().then(() => p.deactivate && p.deactivate(ctx)))),
  };
};

module.exports.methods = defaultMethods;
module.exports.permissions = defaultPermissions;
