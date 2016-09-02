'use strict';

const {ReliableMetadata} = require('./collection/metadata.js');

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
  const metadataSymbol = Symbol();

  return {
    name: 'hz_collection',
    activate: (ctx, onReady, onUnready) => {
      const metadata = new ReliableMetadata(
        ctx,
        options.auto_create_collection,
        options.auto_create_index);

      ctx[metadataSymbol] = metadata;

      metadata.subscribe({onReady: () => {
        console.log('metadata ready');
        onReady();
      }, onUnready});

      return {
        methods: {
          collection: {
            type: 'option',
            handler: collection(metadata),
          },
        },
      };
    },
    deactivate: (ctx) => {
      const metadata = ctx[metadataSymbol];
      if (metadata) {
        metadata.close();
      }
    },
  };
};
