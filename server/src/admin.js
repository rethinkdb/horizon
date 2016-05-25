'use strict';

const r = require('rethinkdb');

const admin_db = r.db('horizondev_internal');
const client_table = admin_db.table('stats_clients');
const request_table = admin_db.table('stats_requests');

class Admin {
  constructor(server, enabled) {
    this.server = server;
    this.enabled = enabled;
  }

  clear_tables() {
    this._run_query(
      r.expr(["stats_clients", "stats_requests"])
       .forEach(admin_db.table(r.row).delete()));
  }

  add_request(req, client) {
    if (req._raw_request.type.startsWith("admin:")) return;
    
    let req_id = req._raw_request.request_id;
    
    this._run_query(
      request_table.insert({
        id: [client.id, req_id],
        request: req_id, raw: req._raw_request,
        time: r.now(), completed: false,
        client: {
          id: client.id,
          ip: client._socket.remoteAddress || null,
          origin: client._socket.request.headers.referer || null
        }
      }))
  }
  
  remove_request(req, client) {
    if (req._raw_request.type.startsWith("admin:")) return;
    
    this._run_query(
      request_table.get([client.id, req._raw_request.request_id])
                   .update({completed: r.now()}));
  }
  
  add_client(client) {
    this._run_query(
      client_table.insert({
         connected: true,
         id: client.id,
         time: r.now(),
         ip: client._socket.remoteAddress || null,
         origin: client._socket.request.headers.referer || null
      }));
  }

  remove_client(client) {
    this._run_query(
      request_table
       .between([client.id, r.minval], [client.id, r.maxval])
       .update({completed: r.now()}));

    this._run_query(
      client_table
       .get(client.id)
       .update({connected: false, disconnected: r.now()}));
  }

  _run_query(query) {
    if (this.enabled)
      return query.run(this.server._reql_conn.connection());
  }
}

module.exports = { Admin };
