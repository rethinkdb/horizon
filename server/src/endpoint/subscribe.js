'use strict';

const logger = require('../logger');
const make_reql = require('./query').make_reql;
const validate = require('../permissions/validator').validate;

const run = (raw_request, context, rules, metadata, done_cb) => {
  const reql = make_reql(raw_request, metadata);

  reql.changes({ include_initial: true, include_states: true, include_types: true })
      .run(metadata.get_connection())
      .then((feed) => {
    feed.each((err, item) => {
      if (err !== null) {
        send_cb(err);
      } else if (item.state === 'initializing') {
        // Do nothing - we don't care
      } else if (item.state === 'ready') {
        send_cb(null, { state: 'synced' });
      } else {
        if (!validate(rules, context, item)) {
          send_cb(new Error('Operation not permitted.'));
        } else {
          send_cb(null, { data: [ item ] });
        }
      }
    }, () => {
      send_cb(null, { state: 'complete' });
    });
  }, done_cb);
};

module.exports = { run };
