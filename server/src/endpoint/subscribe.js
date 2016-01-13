'use strict';

const query = require('./query');
const logger = require('../logger');

const make_reql = (raw_request, metadata) => {
  return query.make_reql(raw_request, metadata).changes(
    { include_initial: true, include_states: true });
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
      if (item.new_val !== null && item.old_val === null) {
        item.type = 'add';
      } else if (item.new_val === null && item.old_val !== null) {
        item.type = 'remove';
      } else if (item.new_val !== null && item.old_val !== null) {
        item.type = 'change';
      } else if (item.new_val !== undefined && item.old_val === undefined) {
        item.type = 'initial';
      } else if (item.new_val === undefined && item.old_val !== undefined) {
        item.type = 'uninitial';
      } else {
        logger.error(`Unrecognized changefeed response type: ${item}`);
      }
      send_cb({ data: [ item ] });
    }
  }, () => {
    request.remove_cursor(feed);
    send_cb({ data: [ ], state: 'complete' });
  });
};

module.exports = { make_reql, handle_response };
