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

  // Let's try it on a compound index
  it("#.order([a,id]).above([20,3])", (done) => {
    data.order(['a', 'id']).above({ a: 20, id: 3 }).value().then((res) => {
      assert.deepEqual([{ id: 3, a: 20, b: 2 },
                        { id: 4, a: 20, b: 3 },
                        { id: 5, a: 50 },
                        { id: 6, a: 60 }], res);
      done();
    }).catch(done);
  });

  // Let's try it on a compound index, but open
  it("#.order([a,id]).above([20,3], open)", (done) => {
    data.order(['a', 'id']).above({ a: 20, id: 3 }, 'open').value().then((res) => {
      assert.deepEqual([{ id: 4, a: 20, b: 3 },
                        { id: 5, a: 50 },
                        { id: 6, a: 60 }], res);
      done();
    }).catch(done);
  });

  // Just a prefix is ok
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

  // Let's try just a prefix, but open
  it("#.order([a,id]).above([20], open)", (done) => {
    data.order(['a', 'id']).above({ a: 20 }).value().then((res) => {
      assert.deepEqual([{ id: 5, a: 50 },
                        { id: 6, a: 60 }], res);
      done();
    }).catch(done);
  });

  // However, if the key is compound, passing a postfix isn't ok
  it("#.order([a,id]).above(id)", (done) => {
    data.order(['a', 'id']).above({ id: 20 }).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    })
  });

  // Nor is passing a random other field ok
  it("#.order([a,id]).above(other_field)", (done) => {
    data.order(['a', 'id']).above({ b: 20 }).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    })
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
