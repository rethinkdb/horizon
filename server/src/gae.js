'use strict';

const logger = require('./logger');
const auth_utils = require('./auth/utils');

const http = require('http');

const make_meta_request = (path) => {
  const req = http.request({
    protocol: 'http:',
    host: 'metadata.google.internal',
    path: `/computeMetadata/v1${path}`,
    headers: {
      'Metadata-Flavor': 'Google',
    } });
  req.setTimeout(750);
  return req;
};

const run_meta_request = (path, cb) => {
  auth_utils.run_request(make_meta_request(path), (err, body) => {
    if (err) {
      logger.error(`Failed to obtain GCE meta "${path}": ${err}`);
    }
    cb(err, body);
  });
};

const get_internal_ip = (cb) =>
  run_meta_request('/instance/network-interfaces/0/ip', cb);

const get_external_ip = (cb) =>
  run_meta_request('/instance/network-interfaces/0/access-configs/0/external-ip', cb);

const get_ips = (cb) => {
  get_internal_ip((err, internal_ip) => {
    if (err) {
      return cb(err);
    }
    get_external_ip((err2, external_ip) => {
      if (err2) {
        return cb(err2);
      }
      cb(null, {
        internal_ip,
        external_ip,
      });
    });
  });
};

module.exports = {
  get_ips,
  get_internal_ip,
  get_external_ip,
};