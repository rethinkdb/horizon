'use strict';

const r = require('rethinkdb');

const admin_db = r.db('horizon_internal');
const client_table = admin_db.table('stats_clients');
const request_table = admin_db.table('stats_requests');

class Admin {
  constructor(server) {
    this.server = server;
  }

  clear_tables() {
    this._run_query(
      r.expr(["stats_clients", "stats_requests"])
       .forEach(admin_db.table(r.row).delete()));
  }

  add_request(req, client) {
    if (req.raw.type.startsWith("admin:")) return;

    this._run_query(
      request_table.insert({
        id: [client.id, req.id],
        request: req.id, raw: req.raw,
        time: r.now(), cursors: 0,
        client: {id: client.id, ip: client.get_address()}
      }));
  }

  add_cursor(client, req) {
    if (req.raw.type.startsWith("admin:")) return;

    this._run_query(
      request_table
       .get([client.id, req.id])
       .update({cursors: r.row('cursors').add(1)}));
  }

  remove_cursor(client, req) {
    if (req.raw.type.startsWith("admin:")) return;

    this._run_query(
      request_table
       .get([client.id, req.id])
       .update({cursors: r.row('cursors').sub(1)}));
  }

  add_client(client) {
    this._run_query(
      client_table.insert({
         connected: true, id: client.id,
         time: r.now(), ip: client.get_address()}));
  }

  remove_client(client) {
    this._run_query(
      request_table
       .between([client.id, r.minval], [client.id, r.maxval])
       .update({cursors: 0}));

    this._run_query(
      client_table
       .get(client.id)
       .update({connected: false, disconnected: r.now()}));
  }

  _run_query(query) {
    query.run(this.server._reql_conn.connection());
  }
}

module.exports = { Admin };
