aboveSubscriptionSuite = (getData) => {
  return () => {

  var data;

  before(() => {
    data = getData();
  });

  // Let's grab a specific document using `above`
  it("#.above(id, [added, removed])", (done) => {
    var query = data.above({id: 1}).subscribe();
    var x = observe(query,
      ['added', 'removed']);

    var ops = Promise.all([
      data.store({ id: 1, a: 1 }),
      data.store({ id: 1, a: 2 }),
      data.remove(1)]);

    x.expect(ops,
      [{type: 'added', a: 1, id: 1},
       {type: 'removed', a: 1, id: 1},
       {type: 'added', a: 2, id: 1},
       {type: 'removed', a: 2, id: 1}],
      done);
  });

  // Let's grab a specific document using `above` and also test the `changed`
  // event.
  it("#.above(id, [added, removed, changed])", (done) => {
    var query = data.above({id: 1}).subscribe();
    var x = observe(query,
      ['added', 'removed', 'changed']);

    var ops = Promise.all([
      data.store({ id: 1, a: 1 }),
      data.store({ id: 1, a: 2 }),
      data.remove(1)]);

    x.expect(ops,
      [{type: 'added', a: 1, id: 1},
       {type: 'changed',
        old: {id: 1, a: 1},
        new: {id: 1, a: 2}},
       {type: 'removed', a: 2, id: 1}],
      done);
  });

  // Secondary index, open
  it("#.above(a, open, [added, removed, changed])", (done) => {
    var query = data.above({a: 0}, 'open').subscribe();
    var x = observe(query,
      ['added', 'removed', 'changed']);

    var ops = Promise.all([
      data.store({ id: 1, a: 0 }),
      data.store({ id: 1, a: 1 }),
      data.store({ id: 1, a: 2 }),
      data.remove(1)]);

    x.expect(ops,
      [{type: 'added', a: 1, id: 1},
       {type: 'changed',
        old: {id: 1, a: 1},
        new: {id: 1, a: 2}},
       {type: 'removed', a: 2, id: 1}],
      done);
  });

  // Let's make sure we don't see events that aren't ours
  it("#.above(id):store(different_id)", (done) => {
    var query = data.above({id: 3}).subscribe();
    var x = observe(query,
      ['added', 'removed']);

    var ops = Promise.all([
      data.store({ id: 2, a: 1 }),
      data.store({ id: 2, a: 2 }),
      data.remove(2)]);

    x.expect(ops, [], done);
  });

  // Let's try subscribing to multiple IDs
  it("#.above(id, id2, [added, removed, changed])", (done) => {
    var query = data.above({id: 1}).below({id: 3}, 'open').subscribe();
    var x = observe(query,
      ['added', 'removed', 'changed']);

    var ops = inSeries([
      () => { return data.store({ id: 1, a: 1 }) },
      () => { return data.store({ id: 2, a: 1 }) },
      () => { return data.store({ id: 3, a: 1 }) },
      () => { return data.store({ id: 1, a: 2 }) },
      () => { return data.store({ id: 2, a: 2 }) },
      () => { return data.store({ id: 3, a: 2 }) },
      () => { return data.remove(1) },
      () => { return data.remove(2) },
      () => { return data.remove(3) }]);

    x.expect(ops,
      [{type: 'added', id: 1, a: 1},
       {type: 'added', id: 2, a: 1},
       {type: 'changed',
        old: {id: 1, a: 1},
        new: {id: 1, a: 2}},
       {type: 'changed',
        old: {id: 2, a: 1},
        new: {id: 2, a: 2}},
       {type: 'removed', id: 1, a: 2},
       {type: 'removed', id: 2, a: 2}],
      done);
  });

  // Let's make sure initial vals works correctly
  it("#.above(initial+id, [added, removed])", (done) => {
    data.store({ id: 1, a: 1 }).then((res) => {
      var query = data.above({id: 1}).subscribe();
      var x = observe(query,
        ['added', 'removed']);

      var ops = Promise.all([
        data.store({ id: 1, a: 2 }),
        data.remove(1)]);

      x.expect(ops,
        [{type: 'added', a: 1, id: 1},
         {type: 'removed', a: 1, id: 1},
         {type: 'added', a: 2, id: 1},
         {type: 'removed', a: 2, id: 1}],
        done);
    });
  });

  } // Testing `above` subscriptions
}
