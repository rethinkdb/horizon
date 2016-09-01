'use strict';

import {ReliableMetadata} from './metadata.js';

function collection(server, metadata) {
  return (req, res, next) => {
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
}

export default function(raw_config) {
  return {
    name: (raw_config && raw_config.name) || 'permissions',
    // RSI: make sure we check the arity and become ready if people
    // don't take the callbacks.
    activate: (server, onReady, onUnready) => {
      const metadata = new ReliableMetadata(
        server,
        raw_config.auto_create_collection,
        raw_config.auto_create_index);
      metadata.subscribe({onReady, onUnready});
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
  };
}
