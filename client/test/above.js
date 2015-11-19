aboveSuite = (getData) => {
  return () => {

  var data;

  before(() => {
    data = getData();
  });

  // By default `above` is closed
  it("#.order(id).above(5)", (done) => {
    data.order('id').above({ id: 5 }).value().then((res) => {
      assert.deepEqual([{ id: 5, a: 50 },
                        { id: 6, a: 60 }], res);
      done();
    }).catch(done);
  });

  // We can also pass that explicitly
  it("#.order(id).above(5, closed)", (done) => {
    data.order('id').above({ id: 5 }, 'closed').value().then((res) => {
      assert.deepEqual([{ id: 5, a: 50 },
                        { id: 6, a: 60 }], res);
      done();
    }).catch(done);
  });

  // But we can make it open
  it("#.order(id).above(5, open)", (done) => {
    data.order('id').above({ id: 5 }, 'open').value().then((res) => {
      assert.deepEqual([{ id: 6, a: 60 }], res);
      done();
    }).catch(done);
  });

  // Let's try something that returns no values
  it("#.order(id).above(maxval)", (done) => {
    data.order('id').above({ id: 7 }).value().then((res) => {
      assert.deepEqual([], res);
      done();
    }).catch(done);
  });

  // We can chain `above` off a collection
  it("#.above({id:5})", (done) => {
    data.above({ id: 5 }).value().then((res) => {
      assert.isArray(res);
      assert.lengthOf(res, 2)
      done();
    }).catch(done);
  });

  // Or off other things
  it("#.findAll.above({id:5})", (done) => {
    data.findAll({ a: 20 }).above({ id: 3 }).value().then((res) => {
      assert.isArray(res);
      assert.lengthOf(res, 2)
      done();
    }).catch(done);
  });

  // `above` can't include any keys that are in `findAll`
  it("#.findAll(a).above(a)", (done) => {
    data.findAll({ a: 20 }).above({ a: 3 }).value().catch((res) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    }).catch(done);
  });

  // Let's try it on a non-primary key
  it("#.order([a,id]).above([20])", (done) => {
    data.order(['a', 'id']).above({ a: 20 }).value().then((res) => {
      assert.deepEqual([{ id: 2, a: 20, b: 1 },
                        { id: 3, a: 20, b: 2 },
                        { id: 4, a: 20, b: 3 },
                        { id: 5, a: 50 },
                        { id: 6, a: 60 }], res);
      done();
    }).catch(done);
  });

  // Let's try it on a non-primary key, but open
  it("#.order([a,id]).above([20], open)", (done) => {
    data.order(['a', 'id']).above({ a: 20 }).value().then((res) => {
      assert.deepEqual([{ id: 5, a: 50 },
                        { id: 6, a: 60 }], res);
      done();
    }).catch(done);
  });

  // The key in `above` must be the first key in `order`
  it("#.order([a,id]).above(id)", (done) => {
    data.order(['a', 'id']).above({ id: 20 }).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    })
  });

  // Passing multiple keys to `above` isn't legal
  it("#.order([a,id]).above(id)", (done) => {
    data.order(['a', 'id']).above({ a: 20, id: 20 }).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    })
  });

  // Nor is passing a field that isn't specified in `order`
  it("#.order([a,id]).above(other_field)", (done) => {
    data.order(['a', 'id']).above({ b: 20 }).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    })
  });

  // If chaining `above/below`, they must be passed the same key
  it("#.above(key1:5).below(key2: 6)", (done) => {
    data.above({ b: 0 }).below({ a: 100 }).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    }).catch(done);
  });

  // Starting with `null` is not ok
  it("#.above(null)", (done) => {
    data.above(null).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // Empty value is not ok
  it("#.above()", (done) => {
    data.above().value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // Bad arguments are not ok
  it("#.above(1)", (done) => {
    data.above(1).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });
  it("#.above(id:1, bad)", (done) => {
    data.above({ id: 1 }, 1).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  } // Testing `above`
}
