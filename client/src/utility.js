'use strict'

require('babel-polyfill')
const Event = require('geval')


// Checks whether the return value is a valid primary or secondary
// index value
function validIndexValue(val) {
  if (val === null) {
    return false
  }
  if ([ 'boolean', 'number', 'string' ].indexOf(typeof val) !== -1) {
    return true
  }
  if (Array.isArray(val)) {
    let containsBad = false
    val.forEach(v => {
      containsBad = containsBad || validIndexValue(v)
    })
    return containsBad
  }
  return false
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
    let func = registry.pop()
    while (func !== undefined) {
      func()
      func = registry.pop()
    }
  }
}

// Helper method for terms that merges new fields into an existing
// object, throwing an exception if a field is merged in that already
// exists
function strictAssign(original, newFields) {
  Object.keys(newFields).forEach(key => {
    if (key in original) {
      throw new Error(`${key} is already defined.`)
    }
  })
  return Object.assign({}, original, newFields)
}

// A wrapper for geval Events that keeps track of removal functions
// and calls them all when the .dispose method is called on the event
function DisposableEvent(setupFunc) {
  let registry = []
  let listener = Event(setupFunc)

  function wrappedListener(eventhandler) {
    let remover = listener(eventhandler)
    let wrappedRemover = () => {
      removeFromArray(registry, remover)
      remover()
    }
    registry.push(remover)
    return wrappedRemover
  }

  wrappedListener.dispose = emptyAndCallAll(registry)

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
  let registry = []
  let multiEvent = {}
  for (let propName in initializer) {
    if (propName === 'dispose') {
      continue
    }
    let event = DisposableEvent(initializer[propName])
    multiEvent[propName] = event
    registry.push(event.dispose)
  }
  let cleanupEvents = emptyAndCallAll(registry)
  let disposeAll
  // If the user specified a disposal function, we pass them the event
  // cleaner and return whatever they want to return
  if (initializer.dispose !== undefined) {
    disposeAll = () => initializer.dispose(cleanupEvents)
  } else {
    disposeAll = cleanupEvents
  }
  multiEvent.dispose = disposeAll
  Object.keys(multiEvent).forEach(key => {
    // Cleaning up any event will clean up all events
    if (key !== 'dispose') {
      multiEvent[key].dispose = disposeAll
    }
  })
  return multiEvent
}

function ordinal(x) {
  if ([ 11, 12, 13 ].indexOf(x) !== -1) {
    return `${x}th`
  } else if (x % 10 === 1) {
    return `${x}st`
  } else if (x % 10 === 2) {
    return `${x}nd`
  } else if (x % 10 === 3) {
    return `${x}rd`
  }
  return `${x}th`
}

function setImmediate(callback) {
  return Promise.resolve().then(callback)
}

Object.assign(module.exports, {
  validIndexValue,
  MultiEvent,
  DisposableEvent,
  promiseOnEvents,
  strictAssign,
  ordinal,
  setImmediate,
})
