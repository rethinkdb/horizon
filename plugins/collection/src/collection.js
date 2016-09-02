'use strict';

const ReliableMetadata = require('./metadata.js');
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
      metadata.collection(args[0]).then((c) => {
        // RSI: pick up here trucks here reads aren't getting this?
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
        options.auto_create_collection,
        options.auto_create_index);

      ctx[metadata].subscribe({onReady: () => {
        console.log('metadata ready');
        onReady();
      }, onUnready});

      return {
        methods: {
          collection: {
            type: 'option',
            handler: collection(ctx[metadata]),
          },
        },
      };
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
