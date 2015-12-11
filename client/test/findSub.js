findSubscriptionSuite = (getData) => {
  return () => {

  var data;

  before(() => {
    data = getData();
  });

  // Let's grab a specific document using `find`
  it("#.find(id, [added, removed])", (done) => {
    var query = data.find(1).subscribe();
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

  // Let's grab a specific document using `find` and also test the `changed`
  // event.
  it("#.find(id, [added, removed, changed])", (done) => {
    var query = data.find(1).subscribe();
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

  // Let's make sure we don't see events that aren't ours
  it("#.find(id):store(different_id)", (done) => {
    var query = data.find(1).subscribe();
    var x = observe(query,
      ['added', 'removed']);

    var ops = Promise.all([
      data.store({ id: 2, a: 1 }),
      data.store({ id: 2, a: 2 }),
      data.remove(2)]);

    x.expect(ops, [], done);
  });

  // Let's make sure initial vals works correctly
  it("#.find(initial+id, [added, removed])", (done) => {
    data.store({ id: 1, a: 1 }).then((res) => {
      var query = data.find(1).subscribe();
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

  } // Testing `find` subscriptions
}
