'use strict';

const make_reql = require('./query').make_reql;
const validate = require('../permissions/rule').validate;

const run = (raw_request, context, rules, metadata, send_cb) => {
  let errored = false;
  const reql = make_reql(raw_request, metadata);

  reql.changes({ include_initial: true, include_states: true, include_types: true })
    .run(metadata.get_connection())
    .then((feed) =>
      feed.eachAsync((item) => {
        if (item.state === 'initializing') {
          // Do nothing - we don't care
        } else if (item.state === 'ready') {
          send_cb({ state: 'synced' });
        } else if (!validate(rules, context, item)) {
          errored = true;
          send_cb(new Error('Operation not permitted.'));
        } else {
          send_cb({ data: [ item ] });
        }
      }).then(() => {
        if (!errored) {
          send_cb({ state: 'complete' });
        }
      }))
    .catch(send_cb);
};

module.exports = { run };
