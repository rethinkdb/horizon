'use strict';

const ReliableMetadata = require('./types/metadata.js');
const queries = require('./queries');
const indexes = require('./indexes');

function collection(metadata) {
  return (req, res, next) => {
    const args = req.options.collection;
    if (args.length !== 1) {
      next(new Error(`"collection" expected 1 argument but found ${args.length}.`));
    } else if (typeof args[0] !== 'string') {
      next(new Error('First argument to "collection" must be a string.'));
    } else {
      new Promise((resolve, reject) => {
        if (metadata.ready) {
          resolve();
        } else {
          // Wait up to 5 seconds for metadata readiness
          // This should only happen if the connection to the database just recovered,
          // or there is some invalid data in the metadata.
          const subs = metadata.subscribe({
            onReady: () => {
              subs.close();
              clearTimeout(timer);
              resolve();
            },
          });

          const timer = setTimeout(() => {
            reject(new Error('Timed out waiting for metadata ' +
                             'to sync with the database.'));
          }, 5000);
        }
      }).then(() => metadata.collection(args[0])).then((c) => {
        req.setParameter(c);
        next();
      }).catch(next);
    }
  };
}

module.exports = (options) => {
  const metadata = Symbol('hz_collection_metadata');

  return {
    name: 'hz_collection',
    activate: (ctx, onReady, onUnready) => {
      ctx[metadata] = new ReliableMetadata(
        ctx,
        Boolean(options.auto_create_collection),
        Boolean(options.auto_create_index));

      return new Promise((resolve, reject) => {
        ctx[metadata].subscribe({onUnready, onReady: () => {
          resolve({
            methods: {
              collection: {
                type: 'option',
                handler: collection(ctx[metadata]),
              },
            },
          });
          onReady();
        }});
      });
    },
    deactivate: (ctx) => {
      if (ctx[metadata]) {
        ctx[metadata].close();
      }
    },
  };
};

module.exports.createCollection = queries.createCollection;
module.exports.initializeMetadata = queries.initializeMetadata;
module.exports.indexNameToInfo = indexes.indexNameToInfo;
module.exports.indexInfoToName = indexes.indexInfoToName;
module.exports.indexInfoToReql = indexes.indexInfoToReql;
