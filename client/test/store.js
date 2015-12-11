storeSuite = (getData) => {
  return () => {

  var data;

  before(() => {
    data = getData();
  });

  // The `store` command stores documents in the database, and overwrites
  // them if they already exist.
  it("#.store(single_then_overwrite)", (done) => {
    data.store({ id: 1, a: 1, b: 1 }).then((res) => {
      // The promise should return an array with an ID of the inserted
      // document.
      assert.deepEqual([1], res);

      // Let's make sure we get back the document that we put in.
      return data.find(1).value();
    }).then((res) => {
      // Check that we get back what we put in.
      assert.deepEqual({ id: 1, a: 1, b: 1 }, res);

      // Let's overwrite the document now
      return data.store({ id: 1, c: 1 });
    }).then((res) => {
      // We should have gotten the ID back again
      assert.deepEqual([1], res);

      // Make sure `store` overwrote the original document
      return data.find(1).value();
    }).then((res) => {
      // Check that we get back what we put in.
      assert.deepEqual({ id: 1, c: 1 }, res);
      done();
    }).catch(done);
  });

  // If we store a document without an ID, the ID is generated for us.
  // Let's run the same test as above (store the document and then
  // overwrite it), but have the ID be generated for us.
  it("#.store(single_no_id_then_overwrite)", (done) => {
    var new_id;

    data.store({ a: 1, b: 1 }).then((res) => {
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

      // Let's overwrite the document now
      return data.store({ id: new_id, c: 1 });
    }).then((res) => {
      // We should have gotten the ID back again
      assert.deepEqual([new_id], res);

      // Make sure `store` overwrote the original document
      return data.find(new_id).value();
    }).then((res) => {
      // Check that we get back what we put in.
      assert.deepEqual({ id: new_id, c: 1 }, res);
      done();
    }).catch(done);
  });

  // Storing `null` is an error.
  it("#.store(null)", (done) => {
    try {
      data.store(null);
    } catch(err) { done(); }
  });

  // Storing `undefined` is also an error.
  it("#.store(undefined)", (done) => {
    try {
      data.store();
    } catch(err) { done(); }
  });

  // The `store` command allows storing multiple documents in one call.
  // Let's store a few kinds of documents and make sure we get them back.
  it("#.store(multiple_some_empty)", (done) => {
    var new_id_0, new_id_1;

    data.store([{}, { a: 1 }, { id: 1, a: 1 }]).then((res) => {
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

  // If any operation in a batch store fails, everything is reported as a
  // failure. Note that we're storing `null` below, which is a failure.
  it("#.store(multiple_one_null)", (done) => {
    data.store([{ a: 1 }, null, { id: 1, a: 1 }]).catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // Storing an empty batch of documents is ok, and returns an empty
  // array.
  it("#.store(empty_batch)", (done) => {
    data.store([]).then((res) => {
      // The promise should return an array with the IDs of the documents
      // in order, including the generated IDS.
      assert.isArray(res);
      assert.lengthOf(res, 0);
      done();
    }).catch(done);
  });

  } // Testing `store`
}
