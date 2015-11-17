removeAllSuite = (getData) => {
  return () => {

  var data;
  var testData = [
    { id: 1, a: 1 },
    { id: 2, a: 2 },
    { id: 3, a: 3 },
    { id: 4, a: 4 },
    { id: 'do_not_remove_1' },
    { id: 'do_not_remove_2' }
  ];

  before(() => {
    data = getData();
  });

  // Drop all the existing data
  before((done) => {
    removeAllData(data, done);
  });

  // Insert the test data and make sure it's in
  before((done) => {
    data.store(testData).then((res) => {
        return data.value();
    }).then((res) => {
      // Make sure it's there
      assert.sameDeepMembers(testData, res);
      done();
    }).catch(done);
  });

  // All right, let's remove a document. The promise resolves with no
  // arguments.
  it("#.removeAll([id])", (done) => {
    data.removeAll([1]).then((res) => {
      assert.isUndefined(res);

      // Let's make sure the removed document isn't there
      return data.find(1).value();
    }).then((res) => {
      // Let's make sure the removed document isn't there
      assert.isNull(res);
      done();
    }).catch(done);
  });

  // Passing an array of objects to `removeAll` is also ok.
  it("#.removeAll([obj])", (done) => {
    data.removeAll([{ id: 2 }]).then((res) => {
      assert.isUndefined(res);

      // Let's make sure the removed document isn't there
      return data.find(2).value();
    }).then((res) => {
      // Let's make sure the removed document isn't there
      assert.isNull(res);
      done();
    }).catch(done);
  });

  // We can also remove multiple documents
  it("#.removeAll([id, obj])", (done) => {
    data.removeAll([3, 50, { id: 4 }]).then((res) => {
      assert.isUndefined(res);

      // Let's make sure the removed document isn't there
      return data.findAll(3, 50, 4).value();
    }).then((res) => {
      // Let's make sure the removed document isn't there
      assert.deepEqual([], res);
      done();
    }).catch(done);
  });

  // Removing a missing document shouldn't generate an error.
  it("#.removeAll([missing])", (done) => {
    data.removeAll(['abracadabra']).then((res) => {
      assert.isUndefined(res);
      done();
    }).catch(done);
  });

  // Calling `removeAll` with an empty array is also ok.
  it("#.removeAll([])", (done) => {
    data.removeAll([]).then((res) => {
      assert.isUndefined(res);
      done();
    }).catch(done);
  });

  // But an array with a `null` is an error.
  it("#.removeAll([null])", (done) => {
    data.removeAll([null]).catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // If one thing fails, everything is reported as a failure.
  it("#.removeAll([id, null, obj])", (done) => {
    data.removeAll([3, null, { id: 4 }]).catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // Calling `removeAll` with anything but a single array is an error.
  it("#.removeAll()", (done) => {
    data.removeAll().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });
  it("#.removeAll([a], b)", (done) => {
    data.removeAll([1], 2)
      .then(() => done(new Error("Should have gotten an error")))
      .catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      })
  });
  it("#.removeAll(null)", (done) => {
    data.removeAll(null).catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });
  it("#.removeAll(int)", (done) => {
    data.removeAll(1).catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });
  it("#.removeAll(string)", (done) => {
    data.removeAll('1').catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });
  it("#.removeAll(obj)", (done) => {
    data.removeAll({ 'id': 1 }).catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // Check that the remaining documents are there
  it("#.remove.check.remaining", (done) => {
    data.value().then((res) => {
      var _ids = _.pluck(res, 'id');
      assert.includeMembers(_ids, ['do_not_remove_1', 'do_not_remove_2']);
      done();
    }).catch(done);
  });

  } // Testing `removeAll`
}
