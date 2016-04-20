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
        done_cb(err);
      } else if (item.state === 'initializing') {
        // Do nothing - we don't care
      } else if (item.state === 'ready') {
        done_cb({ state: 'synced' });
      } else {
        if (!validate(rules, context, item)) {
          done_cb(new Error('Operation not permitted.'));
        } else {
          done_cb({ data: [ item ] });
        }
      }
    }, () => {
      done_cb({ state: 'complete' });
    });
  }, done_cb);
};

module.exports = { run };
