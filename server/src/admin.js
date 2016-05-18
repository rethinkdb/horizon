'use strict';

const r = require('rethinkdb');

const admin_db = r.db('horizon_internal');
const client_table = admin_db.table('stats_clients');
const request_table = admin_db.table('stats_requests');

class Admin {
  constructor(server, enabled) {
    console.log("Stats enabled:", enabled);
    this.server = server;
    this.enabled = enabled;
  }

  clear_tables() {
    this._run_query(
      r.expr(["stats_clients", "stats_requests"])
       .forEach(admin_db.table(r.row).delete()));
  }

  add_request(req, client) {
    if (req.raw.type.startsWith("admin:")) return;
    
    let uR = client.socket.upgradeReq;
    
    this._run_query(
      request_table.insert({
        id: [client.id, req.id],
        request: req.id, raw: req.raw,
        time: r.now(), cursors: 0,
        client: {
          id: client.id,
          ip: uR.connection.remoteAddress,
          origin: uR.headers.origin
        }
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
         connected: true,
         id: client.id,
         time: r.now(),
         ip: client.socket.remoteAddress || null,
         origin: client.socket.request.headers.referer || null
      }));
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
    if (this.enabled)
      query.run(this.server._reql_conn.connection());
  }
}

module.exports = { Admin };
