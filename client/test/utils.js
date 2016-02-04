'use strict'
function removeAllData(collection, done) {
  // Read all elements from the collection
  collection.fetch({ asCursor: false }) // all documents in the collection
    .flatMap(docs => collection.removeAll(docs))
    .flatMap(() => collection.fetch())
    .toArray()
    .do(remaining => assert.deepEqual([], remaining))
    .subscribe(doneObserver(done))
}

// Observe/expect infrastructure for subscriptions
var Observer = function(subscription, events) {
  this.em = subscription;
  let observable = Rx.Observable.create(observer => {
    let disposeResponse = subscription.onResponse(val => observer.onNext(val));
    let disposeError = subscription.onError(err => observer.onError(err));
    let disposeCompleted = subscription.onCompleted(() => observer.onCompleted());
    return () => function cleanup() {
      disposeResponse();
      disposeError();
      disposeCompleted();
    };
  });
  this.streams = _.map(events, (eType) => {
    return observable.filter(ev => ev.type === eType).map(x => {
      if(eType === 'changed') {
        return { new: x.new_val, old: x.old_val };
      } else {
        return x;
      }
    }).map((x) => {
      if(!x) { x = {}; }
      return x;
    });
  });
}

Observer.prototype.expect = function(ops, events, done, log) {
  // Create the event stream
  var res = (Rx.Observable.merge.apply(null, this.streams)
             .takeUntil(Rx.Observable.timer().toPromise().then(() => ops))
             .toArray()
             .toPromise());

  // All right, let's resolve this!
  res.then((res) => {
    if(log) {
      console.log(JSON.stringify(events));
      console.log(JSON.stringify(res));
    }
    assert.deepEqual(events, res, buildError(res, events));
    done();
  }).catch((err) => {
    done(err);
  }).finally;
}

// Used to subscribe to observables and call done appropriately
function doneObserver(done) {
  return Rx.Observer.create(
    () => {},
    err => done(new Error(err)),
    () => done()
  )
}

// Used to subscribe to observables when an error is expected
function doneErrorObserver(done) {
  return Rx.Observer.create(
    () => {},
    () => done(),
    () => done(new Error('Unexpectedly completed'))
  )
}

// Used to check for stuff that should throw an exception, rather than
// erroring the observable stream
function assertThrows(message, callback) {
  return done => {
    try {
      callback()
      done(new Error(`Didn't throw an exception`))
    } catch (err) {
      if (err.message === message) {
        done()
      } else {
        done(new Error(`Threw the wrong exception. ` +
                       `Expected "${message}", got "${err.message}"`))
      }
    }
  }
}

function buildError(expected, obtained) {
  return `Expected ${JSON.stringify(expected)} \n to equal ${JSON.stringify(obtained)}`
}

function observe(query, events) {
  return new Observer(query, events);
}

// Let's create a way to run promises in series
function inSeries(args) {
  if(args.length == 0) {
    throw new Error('Need at least one promise');
  } else if (args.length == 1) {
    return args[0]();
  } else {
    return args[0]().then((res) => {
      return inSeries(args.slice(1));
    });
  }
}
