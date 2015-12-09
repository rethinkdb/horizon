function removeAllData(collection, done) {
  // Read all elements from the collection
  collection.value().then((res) => {
    // Now drop these elements
    return collection.removeAll(res);
  }).then((res) => {
    // Make sure we deleted everything
    return collection.value();
  }).then((res) => {
    assert.deepEqual([], res);
    done();
  }).catch((err) => {
    done(err);
  });
}

// Observe/expect infrastructure for subscriptions
var Observer = function(subscription, events) {
  this.em = subscription;
  this.streams = _.map(events, (e) => {
    return observableFor(subscription, e).map((x) => {
      if(e === 'changed') {
        return { new: x.new_val, old: x.old_val };
      } else {
        return x;
      }
    }).map((x) => {
      if(!x) { x = {}; }
      x['type'] = e;
      return x;
    });
  });

  function observableFor(sub, e) {
    switch(e) {
    case 'changed': return sub.observeChanged();
    case 'added': return sub.observeAdded();
    case 'removed': return sub.observeRemoved();
    default: throw new Error('Event type "' + e + '" not recognized')
    }
  }
}

Observer.prototype.expect = function(ops, events, done, log) {
  // Create the event stream
  var res = (Rx.Observable.merge.apply(null, this.streams)
               .takeUntil(ops)
               .toArray()
               .toPromise());

  // All right, let's resolve this!
  res.then((res) => {
    if(log) {
      console.log(JSON.stringify(events));
      console.log(JSON.stringify(res));
    }
    assert.deepEqual(events, res);
    done();
  }).catch((err) => {
    done(err);
  }).finally;
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
