insertSuite = (getData) => {
  return () => {

  var data;

  before(() => {
    data = getData();
  });

  // The `insert` command stores documents in the database, and errors if
  // the documents already exist.
  it("#.insert(single_then_attempt_overwrite)", (done) => {
    data.insert({ id: 1, a: 1, b: 1 }).then((res) => {
      // The promise should return an array with an ID of the inserted
      // document.
      assert.deepEqual([1], res);

      // Let's make sure we get back the document that we put in.
      return data.find(1).value();
    }).then((res) => {
      // Check that we get back what we put in.
      assert.deepEqual({ id: 1, a: 1, b: 1 }, res);

      // Let's attempt to overwrite the document now. This should error.
      data.insert({ id: 1, c: 1 }).catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    }).catch(done);
  });

  // If we insert a document without an ID, the ID is generated for us.
  // Let's run the same test as above (insert the document and then
  // attempt to overwrite it), but have the ID be generated for us.
  it("#.insert(single_no_id_then_attempt_overwrite)", (done) => {
    var new_id;

    data.insert({ a: 1, b: 1 }).then((res) => {
      // The promise should return an array with an ID of the inserted
      // document.
      assert.isArray(res);
      assert.lengthOf(res, 1);
      assert.isString(res[0]);
      new_id = res[0];

      // Let's make sure we get back the document that we put in.
      return data.find(new_id).value();
    }).then((res) => {
      // Check that we get back what we put in.
      assert.deepEqual({ id: new_id, a: 1, b: 1 }, res);

      // Let's attempt to overwrite the document now
      data.insert({ id: new_id, c: 1 }).catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    }).catch(done);
  });

  // Inserting `null` is an error.
  it("#.insert(null)", (done) => {
    try {
      data.insert(null);
    } catch(err) { done(); }
  });

  // Inserting `undefined` is also an error.
  it("#.insert(undefined)", (done) => {
    try {
      data.insert();
    } catch(err) { done(); }
  });

  // The `insert` command allows storing multiple documents in one call.
  // Let's insert a few kinds of documents and make sure we get them back.
  it("#.insert(multiple_some_empty)", (done) => {
    var new_id_0, new_id_1;

    data.insert([{}, { a: 1 }, { id: 1, a: 1 }]).then((res) => {
      // The promise should return an array with the IDs of the documents
      // in order, including the generated IDS.
      assert.isArray(res);
      assert.lengthOf(res, 3);
      assert.isString(res[0]);
      assert.isString(res[1]);
      assert.equal(1, res[2]);

      new_id_0 = res[0];
      new_id_1 = res[1];

      // Make sure we get what we put in.
      return data.findAll(new_id_0, new_id_1, 1).value();
    }).then((res) => {
      // We're supposed to get an array of documents we put in
      assert.sameDeepMembers([{ id: new_id_0 }, { id: new_id_1, a: 1 }, { id: 1, a: 1 }], res);
      done();
    }).catch(done);
  });

  // If any operation in a batch insert fails, everything is reported as a
  // failure.
  it("#.insert(multiple_one_failure)", (done) => {
    // Lets insert a document that will trigger a duplicate error when we
    // attempt to reinsert it
    data.insert({ id: 2, a: 2 }).then((res) => {
      // The promise should return an array with an ID of the inserted
      // document.
      assert.deepEqual([2], res);

      // Let's make sure we get back the document that we put in.
      return data.find(2).value();
    }).then((res) => {
      // Check that we get back what we put in.
      assert.deepEqual({ id: 2, a: 2 }, res);

      // One of the documents in the batch already exists
      data.insert([{ id: 1, a: 1 }, { id: 2, a: 2 }, { id: 3, a: 3 }]).catch((err) => {
        done();
      });
    }).catch(done);
  });

  // Let's trigger a failure in an insert batch again, this time by making
  // one of the documents `null`.
  it("#.insert(multiple_one_null)", (done) => {
    data.insert([{ a: 1 }, null, { id: 1, a: 1 }]).catch((err) => {
      done();
    });
  });

  // Inserting an empty batch of documents is ok, and returns an empty
  // array.
  it("#.insert(empty_batch)", (done) => {
    data.insert([]).then((res) => {
      // The promise should return an array with the IDs of the documents
      // in order, including the generated IDS.
      assert.isArray(res);
      assert.lengthOf(res, 0);
      done();
    }).catch(done);
  });

  } // Testing `insert`
}
