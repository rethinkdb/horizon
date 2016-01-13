'use strict'

require('babel-polyfill')

const { setImmediate } = require('./utility.js')
const { MultiEvent } = require('./events.js')
const { Rx } = require('./shim.js')

module.exports = Subscription

// This is the object returned for changefeed queries
function Subscription({ onResponse,
                       onError,
                       endSubscription,
                       onConnected,
                       onDisconnected,
                       userOptions: userOptions = {} } = {}) {
  let sub = {}
  let broadcastAdded,
    broadcastRemoved,
    broadcastChanged,
    broadcastValue,
    broadcastSynced,
    broadcastCompleted
  sub.onConnected = onConnected
  sub.onDisconnected = onDisconnected
  sub.onError = onError

  Object.assign(sub, MultiEvent({
    onAdded(broadcast) { broadcastAdded = broadcast },
    onRemoved(broadcast) { broadcastRemoved = broadcast },
    onChanged(broadcast) { broadcastChanged = broadcast },
    onValue(broadcast) { broadcastValue = broadcast },
    onSynced(broadcast) { broadcastSynced = broadcast },
    onCompleted(broadcast) { broadcastCompleted = broadcast },
    dispose(cleanupSubscriptionEvents) {
      return endSubscription().then(() => {
        setImmediate(() => {
          cleanupSubscriptionEvents()
          onResponse.dispose()
          onError.dispose()
        })
      })
    }
  }))

  StateManager(sub, broadcastValue)

  Object.keys(userOptions).forEach(key => {
    switch (key) {
    case 'onAdded':
    case 'onRemoved':
    case 'onChanged':
    case 'onValue':
    case 'onSynced':
    case 'onError':
    case 'onConnected':
    case 'onDisconnected':
    case 'onCompleted':
      sub[key](userOptions[key])
    }
  })

  let isAdded = c => c.new_val != null && c.old_val == null
  let isRemoved = c => c.new_val == null && c.old_val != null
  let isChanged = c => c.new_val != null && c.old_val != null

  onResponse(response => {
    // Response won't be an error since that's handled by the Fusion
    // object
    if (response.data !== undefined) {
      response.data.forEach(change => {
        if (isChanged(change)) {
          if (sub.onChanged.listenerCount() == 0) {
            broadcastRemoved(change.old_val)
            broadcastAdded(change.new_val)
          } else {
            broadcastChanged(change)
          }
        } else if (isAdded(change)) {
          broadcastAdded(change.new_val)
        } else if (isRemoved(change)) {
          broadcastRemoved(change.old_val)
        } else {
          console.error('Unknown object received on subscription: ', change)
        }
      })
    }
    if (response.state === 'synced') {
      broadcastSynced('synced')
    }
    if (response.state === 'complete') {
      broadcastCompleted('complete')
    }
  })

  // If the Rx module is available, create observables
  if (Rx) {
    Object.assign(sub, {
      observeChanged: observe(sub.onChanged, onError, sub.onCompleted),
      observeAdded: observe(sub.onAdded, onError, sub.onCompleted),
      observeRemoved: observe(sub.onRemoved, onError, sub.onCompleted),
      observeValue: observe(sub.onValue, onError, sub.onCompleted),
      observeConnected: observe(sub.onConnected, onError, sub.onCompleted),
      observeDisconnected: observe(sub.onDisconnected, onError, sub.onCompleted),
      observeSynced: observe(sub.onSynced, onError, sub.onCompleted),
    })
  }

  return sub

  function observe(next, error, completed, dispose = sub.dispose) {
    return (maybeDispose = dispose) => Rx.Observable.create(observer => {
      let disposeEvent = next(val => observer.onNext(val))
      let disposeError = error(err => observer.onError(err))
      let disposeCompleted = completed(() => observer.onCompleted())
      return () => maybeDispose(function cleanup() {
        disposeEvent()
        disposeError()
        disposeCompleted()
      })
    })
  }
}

function StateManager (subscription, emitter) {
  let data = []

  function changeHandler (row) {
    let i = findIndex(data, (val) => val.id === row.id)
    if (i === -1) {
      data.push(row)
    }
    else {
      data[i] = row;
    }

    emitter(data.slice(0), i, row)
  }

  function removeHandler (row) {
    let i = findIndex(data, (val) => val.id === row.id)
    if (i !== -1) {
      data.splice(i, 1)
    }

    emitter(data.slice(0), i, row)
  }

  subscription.onAdded(changeHandler)
  subscription.onChanged((change) => changeHandler(change.new_val))
  subscription.onRemoved(removeHandler)
}

function findIndex(arr, predicate) {
  let len = arr.length;

  for (let i = 0; i < len; i++) {
    let value = arr[i];
    if (predicate(value, i, arr)) {
      return i;
    }
  }
  return -1;
}
