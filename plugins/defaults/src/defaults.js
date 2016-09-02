'use strict';

module.exports = {
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
