upsertSuite = (getData) => {
  return () => {

  var data;

  before(() => {
    data = getData();
  });

  // The `uspert` command stores documents in the database, and updates
  // them if they already exist.
  it("#.upsert(single_then_update)", (done) => {
    data.upsert({ id: 1, a: { b: 1, c: 1 }, d: 1 }).then((res) => {
      // The promise should return an array with an ID of the inserted
      // document.
      assert.deepEqual([1], res);

      // Let's make sure we get back the document that we put in.
      return data.find(1).value();
    }).then((res) => {
      // Check that we get back what we put in.
      assert.deepEqual({ id: 1, a: { b: 1, c: 1 }, d: 1 }, res);

      // Let's update the document now
      return data.upsert({ id: 1, a: { c: 2 } });
    }).then((res) => {
      // We should have gotten the ID back again
      assert.deepEqual([1], res);

      // Make sure `upsert` updated the original document
      return data.find(1).value();
    }).then((res) => {
      // Check that the document was updated correctly
      assert.deepEqual({ id: 1, a: { b: 1, c: 2 }, d: 1 }, res);
      done();
    }).catch(done);
  });

  // If we upsert a document without an ID, the ID is generated for us.
  // Let's run the same test as above (store the document and then update
  // it), but have the ID be generated for us.
  it("#.upsert(single_no_id_then_update)", (done) => {
    var new_id;

    data.upsert({ a: { b: 1, c: 1 }, d: 1 }).then((res) => {
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
      assert.deepEqual({ id: new_id, a: { b: 1, c: 1 }, d: 1 }, res);

      // Let's update the document now
      return data.upsert({ id: new_id, a: { c: 2 } });
    }).then((res) => {
      // We should have gotten the ID back again
      assert.deepEqual([new_id], res);

      // Make sure `upsert` updated the original document
      return data.find(new_id).value();
    }).then((res) => {
      // Check that we get back what we put in.
      assert.deepEqual({ id: new_id, a: { b: 1, c: 2 }, d: 1 }, res);
      done();
    }).catch(done);
  });

  // Upserting `null` is an error.
  it("#.upsert(null)", (done) => {
    try {
      data.upsert(null);
    } catch(err) { done(); }
  });

  // Upserting `undefined` is also an error.
  it("#.upsert(undefined)", (done) => {
    try {
      data.store();
    } catch(err) { done(); }
  });

  // The `upsert` command allows storing multiple documents in one call.
  // Let's upsert a few kinds of documents and make sure we get them back.
  it("#.upsert(multiple_some_empty)", (done) => {
    var new_id_0, new_id_1;

    data.upsert([{}, { a: 1 }, { id: 1, a: 1 }]).then((res) => {
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
  it("#.upsert(multiple_one_null)", (done) => {
    data.upsert([{ a: 1 }, null, { id: 1, a: 1 }]).catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // Upserting an empty batch of documents is ok, and returns an empty
  // array.
  it("#.upsert(empty_batch)", (done) => {
    data.upsert([]).then((res) => {
      // The promise should return an array with the IDs of the documents
      // in order, including the generated IDS.
      assert.isArray(res);
      assert.lengthOf(res, 0);
      done();
    }).catch(done);
  });

  } // Testing `upsert`
}
