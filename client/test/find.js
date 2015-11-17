findSuite = (getData) => {
  return () => {

  var data;

  before(() => {
    data = getData();
  });

  // Let's grab a specific document using `find`
  it("#.find(id)", (done) => {
    data.find(1).value().then((res) => {
      assert.deepEqual({ id: 1, a: 10 }, res);
      done();
    }).catch(done);
  });

  // This is equivalent to searching by field `id`
  it("#.find(id: X)", (done) => {
    data.find({ id: 1 }).value().then((res) => {
      assert.deepEqual({ id: 1, a: 10 }, res);
      done();
    }).catch(done);
  });

  // `find` returns `null` if a document doesn't exist.
  it("#.find(missing)", (done) => {
    data.find('abracadabra').value().then((res) => {
      assert.isNull(res);
      done();
    }).catch(done);
  });

  // Looking for `null` is an error. RethinkDB doesn't allow secondary
  // index values to be `null`.
  it("#.find(null)", (done) => {
    data.find(null).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // Looking for `undefined` is also an error.
  it("#.find(undefined)", (done) => {
    data.find().value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // The document passed to `find` can't be empty
  it("#.find({})", (done) => {
    data.find({}).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // We can also `find` by a different (indexed!) field. In that case,
  // `find` will return the first match.
  it("#.find(field)", (done) => {
    data.find({ a: 10 }).value().then((res) => {
      assert.deepEqual({ id: 1, a: 10 }, res);
      done();
    }).catch(done);
  });

  // Let's try this again for a value that doesn't exist.
  it("#.find(field_no_value)", (done) => {
    data.find({ a: 100 }).value().then((res) => {
      assert.isNull(res);
      done();
    }).catch(done);
  });

  // Let's try this again for a field that doesn't exist.
  it("#.find(field_no_field)", (done) => {
    data.find({ field: 'a' }).value().then((res) => {
      assert.isNull(res);
      done();
    }).catch(done);
  });

  // Let's try this again, now with multiple results.
  it("#.find(field_many_possible_values)", (done) => {
    data.find({ a: 20 }).value().then((res) => {
      // The id should be one of 2, 3, or 4
      assert.include([2, 3, 4], res['id']);
      done();
    }).catch(done);
  });

  // Users can pass multiple fields to look for
  it("#.find(multiple_fields)", (done) => {
    data.find({ a: 20, b: 1 }).value().then((res) => {
      assert.deepEqual({ id: 2, a: 20, b: 1 }, res);
      done();
    }).catch(done);
  });

  // In this case there is no matching document
  it("#.find(field_multiple_fields_no_result)", (done) => {
    data.find({ a: 20, c: 100 }).value().then((res) => {
      assert.isNull(res);
      done();
    }).catch(done);
  });

  // Passing multiple arguments to find should return a nice error
  it("#.find(arg1, arg2)", (done) => {
    data.find(1, { id: 1 }).value().then((res) => {
      done(new Error('Passing multiple arguments to `find` is illegal'));
    }).catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  } // Testing `find`
}
