'use strict';

// auth plugins should set 'request.context.user'
// token/anonymous: this should be the user id
// unauthenticated: this should be null, and will use the default rules

module.exports = (config) => {
  return {
    name: 'permissions',
    activate: (server) => {
      const reliable_conn = server.conn();
      const user_feeds = new Map();
      
      // TODO: need to save/close the subscription?
      reliable_conn.subscribe({
        onUnready: (reason) => {
          user_feeds.forEach((feed) => feed.close(reason));
          user_feeds.clear();
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
          },
          onUnready: () => {
          },
          onChange: () => {
          },
        });


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
              const user = request.context.user;
              if (user === undefined) {
                throw new Error('Client has not been authenticated');
              }

              // Create a changefeed for the user unless it exists
              if (user_feeds


              // Template-match the request options
              
              // Add a ruleset to request.context.rules

              // On changes to the user's groups, re-evaluate rules

              // On changes to the rules in any of the user's groups, re-evaluate rules
            },
          }
        },
      };
    },
  };
}
