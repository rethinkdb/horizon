'use strict';

const {reqlOptions, reads} = require('@horizon/plugin-utils');
const hash = require('object-hash');

function makePointPatch(change) {
  if (change.new_offset != null) {
    return {op: 'replace', path: '/val', value: change.new_val};
  } else {
    return {op: 'replace', path: '/val', value: null};
  }
}

function makeArrayPatch(change) {
  const patch = [];
  if (change.old_offset != null) {
    patch.push({op: 'remove', path: `/val/${change.old_offset}`});
  }
  if (change.new_offset != null) {
    patch.push({op: 'add', path: `/val/${change.new_offset}`, value: change.new_val});
  }
  return patch;
}

function makeSetPatch(change) {
  const patch = [];
  const id = change.old_val ? change.old_val.id : change.new_val.id;
  const path = `/val/${hash(id)}`;
  if (change.old_val && change.new_val) {
    patch.push({op: 'replace', path, value: change.new_val});
  } else if (change.old_val) {
    patch.push({op: 'remove', path});
  } else if (change.new_val) {
    patch.push({op: 'add', path, value: change.new_val});
  }
  return patch;
}

function watch(context) {
  return (req, res, next) => {
    const args = req.options.watch;
    const permissions = req.getParameter('hz_permissions');

    if (args.length !== 0) {
      next(new Error(`"watch" expects 0 arguments but found ${args.length}`));
    } else if (!permissions) {
      next(new Error('"watch" requires permissions to run'));
    } else {
      const isFind = req.getParameter('find') !== undefined;
      const limited = isFind || (req.getParameter('limit') !== undefined);
      reads.makeReadReql(context, req).then((reql) =>
        reql.changes({
          includeInitial: true,
          includeStates: true,
          includeOffsets: limited,
        }).run(context.horizon.conn(), reqlOptions)
      ).then((feed) => {
        const cleanup = () => feed.close().catch(() => {});
        res.complete.then(cleanup).catch(cleanup);

        // TODO: reuse cursor batches
        return feed.eachAsync((item) => {
          if (item.state === 'initializing') {
            const val = isFind ? null : (limited ? [] : {});
            res.write({op: 'replace', path: '',
                       value: {type: limited ? 'value' : 'set',
                               synced: false, val}});
          } else if (item.state === 'ready') {
            res.write({op: 'replace', path: '/synced', value: true});
          } else {
            const validator = permissions();
            if (validator) {
              if ((item.old_val && !validator(item.old_val)) ||
                  (item.new_val && !validator(item.new_val))) {
                throw new Error('Operation not permitted.');
              }
            }
            if (isFind) {
              res.write(makePointPatch(item));
            } else if (limited) {
              res.write(makeArrayPatch(item));
            } else {
              res.write(makeSetPatch(item));
            }
          }
        });
      }).then(() => res.end()).catch(next);
    }
  };
}

module.exports = {
  name: 'hz_watch',
  activate: (context) => ({
    methods: {
      watch: {
        type: 'terminal',
        requires: ['hz_permissions'],
        handler: watch(context),
      },
    },
  }),
};
