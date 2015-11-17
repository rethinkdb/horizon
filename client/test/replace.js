replaceSuite = (getData) => {
  return () => {

  var data;

  before(() => {
    data = getData();
  });

  // The `replace` command replaces documents already in the database. It
  // errors if the document doesn't exist.
  it("#.replace(single_non_existent)", (done) => {
    data.replace({ id: 1, a: 1, b: 1 }).catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // It means you can't replace a document without providing an id.
  it("#.replace(single_non_id)", (done) => {
    data.replace({ a: 1, b: 1 }).catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // Let's store a document first, then replace it.
  it("#.replace(single_existing)", (done) => {
    data.store({ id: 1, a: { b: 1, c: 1 }, d: 1 }).then((res) => {
      // The promise should return an array with an ID of the inserted
      // document.
      assert.deepEqual([1], res);

      // Let's make sure we get back the document that we put in.
      return data.find(1).value();
    }).then((res) => {
      // Check that we get back what we put in.
      assert.deepEqual({ id: 1, a: { b: 1, c: 1 }, d: 1 }, res);

      // Let's replace the document now
      return data.replace({ id: 1, a: { c: 2 } });
    }).then((res) => {
      // We should have gotten the ID back again
      assert.deepEqual([1], res);

      // Make sure `replace` replaced the original document
      return data.find(1).value();
    }).then((res) => {
      // Check that the document was updated correctly
      assert.deepEqual({ id: 1, a: { c: 2 } }, res);
      done();
    }).catch(done);
  });

  // Calling `replace` with `null` is an error.
  it("#.replace(null)", (done) => {
    data.replace(null).catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // Calling `replace` with `undefined` is also an error.
  it("#.replace(undefined)", (done) => {
    data.replace().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // The `replace` command allows storing multiple documents in one call.
  // Let's replace a few documents and make sure we get them back.
  it("#.replace(multiple)", (done) => {
    data.store([{ id: 1, a: { b: 1, c: 1 }, d: 1 },
                { id: 2, a: { b: 2, c: 2 }, d: 2 }]).then((res) => {
      // The promise should return an array with an ID of the inserted
      // document.
      assert.deepEqual([1, 2], res);

      // Let's make sure we get back the documents that we put in.
      return data.findAll(1, 2).value();
    }).then((res) => {
      // Check that we get back what we put in.
      assert.sameDeepMembers([{ id: 1, a: { b: 1, c: 1 }, d: 1 },
                              { id: 2, a: { b: 2, c: 2 }, d: 2 }],
                             res);

      // All right. Let's update the documents now
      return data.replace([{ id: 1, a: { c: 2 } },
                           { id: 2, d: 3 }]);
    }).then((res) => {
      // We should have gotten the ID back again
      assert.deepEqual([1, 2], res);

      // Make sure `update` updated the documents properly
      return data.findAll(1, 2).value();
    }).then((res) => {
      // Check that we get back what we put in.
      assert.sameDeepMembers([{ id: 1, a: { c: 2 } },
                              { id: 2, d: 3 }],
                             res);

      done();
    }).catch(done);
  });

  // If any operation in a batch update fails, everything is reported as a
  // failure. Note that we're updating `null` below, and a document with
  // no ID. Both are failures.
  it("#.replace(multiple_one_null)", (done) => {
    data.replace([{ id: 1, a: 1 }, null, { a: 1 }]).catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    });
  });

  // Replacing an empty batch of documents is ok, and returns an empty
  // array.
  it("#.replace(empty_batch)", (done) => {
    data.replace([]).then((res) => {
      // The promise should return an array with the IDs of the documents
      // in order, including the generated IDS.
      assert.isArray(res);
      assert.lengthOf(res, 0);
      done();
    }).catch(done);
  });

  } // Testing `replace`
}
