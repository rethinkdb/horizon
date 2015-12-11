removeSuite = (getData) => {
  return () => {

  var data;
  var testData = [
    { id: 1, a: 1 },
    { id: 2, a: 2 },
    { id: 3, a: 3 },
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
  it("#.remove(id)", (done) => {
    data.remove(1).then((res) => {
      assert.isUndefined(res);

      // Let's make sure the removed document isn't there
      return data.find(1).value();
    }).then((res) => {
      // Let's make sure the removed document isn't there
      assert.isNull(res);
      done();
    }).catch(done);
  });

  // Passing an object to `remove` is also ok.
  it("#.remove(obj)", (done) => {
    data.remove({ id: 2 }).then((res) => {
      assert.isUndefined(res);

      // Let's make sure the removed document isn't there
      return data.find(2).value();
    }).then((res) => {
      // Let's make sure the removed document isn't there
      assert.isNull(res);
      done();
    }).catch(done);
  });

  // Removing a missing document shouldn't generate an error.
  it("#.remove(missing)", (done) => {
    data.remove('abracadabra').then((res) => {
      assert.isUndefined(res);
      done();
    }).catch(done);
  });

  // Calling `remove` with no arguments is an error
  it("#.remove()", (done) => {
    try {
      data.remove();
    } catch(err) { done(); }
  });

  // Calling `remove` with null is an error
  it("#.remove(null)", (done) => {
    try {
      data.remove(null);
    } catch(err) { done(); }
  });

  // Give an error if the user tries to use varargs (to help avoid
  // confusion)
  it("#.remove(too_many_args)", (done) => {
    try {
      data.remove(1, 2);
    } catch(err) { done(); }
  });

  // Check that the remaining documents are there
  it("#.remove.check.remaining", (done) => {
    data.value().then((res) => {
      var _ids = _.pluck(res, 'id');
      assert.includeMembers(_ids, ['do_not_remove_1', 'do_not_remove_2']);
      done();
    }).catch(done);
  });

  } // Testing `remove`
}
