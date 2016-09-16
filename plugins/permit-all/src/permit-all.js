'use strict';

module.exports = {
  name: 'hz_permissions',
  activate: () => ({
    methods: {
      hz_permissions: {
        type: 'prereq',
        handler: (req, res, next) => {
          req.setParameter(() => null);
          next();
        },
      },
    },
  }),
};
