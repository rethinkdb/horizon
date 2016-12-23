'use strict';

const {isObject, reqlOptions, writes} = require('@horizon/plugin-utils');

function removeAll(context) {
  return (req, res, next) => {
    if (req.options.removeAll.length != 1 ||
        !Array.isArray(req.options.removeAll[0])) {
      next(new Error('removeAll must be given an array of objects or ids'));
    }

    // Convert ids to rows
    const rows = req.options.removeAll[0].map((item) =>
      (isObject(item) ? item : {id: item})
    );

    writes.removeCommon([rows], req, context, reqlOptions)
      .then((patches) => {
        patches.map((patch) => res.write(patch));
        res.end();
      }).catch(next);
  };
}

module.exports = {
  name: 'hz_removeAll',
  activate: (context) => ({
    methods: {
      removeAll: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: removeAll(context),
      },
    },
  }),
};
