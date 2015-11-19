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
  it("#.findAll.order.above.below.limit", (done) => {
    data.findAll({ a: 20 })
        .order('id')
        .above({ id: 2 })
        .below({ id: 4 }, 'closed')
        .limit(2)
        .value().then((res) => {
      assert.deepEqual([{ id: 2, a: 20, b: 1 },
                        { id: 3, a: 20, b: 2 }], res);
      done();
    }).catch(done);
  });

  // Can't chain off vararg `findAll`
  it("#.findAll.order", (done) => {
    data.findAll({ a: 20 }, { a: 50 }).order('id').value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  } // Testing more advanced chaining
}
