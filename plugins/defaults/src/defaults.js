'use strict';

// Collections API
const defaultMethods = {
  above: require('@horizon-plugins/above'),
  below: require('@horizon-plugins/below'),
  collection: require('@horizon-plugins/collection'),
  insert: require('@horizon-plugins/insert'),
  fetch: require('@horizon-plugins/fetch'),
  find: require('@horizon-plugins/find'),
  findAll: require('@horizon-plugins/findAll'),
  limit: require('@horizon-plugins/limit'),
  order: require('@horizon-plugins/order'),
  remove: require('@horizon-plugins/remove'),
  removeAll: require('@horizon-plugins/removeAll'),
  replace: require('@horizon-plugins/replace'),
  store: require('@horizon-plugins/store'),
  timeout: require('@horizon-plugins/timeout'),
  update: require('@horizon-plugins/update'),
  upsert: require('@horizon-plugins/upsert'),
  watch: require('@horizon-plugins/watch'),
};

// Permissions API
const defaultPermissions = {
  permissions: require('@horizon-plugins/permissions'),
  'permit-all': require('@horizon-plugins/permit-all'),
};

// Combines some subset of the default plugins into a single plugin for ease-of-use.
// `options` may have any or all of these properties:
//   `methods`: an array of default methods to include, defaults to all of them
//   `permissions`:
//      false: no permissions plugin will be loaded (the collections API won't work
//        unless some other plugin provides the 'hz_permissions' prereq)
//      'permissions': the standard permissions plugin will be loaded (default)
//      'permit-all': a dummy permissions plugin will be loaded that allows all requests
module.exports = {
  name: 'hz_defaults',
  activate: (context, options, onReady, onUnready) => {
    const events = context.horizon.events;
    const subplugins = (options.methods || Object.keys(defaultMethods)).map((name) => {
      const plugin = defaultMethods[name];
      if (!plugin) {
        throw new Error(`Method "${name}" is not provided by a default Horizon plugin.`);
      }
      return plugin;
    });
    context[options.name] = {subplugins};

    if (options.permissions === undefined) {
      // Use the secure thing by default
      subplugins.push(defaultPermissions.permissions);
    } else if (options.permissions !== false) {
      const plugin = defaultPermissions[options.permissions];
      if (!plugin) {
        throw new Error('Unrecognized permissions plugin name ' +
          `"${options.permissions}", expected "permissions" or "permit-all".`);
      }
      subplugins.push(plugin);
    }

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

    const names = subplugins.map((p) => p.name);
    events.emit('log', 'info',
      `${options.name} activating subplugins: ${names.join(', ')}`);

    const promises = subplugins.map((plugin) => {

      const promise = Promise.resolve().then(() =>
        // Activate each plugin with their default name rather than the
        // name of the defaults plugin
        plugin.activate(context,
                        Object.assign({}, options, {name: plugin.name}),
                        () => ready(plugin.name),
                        () => unready(plugin.name))
      );

      if (plugin.activate.length < 3) {
        promise.then(() => ready(plugin.name));
      }

      promise.then(() =>
        events.emit('log', 'info', `${options.name} subplugin ready ` +
          `(${readyPlugins.size}/${subplugins.length}): ${plugin.name}`));
      return promise;
    });

    return Promise.all(promises).then((results) => ({
      methods: Object.assign({}, ...results.map((i) => i.methods)),
    }));
  },

  deactivate: (context, options) => {
    const subplugins = context[options.name].subplugins;
    delete context[options.name];
    return Promise.all(subplugins.map((plugin) =>
      Promise.resolve().then(() => {
        if (plugin.deactivate) {
          plugin.deactivate(context, Object.assign({}, options, {name: plugin.name}));
        }
      })));
  },
};

module.exports.methods = defaultMethods;
module.exports.permissions = defaultPermissions;
