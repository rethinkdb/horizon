'use strict';

const collection = (server, metadata) => (req, res, next) => {
  const args = req.options.collection;
  if (args.length !== 1) {
    next(new Error(`"collection" expected 1 argument but found ${args.length}.`));
  } else if (typeof args[0] !== 'string') {
    next(new Error('First argument to "collection" must be a string.'));
  } else {
    metadata.collection(args[0]).then((collection) => {
      req.setParameter(collection);
      next();
    }).catch(next);
  }
};

module.exports = (raw_config) => ({
  name: (raw_config && raw_config.name) || 'permissions',
  activate: (server) => {
    const metadata = new ReliableMetadata(...);
    // RSI: instantiate metadata
    return {
      methods: {
        collection: {
          type: 'option',
          handler: collection(server, metadata),
        },
      },
      deactivate: () => metadata.close(),
    };
  },
});
