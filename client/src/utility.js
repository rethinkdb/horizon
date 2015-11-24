require('babel-polyfill')
const EventEmitter = require('events').EventEmitter

// Handles hooking up a group of listeners to a FusionEmitter, and
// removing them all when certain events occur
class ListenerSet {
  constructor(emitter, {absorb: absorb=false}={}){
    this.emitter = emitter
    this.unregistry = []
    this.absorb = absorb
    let id = emitter.listenerSets++
    this.toString = () => `ListenerSet(${id}) on ${emitter}`
  }

  // Create a new ListenerSet. When the .dispose method is called, the
  // registered listeners will be removed from the underlying emitter.
  static onEmitter(emitter){
    return new ListenerSet(emitter)
  }

  // Create a new ListenerSet. When the ListenerSet is disposed the
  // underlying emitter will have its .dispose method called. The use
  // case for this is where the ListenerSet can consider itself to
  // "own" the underlying emitter.
  static absorbEmitter(emitter){
    return new ListenerSet(emitter, {absorb: true})
  }

  // Add a listener to the underlying emitter. When this ListenerSet's
  // .dispose method is called the listener will be removed.
  on(event, listener){
    this.unregistry.push(this.emitter.register(event, listener))
    return this
  }

  // The listener for this event will be invoked once and removed. The
  // listener is registered with the ListenerSet, so the listener will
  // be removed if the ListenerSet is called before the event occurs.
  once(event, listener){
    this.unregistry.push(this.emitter.registerOnce(event, listener))
    return this
  }

  // Forward events from the underlying emitter to the destination
  // emitter. The listener on the underlying emitter will be
  // registered in this ListenerSet and will be removed when the
  // ListenerSet is cleaned up
  fwd(srcEvent, dst, dstEvent=srcEvent){
    this.unregistry.push(this.emitter.fwd(srcEvent, dst, dstEvent))
    return this
  }

  // The given listener will be called once and then this ListenerSet
  // will clean itself up.
  onceAndDispose(event, listener){
    let wrappedListener = (...args) => {
      this.dispose("ListenerSet.onceAndDispose").then(() => listener(...args))
    }
    this.unregistry.push(this.emitter.registerOnce(event, wrappedListener))
    return this
  }

  // When the given event is emitted on the underlying EventEmitter
  // this ListenerSet will clean up all of its listeners
  disposeOn(event){
    this.unregistry.push(this.emitter.registerOnce(
      event, () => {
        this.dispose("ListenerSet.disposeOn")
      }))
    return this
  }

  // Clean up the listeners this ListenerSet owns if this is an
  // absorbing ListenerSet it cleans up the underlying emitter the
  // listeners were registered on.
  dispose(){
    let cleanup = () => this.unregistry.forEach(unregister => unregister())
    if(this.absorb){
      return this.emitter.dispose().then(() => {
        cleanup()
      })
    }else{
      return Promise.resolve().then(cleanup)
    }
  }

}

let emitterCount = 0

// Adds some convenience functions on EventEmitters that makes it
// easier to unregister a listener
class FusionEmitter extends EventEmitter {
  constructor(name=`FusionEmitter(${emitterCount++})`){
    super()
    this.listenerSets = 0
    this.toString = () => name
  }
  // Returns a function that can be called to remove the listener
  // Otherwise works the same as 'on' for the underlying socket
  register(event, listener){
    this.on(event, listener)
    return () => {
      this.removeListener(event, listener)
    }
  }

  // Similar to `register` but wraps `once` instead of `on`
  registerOnce(event, listener){
    this.once(event, listener)
    return () => {
      this.removeListener(event, listener)
    }
  }

  //Forwards events from the current emitter to another emitter,
  //returning an unregistration function
  fwd(srcEvent, dst, dstEvent=srcEvent){
    return this.register(srcEvent, (...args) => dst.emit(dstEvent, ...args))
  }

  //Create a promise from this emitter, accepts on the given event
  //and rejects on the second event which defaults to 'error'
  getPromise(acceptEvent, rejectEvent='error'){
    let listenerSet = ListenerSet.onEmitter(this)
    return this._makePromise(listenerSet, acceptEvent, rejectEvent)
  }

  // The same as getPromise, but disposes the event emitter when it's
  // resolved or rejected. The underlying EventEmitter shouldn't be
  // used.
  intoPromise(acceptEvent, rejectEvent='error'){
    let listenerSet = ListenerSet.absorbEmitter(this)
    return this._makePromise(listenerSet, acceptEvent, rejectEvent)
  }

  _makePromise(listenerSet, acceptEvent, rejectEvent){
    return new Promise((resolve, reject) => {
      listenerSet
        .onceAndDispose(acceptEvent, resolve)
        .onceAndDispose(rejectEvent, (err) => {
          reject(new Error(err.error))
        })
    })
  }

  // Listens for all 'response' events, adding them to an
  // internal array. Once a response comes in that has state: the
  // complete event, it resolves the promise with all of the values
  // obtained so far.  The promise is rejected if an error event is
  // raised.
  collectingPromise(addEvent='response', completeEvent='complete'){
    let listenerSet = ListenerSet.onEmitter(this)
    return this._collectPromise(listenerSet, addEvent, completeEvent)
  }

  // Same as collectingPromise except disposes the underlying
  // EventEmitter when it is resolved or rejected
  intoCollectingPromise(addEvent='response', completeEvent='complete'){
    let listenerSet = ListenerSet.absorbEmitter(this)
    return this._collectPromise(listenerSet, addEvent, completeEvent)
  }

  _collectPromise(listenerSet, addEvent, completeEvent){
    return new Promise((resolve, reject) => {
      let values = [];
      listenerSet
        .on(addEvent, (items) => {
          values.push(...items)
        }).onceAndDispose(completeEvent, () => {
          resolve(values)
        }).onceAndDispose('error', (err) => {
          reject(new Error(err.error))
        })
    })
  }
}

// Checks whether the return value is a valid primary or secondary
// index value
function validIndexValue(val){
  if(val == null){
    return false
  }
  if(['boolean', 'number', 'string'].indexOf(typeof val) !== -1){
    return true
  }
  if(Array.isArray(val)){
    let containsBad = false
    val.forEach((v) => {
      containsBad = containsBad || validIndexValue(v)
    })
    return containsBad
  }
  return false
}

function eventsToPromise(resolveEvent, rejectEvent){
  return new Promise((resolve, reject) => {
    resolveEvent(resolve)
    rejectEvent(reject)
  })
}


Object.assign(module.exports, {
  ListenerSet,
  FusionEmitter,
  validIndexValue,
  eventsToPromise,
})
