'use strict';

const {reqlOptions, reads} = require('@horizon/plugin-utils');

function makeAtomPatch(val, synced) {
  return {op: 'replace', path: '', value: {type: 'value', synced, val}};
}

function fetch(context) {
  return (req, res, next) => {
    const args = req.options.fetch;
    const isFind = Boolean(req.options.find);
    const permissions = req.getParameter('hz_permissions');

    if (args.length !== 0) {
      next(new Error(`"fetch" expects 0 arguments but found ${args.length}`));
    } else if (!permissions) {
      next(new Error('"fetch" requires permissions to run'));
    } else {
      reads.makeReadReql(context, req).then((rawReql) => {
        // In the case of 'find', we only want one result rather than an array
        // with just one element - force the reql result to be an array so we
        // don't have to unpack a single item from a cursor.
        const reql = isFind ? rawReql.coerceTo('array') : rawReql;
        return reql.run(context.horizon.conn(), reqlOptions);
      }).then((result) => {
        if (result !== null && result.constructor.name === 'Cursor') {
          const cleanup = () => result.close().catch(() => {});
          res.complete.then(cleanup).catch(cleanup);
          res.write(makeAtomPatch([], false));

          // TODO: reuse cursor batching
          return result.eachAsync((item) => {
            const validator = permissions();
            if (validator && !validator(item)) {
              next(new Error('Operation not permitted.'));
              cleanup();
            } else {
              res.write({op: 'add', path: '/val/-', value: item});
            }
          }).then(() => {
            res.end({op: 'replace', path: '/synced', value: true});
          });
        } else {
          const validator = permissions();
          if (result !== null && result.constructor.name === 'Array') {
            if (validator) {
              for (const item of result) {
                if (!validator(item)) {
                  throw new Error('Operation not permitted.');
                }
              }
            }
            if (isFind) {
              res.end(makeAtomPatch(result.length > 0 ? result[0] : null, true));
            } else {
              res.end(makeAtomPatch(result, true));
            }
          } else if (validator && !validator(result)) {
            next(new Error('Operation not permitted.'));
          } else {
            res.end(makeAtomPatch(result, true));
          }
        }
      }).catch(next);
    }
  };
}

module.exports = {
  name: 'hz_fetch',
  activate: (context) => ({
    methods: {
      fetch: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: fetch(context),
      },
    },
  }),
};
