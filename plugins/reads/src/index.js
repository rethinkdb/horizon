'use strict';

const above = require('./above');
const below = require('./below');
const order = require('./order');
const find = require('./find');
const findAll = require('./findAll');
const limit = require('./limit');
const fetch = require('./fetch');
const watch = require('./watch');

module.exports = (raw_config) => ({
  name: (raw_config && raw_config.name) || 'hz_reads',
  activate: (server) => ({
    methods: {
      above: {
        type: 'option',
        handler: above(server),
      },
      below: {
        type: 'option',
        handler: below(server),
      },
      order: {
        type: 'option',
        handler: order(server),
      },
      find: {
        type: 'option',
        handler: find(server),
      },
      findAll: {
        type: 'option',
        handler: findAll(server),
      },
      limit: {
        type: 'option',
        handler: limit(server),
      },
      fetch: {
        requires: ['hz_permissions'],
        type: 'terminal',
        handler: fetch(server),
      },
      watch: {
        requires: ['hz_permissions'],
        type: 'terminal',
        handler: watch(server),
      },
    },
  }),
});
