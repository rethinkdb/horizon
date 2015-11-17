orderSuite = (getData, getTestData) => {
  return () => {

  var data, testData;

  before(() => {
    data = getData();
    testData = getTestData();
  });

  // We can order by a field (default order is ascending)
  it("#.order(id)", (done) => {
    data.order('id').value().then((res) => {
      assert.deepEqual(testData, res);
      done();
    }).catch(done);
  });

  // That's the same as passing `ascending` explicitly
  it("#.order(id, 'ascending')", (done) => {
    data.order('id', 'ascending').value().then((res) => {
      assert.deepEqual(testData, res);
      done();
    }).catch(done);
  });

  // We can also sort in descending order
  it("#.order(id, 'descending')", (done) => {
    data.order('id', 'descending').value().then((res) => {
      assert.deepEqual(_.cloneDeep(testData).reverse(), res);
      done();
    }).catch(done);
  });

  // Let's try ordering by a different field. Currently RethinkDB will
  // only return documents that have a field `b`, but this will some day
  // change.
  it("#.order(b, 'descending')", (done) => {
    data.order('b', 'descending').value().then((res) => {
      assert.deepEqual([{ id: 4, a: 20, b: 3 },
                        { id: 3, a: 20, b: 2 },
                        { id: 2, a: 20, b: 1 }], res);
      done();
    }).catch(done);
  });

  // Let's try to order by a missing field
  it("#.order(missing, 'descending')", (done) => {
    data.order('abracadabra').value().then((res) => {
      assert.deepEqual([], res);
      done();
    }).catch(done);
  });

  // We can pass multiple fields to `order` to disambiguate.
  it("#.order([a, id])", (done) => {
    data.order(['a', 'id']).value().then((res) => {
      assert.deepEqual(testData, res);
      done();
    }).catch(done);
  });

  // Passing no arguments, null, bad arguments, or too many arguments is
  // an error.
  it("#.order()", (done) => {
    data.order().value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });
  it("#.order(null)", (done) => {
    data.order(null).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });
  it("#.order(null, 'foo')", (done) => {
    data.order(null, 'foo').value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });
  it("#.order('id', 'foo')", (done) => {
    data.order('id', 'foo').value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });
  it("#.order('id', 'ascending', 1)", (done) => {
    data.order('id', 'ascending', 1).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  } // Testing `order`
}
