'use strict';

const insert = require('./insert');
const store = require('./store');
const replace = require('./replace');
const upsert = require('./upsert');
const update = require('./update');
const remove = require('./remove');

module.exports = (raw_config) => ({
  name: (raw_config && raw_config.name) || 'hz_writes',
  activate: (server) => ({
    methods: {
      insert: {
        requires: ['hz_permissions'],
        type: 'terminal',
        handler: insert(server),
      },
      store: {
        requires: ['hz_permissions'],
        type: 'terminal',
        handler: store(server),
      },
      replace: {
        requires: ['hz_permissions'],
        type: 'terminal',
        handler: replace(server),
      },
      upsert: {
        requires: ['hz_permissions'],
        type: 'terminal',
        handler: upsert(server),
      },
      update: {
        requires: ['hz_permissions'],
        type: 'terminal',
        handler: update(server),
      },
      remove: {
        requires: ['hz_permissions'],
        type: 'terminal',
        handler: remove(server),
      },
    },
  }),
});
