'use strict';

const r = require('rethinkdb');
const subscribe = require('./subscribe').subscribe_handler;

const admin_db = r.db('horizondev_internal');
const client_table = admin_db.table('stats_clients');
const request_table = admin_db.table('stats_requests');
const server_table = admin_db.table('stats_servers');

module.exports = function(server) {
  return {
    clients: subscribe((req, metadata) => 
      client_table.getAll(true, {index: 'connected'})),
      
    requests: subscribe((req, metadata) => 
      (req.options.live ?
        request_table.getAll(false, {index: 'completed'}) :
        request_table.orderBy({index: r.desc('time')}).limit(100))),
        
    collections: subscribe((req, metadata) => 
      admin_db.table('collections')),
      
    servers: subscribe((req, metadata) =>  server_table)
  }
}
