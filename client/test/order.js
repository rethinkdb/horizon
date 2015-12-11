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

  // Let's try ordering by a different field.
  it("#.order(b)", (done) => {
    data.order('b').value().then((res) => {
      assert.deepEqual([{ id: 2, a: 20, b: 1 },
                        { id: 3, a: 20, b: 2 },
                        { id: 4, a: 20, b: 3 }], res.slice(3));
      done();
    }).catch(done);
  });

  // Let's try ordering by a different field descneding.
  it("#.order(b, 'descending')", (done) => {
    data.order('b', 'descending').value().then((res) => {
      assert.deepEqual([{ id: 4, a: 20, b: 3 },
                        { id: 3, a: 20, b: 2 },
                        { id: 2, a: 20, b: 1 }], res.slice(0, 3));
      done();
    }).catch(done);
  });

  // Let's try to order by a missing field
  it("#.order(missing)", (done) => {
    data.order('abracadabra').value().then((res) => {
      assert.sameDeepMembers(testData, res);
      done();
    }).catch(done);
  });

  // We can pass multiple fields to `order` to disambiguate.
  it("#.order([a, id])", (done) => {
    data.order(['a', 'id']).value().then((res) => {
      assert.deepEqual(_.sortByAll(testData, ['a', 'id']), res);
      done();
    }).catch(done);
  });

  // We can pass multiple fields to `order` to disambiguate. Let's do it in
  // descending order.
  it("#.order([a, id], desc)", (done) => {
    data.order(['a', 'id'], 'descending').value().then((res) => {
      assert.deepEqual(_.sortByAll(testData, ['a', 'id']).reverse(), res);
      done();
    }).catch(done);
  });

  // `order` cannot accept any keys that are present in `findAll`
  it("#.findAll(key).order(key)", (done) => {
    data.findAll({id: 1}).order('id').value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // Passing no arguments, null, bad arguments, or too many arguments is
  // an error.
  it("#.order()", (done) => {
    try {
      data.order().value();
    } catch(err) { done(); }
  });
  it("#.order(null)", (done) => {
    try {
      data.order(null).value();
    } catch(err) { done(); }
  });
  it("#.order(null, 'foo')", (done) => {
    try {
      data.order(null, 'foo').value();
    } catch(err) { done(); }
  });
  it("#.order('id', 'foo')", (done) => {
    data.order('id', 'foo').value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });
  it("#.order('id', 'ascending', 1)", (done) => {
    try {
      data.order('id', 'ascending', 1).value();
    } catch(err) { done(); }
  });

  } // Testing `order`
}
