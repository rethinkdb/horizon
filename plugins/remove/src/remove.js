'use strict';

const {isObject, reqlOptions, writes} = require('@horizon/plugin-utils');

function remove(context) {
  return (req, res, next) => {
    if (req.options.remove.length !== 1) {
      next(new Error('remove must be given a single object or id'));
    }

    // Convert id to row
    const row = isObject(req.options.remove[0]) ?
      req.options.remove[0] : {id: req.options.remove[0]};

    writes.removeCommon([row], req, context, reqlOptions)
      .then((patches) => {
        patches.map((patch) => res.write(patch));
        res.end();
      }).catch(next);
  };
}

module.exports = {
  name: 'hz_remove',
  activate: (context) => ({
    methods: {
      remove: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: remove(context),
      },
    },
  }),
};
