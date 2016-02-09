'use strict'

const Event = require('geval')

module.exports = {
  DisposableEvent,
  MultiEvent,
  promiseOnEvents,
}

// A wrapper for geval Events that keeps track of removal functions
// and calls them all when the .dispose method is called on the event
function DisposableEvent(setupFunc) {
  let registry = []
  let listener = Event(setupFunc)

  function wrappedListener(eventhandler) {
    let remover = listener(eventhandler)
    registry.push(remover)

    return () => {
      removeFromArray(registry, remover)
      remover()
    }
  }

  wrappedListener.dispose = emptyAndCallAll(registry)
  wrappedListener.listenerCount = () => registry.length

  return wrappedListener
}

// Creates an object with multiple DisposablEvents within it
// Example:
// MultiEvent({
//    ham: (broadcastHam) => {/* decide when to broadcastHam */},
//    eggs: (broadcastEggs) => {/* decide when to broadcastEggs */},
//    dispose: (cleanupEvents) => {cleanupEvents(); console.log("Disposed!")}
// Will return:
// {
//   ham: Event,
//   eggs: Event,
//   dispose: () => {/* disposes ham and eggs then does console log*/},
// }
function MultiEvent(initializer) {
  let multiEvent = {}
  let registry = []

  let cleanupEvents = emptyAndCallAll(registry)

  // If the user specified a disposal function, we pass them the event
  // cleaner and return whatever they want to return
  if (initializer.dispose !== undefined) {
    multiEvent.dispose = () => initializer.dispose(cleanupEvents)
  } else {
    multiEvent.dispose = cleanupEvents
  }

  for (let key in initializer) {
    if (key === 'dispose') {
      continue
    }
    multiEvent[key] = DisposableEvent(initializer[key])
    registry.push(multiEvent[key].dispose)
    // Cleaning up any event will clean up all events
    multiEvent[key].dispose = multiEvent.dispose
  }

  return multiEvent
}

function promiseOnEvents(resolveEvent, rejectEvent) {
  let registry = []
  return (new Promise((resolve, reject) => {
    registry.push(resolveEvent(resolve))
    registry.push(rejectEvent(rejectVal => reject(new Error(JSON.stringify(rejectVal)))))
  })).then(
    success => {
      emptyAndCallAll(registry)
      return success
    },
    error => {
      emptyAndCallAll(registry)
      return error
    }
  )
}

function removeFromArray(registry, callback) {
  let index = registry.indexOf(callback)
  if (index !== -1) {
    registry.splice(index, 1)
  }
}

function emptyAndCallAll(registry) {
  return () => {
    registry.splice(0).forEach((func) => func())
  }
}
