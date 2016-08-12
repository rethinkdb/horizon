'use strict';

const logger = require('./logger');
const rule = require('./permissions/rule');

class Request {
  constructor(raw_request, endpoint, client) {
    this._raw_request = raw_request;
    this._ruleset = new rule.Ruleset();
    this._endpoint = endpoint;
    this._client = client;
    this.evaluate_rules();
  }

  evaluate_rules() {
    if (this._client._permissions_enabled) {
      const metadata = this._client._metadata;
      const user_info = this._client.user_info;
      const matching_rules = [ ];
      for (const group_name of user_info.groups) {
        const group = metadata.get_group(group_name);
        if (group !== undefined) {
          for (const r of group.rules) {
            if (r.is_match(this._raw_request, user_info)) {
              matching_rules.push(r);
            }
          }
        }
      }
      this._ruleset.update(matching_rules);
    } else {
      this._ruleset.update([ rule.any_rule ]);
    }
  }

  run() {
    let complete = false;
    try {
      if (this._ruleset.empty()) {
        throw new Error('Operation not permitted.');
      }
      this._cancel_cb = this._endpoint(this._raw_request,
                                       this._client.user_info,
                                       this._ruleset,
                                       this._client._metadata,
      (res) => {
        this._client.send_response(this._raw_request, res);
      },
      (res) => {
        // Only send something the first time 'done' is called
        if (!complete) {
          complete = true;
          if (res instanceof Error) {
            this.handle_error(res);
          } else if (res) {
            this._client.send_response(this._raw_request, res);
          }
          this._client.remove_request(this._raw_request);
        }
      });
    } catch (err) {
      this.handle_error(err);
    }
  }


  close() {
    this._ruleset.clear();
    if (this._cancel_cb) {
      this._cancel_cb();
    }
  }

  handle_error(err) {
    logger.debug(`Error on request ${this._raw_request.request_id}:\n${err.stack}`);

    // Ignore errors for disconnected clients
    if (this._client.is_open()) {
      this._client._metadata.handle_error(err, (inner_err) => {
        if (inner_err) {
          this._client.send_error(this._raw_request, inner_err);
        } else {
          setImmediate(() => this.run());
        }
      });
    }
  }
}

module.exports = { Request };
