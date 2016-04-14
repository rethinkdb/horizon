'use strict';

const r = require('rethinkdb');

const admin_db = r.db('horizon_internal');
const client_table = admin_db.table('stats_clients');
const request_table = admin_db.table('stats_requests');

const change_settings = {
  include_initial: true,
  include_states: true,
  include_types: true
};

module.exports = {
  clients(req, metadata) {
    return client_table
            .getAll(true, {index: 'connected'})
            .changes(change_settings);
  },

  requests(req, metadata) {
    return (req.options.live ?
           request_table.getAll(true, {index: "cursors"}) :
           request_table.orderBy({index: r.desc("time")}).limit(100))
           .changes(change_settings);
  },

  collections(req, metadata) {
    return admin_db.table("collections")
                   .changes(change_settings);
  }
}
