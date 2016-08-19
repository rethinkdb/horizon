'use strict';

// auth plugins should set 'request.context.user'
// token/anonymous: this should be the user id
// unauthenticated: this should be null, and will use the default rules


module.exports = (config) => {
  class User {
    constructor(user_id, reliable_conn) {
      this.feed = r.db(config.project_name)
                   .table(config.user_table)
                   .
    }

    group_changed(group_name) {
      if (this.data && this.data.groups && this.data.groups.indexOf(group_name) !== -1) {
        this.active_rulesets.forEach((ruleset) => );
      }
    }
    
    add_request(req, res, next) {
      // Create a changefeed for the user unless it exists

      // Template-match the request options
      
      // Add a ruleset to request.context.rules
      const ruleset = new Ruleset();
      request.context.rules = ruleset;
      this.active_rulesets.add(ruleset);

      const cleanup = () => this.active_rulesets.delete(ruleset);

      // On changes to the rules in any of the user's groups, re-evaluate rules

      // On response completion, stop tracking the ruleset
      res.complete.then(cleanup).catch(cleanup);
    }
  }

  return {
    name: 'permissions',
    activate: (server) => {
      const reliable_conn = server.conn();
      const users = new Map();
      const groups = new Map();
      const ready = false;
      
      // TODO: need to save/close the subscription?
      reliable_conn.subscribe({
        onUnready: (reason) => {
          users.forEach((user) => user.close(reason));
          users.clear();
        },
      });
      
      // Set up a reliable changefeed on the 'groups' table to track rules by group name
      const groups_feed = new ReliableChangefeed(
        r.db(server.project_name)
          .table('hz_groups')
          .changes({squash: false, includeInitial: true, includeTypes: true}),
        reliable_conn,
        {
          onReady: () => {
            ready = true;
          },
          onUnready: () => {
            ready = false;
            groups.forEach((g) => g.close());
            groups.clear();
          },
          onChange: (change) => {
            switch(change.type) {
            'initial':
            'add':
            'change':
              {
                const group = new Group(change.new_val);
                groups.set(group.name, group);
                users.forEach((user) => user.group_changed(group.name));
              }
              break;
            'uninitial':
            'remove':
              {
                const name = change.old_val.id;
                const group = groups.delete(change.old_val.id);
              }
              break;
            default:
              // RSI: log error
              break;
            }
          },
        });

      const get_user = (user_id) => {
        let user = users.get(user_id);
        if (!user) {
          user = new User(user_id, reliable_conn);
          users.set(user_id, user);
        }
        return user;
      };

      ctx.logger.info('Activating permissions.');
      return {
        deactivate: (reason) => {
          user_feeds.forEach((feed) => feed.close(reason));
          user_feeds.clear();
        },
        methods: {
          'permissions': {
            type: 'prereq',
            run: (req, res, next) => {
              if (!ready) {
                throw new Error('Groups are not synced with the server, cannot validate requests.');
              }

              const user_id = request.context.user_id;
              if (user_id !== undefined) {
                throw new Error('Client has not been authenticated');
              }

              // Find the user and register this request
              const user = get_user(user_id);
              user.add_request(req, res, next);
            },
          }
        },
      };
    },
  };
}

module.exports.validate = (rules, context, ...args) => [
  
}
