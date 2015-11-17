chainingSuite = (getData) => {
  return () => {

  var data;

  before(() => {
    data = getData();
  });

  // Let's do a biiig chain
  it("#.findAll.order.above.below", (done) => {
    data.findAll({ a: 20 })
        .order('id').above({ id: 2 }).below({ id: 4 })
        .value().then((res) => {
      assert.deepEqual([{ id: 2, a: 20, b: 1 },
                        { id: 3, a: 20, b: 2 }], res);
      done();
    }).catch(done);
  });

  // Let's flip it the other way and change the order
  it("#.findAll.below.above.order(desc)", (done) => {
    data.findAll({ a: 20 })
        .below({ id: 4 }).above({ id: 2 })
        .order('id', 'descending')
        .value().then((res) => {
      assert.deepEqual([{ id: 3, a: 20, b: 2 },
                        { id: 2, a: 20, b: 1 }], res);
      done();
    }).catch(done);
  });

  // Let's throw limit into the mix
  it("#.findAll.order.above.below.limit", (done) => {
    data.findAll({ a: 20 })
        .above({ id: 2 }).order('id').below({ id: 4 }).limit(1)
        .value().then((res) => {
      assert.deepEqual([{ id: 2, a: 20, b: 1 }], res);
      done();
    }).catch(done);
  });

  // Let's do it on the collection
  it("#.order.above.below.limit", (done) => {
    data.below({ id: 4 }).order('id').above({ id: 2 }).limit(1)
        .value().then((res) => {
      assert.deepEqual([{ id: 2, a: 20, b: 1 }], res);
      done();
    }).catch(done);
  });

  // Let's try a big compound example
  it("#.findAll.order([]).above.below.limit", (done) => {
    data.order(['a', 'id'])
        .above({ a: 20, id: 3 })
        .findAll({ b: 1 }, { id: 3 }, { b: 3 } )
        .below({ a: 20, id: 4 }, 'closed')
        .limit(2)
        .value().then((res) => {
      assert.deepEqual([{ id: 3, a: 20, b: 2 },
                        { id: 4, a: 20, b: 3 }], res);
      done();
    }).catch(done);
  });

  // Let's try it again, but now only with a prefix
  it("#.findAll.order([x, y]).above([x]).below", (done) => {
    data.order(['a', 'id'])
        .above({ a: 20 })
        .below({ a: 20, id: 4 }, 'closed')
        .findAll({ b: 1 }, { id: 3 }, { b: 3 } )
        .limit(2)
        .value().then((res) => {
      assert.deepEqual([{ id: 2, a: 20, b: 1 },
                        { id: 3, a: 20, b: 2 }], res);
      done();
    }).catch(done);
  });

  // Same, but `findAll` has more complex conditions, just to be sure this
  // works
  it("#.findAll({...}).order([x, y]).above([x]).below", (done) => {
    data.above({ a: 20 })
        .below({ a: 20, id: 4 }, 'closed')
        .findAll({ a: 20, b: 1 }, { id: 3 }, { id: 4, b: 3 } )
        .order(['a', 'id'])
        .limit(2)
        .value().then((res) => {
      assert.deepEqual([{ id: 2, a: 20, b: 1 },
                        { id: 3, a: 20, b: 2 }], res);
      done();
    }).catch(done);
  });

  } // Testing more advanced chaining
}
