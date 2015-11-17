belowSuite = (getData) => {
  return () => {

  var data;

  before(() => {
    data = getData();
  });

  // By default `below` is open
  it("#.order(id).below(3)", (done) => {
    data.order('id').below({ id: 3 }).value().then((res) => {
      assert.deepEqual([{ id: 1, a: 10 },
                        { id: 2, a: 20, b: 1 }], res);
      done();
    }).catch(done);
  });

  // We can also pass that explicitly
  it("#.order(id).below(3, 'open')", (done) => {
    data.order('id').below({ id: 3 }, 'open').value().then((res) => {
      assert.deepEqual([{ id: 1, a: 10 },
                        { id: 2, a: 20, b: 1 }], res);
      done();
    }).catch(done);
  });

  // But we can make it closed
  it("#.order(id).below(3, 'closed')", (done) => {
    data.order('id').below({ id: 3 }, 'closed').value().then((res) => {
      assert.deepEqual([{ id: 1, a: 10 },
                        { id: 2, a: 20, b: 1 },
                        { id: 3, a: 20, b: 2 }], res);
      done();
    }).catch(done);
  });

  // Let's try something that returns no values
  it("#.order(id).below(minval)", (done) => {
    data.order('id').below({ id: 0 }).value().then((res) => {
      assert.deepEqual([], res);
      done();
    }).catch(done);
  });

  // We can chain `below` off a collection
  it("#.below({id:3})", (done) => {
    data.below({ id: 3 }).value().then((res) => {
      assert.isArray(res);
      assert.lengthOf(res, 2)
      done();
    }).catch(done);
  });

  // Or off other things
  it("#.findAll.below({id:5})", (done) => {
    data.findAll({ a: 20 }).below({ id: 4 }).value().then((res) => {
      assert.isArray(res);
      assert.lengthOf(res, 2)
      done();
    }).catch(done);
  });

  // Let's try it on a compound index
  it("#.order([a,id]).below([20,3])", (done) => {
    data.order(['a', 'id']).below({ a: 20, id: 3 }).value().then((res) => {
      assert.deepEqual([{ id: 1, a: 10 },
                        { id: 2, a: 20, b: 1 }], res);
      done();
    }).catch(done);
  });

  // Let's try it on a compound index, but closed
  it("#.order([a,id]).below([20,3], closed)", (done) => {
    data.order(['a', 'id']).below({ a: 20, id: 3 }, 'closed').value().then((res) => {
      assert.deepEqual([{ id: 1, a: 10 },
                        { id: 2, a: 20, b: 1 },
                        { id: 3, a: 20, b: 2 }], res);
      done();
    }).catch(done);
  });

  // Just a prefix is ok
  it("#.order([a,id]).below([20])", (done) => {
    data.order(['a', 'id']).below({ a: 20 }).value().then((res) => {
      assert.deepEqual([{ id: 1, a: 10 }], res);
      done();
    }).catch(done);
  });

  // Let's try just a prefix, but closed
  it("#.order([a,id]).below([20], closed)", (done) => {
    data.order(['a', 'id']).below({ a: 20 }, 'closed').value().then((res) => {
      assert.deepEqual([{ id: 1, a: 10 },
                        { id: 2, a: 20, b: 1 },
                        { id: 3, a: 20, b: 2 },
                        { id: 4, a: 20, b: 3 }], res);
      done();
    }).catch(done);
  });

  // However, if the key is compound, passing a postfix isn't ok
  it("#.order([a,id]).below(id)", (done) => {
    data.order(['a', 'id']).below({ id: 20 }).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    })
  });

  // Nor is passing a random other field ok
  it("#.order([a,id]).below(other_field)", (done) => {
    data.order(['a', 'id']).below({ b: 20 }).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    })
  });

  // Starting with `null` is not ok
  it("#.below(null)", (done) => {
    data.below(null).value().err((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // Empty value is not ok
  it("#.below()", (done) => {
    data.below().value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // Bad arguments are not ok
  it("#.below(1)", (done) => {
    data.below(1).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });
  it("#.below(id:1, bad)", (done) => {
    data.below({ id: 1 }, 1).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  } // Testing `below`
}
