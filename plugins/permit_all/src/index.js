'use strict';

module.exports = (raw_config) => ({
  name: (raw_config && raw_config.name) || 'permissions',

  activate: () => ({
    methods: {
      hz_permissions: {
        type: 'preReq',
        handler: (req, res, next) => {
          req.setParameter(() => null);
          next();
        },
      },
    },
  }),
});
