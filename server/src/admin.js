'use strict';

const r = require('rethinkdb');
const os = require('os');

const admin_db = r.db('horizondev_internal');
const client_table = admin_db.table('stats_clients');
const request_table = admin_db.table('stats_requests');
const server_table = admin_db.table('stats_servers');

class Admin {
  constructor(server, enabled) {
    this.server = server;
    this.enabled = enabled;
    this.add_server();
    
    setInterval(() => this.update_server(), 1000 * 60 * 5);
  }

  clear_tables() {
    this._run_query(
      r.expr(["stats_clients", "stats_requests"])
       .forEach(admin_db.table(r.row).delete()));
  }
  
  add_server() {
    this._run_query(server_table.insert({
      id: this.server._id,
      heartbeat: r.now(),
      memoryUsage: process.memoryUsage().rss,
      hostname: os.hostname(),
      uptime: process.uptime()
    }));
  }
  
  update_server() {
    this._run_query(
      server_table.get(this.server._id).update({
        heartbeat: r.now(),
        memoryUsage: process.memoryUsage().rss,
        hostname: os.hostname(),
        uptime: process.uptime(),
      })
      .do(() =>
        server_table
          .between(r.minval, r.now().sub(60 * 10), {index: "heartbeat"})
          .forEach(server =>
            r.do(
              server_table.get(server("id")).delete(),
              client_table.getAll(server("id"), {index: "server"}).delete(), 
              request_table.getAll(server("id"), {index: "server"}).delete()))
      ));
  }

  add_request(req, client) {
    if (req._raw_request.type.startsWith("admin:")) return;
    
    let req_id = req._raw_request.request_id;
    
    this._run_query(
      request_table.insert({
        id: [client.id, req_id],
        server: this.server._id,
        request: req_id,
        raw: req._raw_request,
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
         server: this.server._id,
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
    if (!this.enabled) return;
    this.server._reql_conn.ready().then(() =>
      query.run(this.server._reql_conn.connection()));
  }
}

module.exports = { Admin };
