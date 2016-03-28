'use strict';

const query = require('./query');
const logger = require('../logger');

const make_reql = (raw_request, metadata) => {
  return query.make_reql(raw_request, metadata).changes(
    { include_initial: true, include_states: true, include_types: true });
};

const handle_response = (request, feed, send_cb) => {
  request.add_cursor(feed);
  feed.each((err, item) => {
    if (err !== null) {
      send_cb({ error: `${err}` });
    } else if (item.state === 'initializing') {
      // Do nothing - we don't care
    } else if (item.state === 'ready') {
      send_cb({ state: 'synced' });
    } else {
      send_cb({ data: [ item ] });
    }
  }, () => {
    request.remove_cursor(feed);
    send_cb({ data: [ ], state: 'complete' });
  });
};

module.exports = { make_reql, handle_response };
