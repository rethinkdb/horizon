'use strict';

const make_reql = require('./query').make_reql;
const reql_options = require('./common').reql_options;

const run = (raw_request, context, ruleset, metadata, send, done) => {
  let feed;
  const reql = make_reql(raw_request, metadata);

  reql.changes({ include_initial: true,
                 include_states: true,
                 include_types: true,
                 include_offsets: Boolean(raw_request.options.order) &&
                                  Boolean(raw_request.options.limit) })
    .run(metadata.connection(), reql_options)
    .then((res) => {
      feed = res;
      feed.eachAsync((item) => {
        if (item.state === 'initializing') {
          // Do nothing - we don't care
        } else if (item.state === 'ready') {
          send({ state: 'synced' });
        } else if ((item.old_val && !ruleset.validate(context, item.old_val)) ||
                   (item.new_val && !ruleset.validate(context, item.new_val))) {
          throw new Error('Operation not permitted.');
        } else {
          send({ data: [ item ] });
        }
      }).then(() => {
        done({ state: 'complete' });
      }).catch(done);
    }).catch(done);

  return () => {
    if (feed) {
      feed.close().catch(() => { });
    }
  };
};

module.exports = { run };
