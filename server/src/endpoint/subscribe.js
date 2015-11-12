'use strict';

const query = require('./query');

const make_reql = (raw_request) => {
  return query.make_reql(raw_request).changes({ include_states: true });
};

const handle_response = (request, feed, send_cb) => {
  request.client.cursors.set(request.id, feed);
  feed.each((err, item) => {
      if (err !== null) {
        send_cb({ error: `${err}` });
      } else if (item.state === 'initializing') {
        // Do nothing - we don't care
      } else if (item.state === 'ready') {
        send_cb({ state: 'synced' });
      } else {
        send_cb({ data: [item] });
      }
    }, () => {
      request.client.cursors.delete(feed);
      send_cb({ data: [], state: 'complete' });
    });
};

module.exports = { make_reql, handle_response };
