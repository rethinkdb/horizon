'use strict';

const query = require('./query');

const make_reql = (request) => {
  return query.make_reql(request).changes({ include_states: true });
};

const handle_response = (query, feed, send_cb) => {
  query.client.cursors.set(query.request.request_id, feed);
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
      query.client.cursors.delete(feed);
      send_cb({ data: [], state: 'complete' });
    });
};

module.exports = { make_reql, handle_response };
