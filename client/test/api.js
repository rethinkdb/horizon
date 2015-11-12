chai.config.showDiff = true;
var assert = chai.assert;
var Fusion = require("Fusion");

function removeAllData(collection, done) {
  // Read all elements from the collection
  collection.value().then((res) => {
    var ids = [];

    // Get the ids out of each document
    for(var x of res) {
      ids.push(x['id']);
    }

    // Push something onto `ids`, 'cause remove is being annoying right now if
    // we're empty.
    ids.push(1);

    // TODO: semantics of remove are currently pretty bad; fix up this code when
    // they improve.

    return collection.remove(ids);
  }).then((res) => {
    // Make sure we deleted everything
    return collection.value();
  }).then((res) => {
    assert.lengthOf(res, 0);
    done();
  }).catch((err) => {
    done(err);
  });
}


// This test suite covers various edge cases in the Fusion client library API.
// It does not cover correctness of the full system in various circumstances.
// The purpose of the API test suite is to act as a runnable, checkable spec for
// API of the client library. This also doesn't cover subscriptions, there is a
// separate test suite for that.
describe("Fusion Client Library", () => {

  // Test the methods and event callbacks on the Fusion object.
  describe("Fusion Object API", () => {

    // Test object creation, the `dispose` method, and `connected/disconnected`
    // events.
    it("new Fusion()", (done) => {
      var fusion = new Fusion("localhost:8181", { secure: false });
      assert.isDefined(fusion);
      fusion.on('connected', (_fusion) => {
        // This event is fired every time the client connects to the Fusion
        // server. It should get fired even if the user registers the event
        // after the client is already connected. The callback should receive
        // the Fusion object as its argument.
        assert.equal(fusion, _fusion);

        // The dispose method fires the `disconnected` event (iff the client was
        // connected), then closes all connections and cleans up all resources
        // associated with the Fusion object.
        _fusion.dispose();
      }).on('disconnected', (_fusion) => {
        // This event should get fired every time the client disconnects from
        // the Fusion server. The callback should receive the Fusion object as
        // its argument.
        assert.equal(fusion, _fusion);
        done();
      });
    }); // "new Fusion()"

    // Test the `error` event.
    it("new Fusion().on('error')", (done) => {
      // Note -- the connection string specifies a bad host.
      var fusion = new Fusion("wrong_host", { secure: false });
      assert.isDefined(fusion);
      fusion.on('error', (err, _fusion) => {
        // This event is fired if there is an error connecting to the Fusion
        // server. The callback should receive the error message and the Fusion
        // object as its arguments.
        assert.isDefined(err);
        assert.isNotNull(err);
        assert.equal(fusion, _fusion);

        _fusion.dispose();
        done();
      });
    }); // "new Fusion().on('error')"
  }); // "Fusion Object API"

  // Test the core client library API
  describe("Core API tests", () => {
    // The connection for our tests
    var fusion;
    var data;

    // Set up the fusion connection before running these tests.
    before((done) => {
      fusion = new Fusion("localhost:8181", { secure: false });
      fusion.on('connected', () => {
        data = fusion('test_data');
        done();
      });
    });

    // Kill the fusion connection after running these tests.
    after((done) => {
      fusion.on('disconnected', () => done());
      fusion.dispose();
    });

    // Test the mutation commands
    describe("Storing API", () => {

      // Drop all data after each test
      afterEach((done) => {
        removeAllData(data, done);
      });

      describe("Testing `store`", () => {

        // The `store` command stores documents in the database, and overwrites
        // them if they already exist.
        it("#.store(single_then_overwrite)", (done) => {
          data.store({ id: 1, a: 1, b: 1 }).then((res) => {
            // The promise should return an array with an ID of the inserted
            // document.
            assert.deepEqual([1], res);

            // Let's make sure we get back the document that we put in.
            return data.findOne(1).value();
          }).then((res) => {
            // Check that we get back what we put in.
            assert.deepEqual({ id: 1, a: 1, b: 1 }, res);

            // Let's overwrite the document now
            return data.store({ id: 1, c: 1 });
          }).then((res) => {
            // We should have gotten the ID back again
            assert.deepEqual([1], res);

            // Make sure `store` overwrote the original document
            return data.findOne(1).value();
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
            return data.findOne(new_id).value();
          }).then((res) => {
            // Check that we get back what we put in.
            assert.deepEqual({ id: new_id, a: 1, b: 1 }, res);

            // Let's overwrite the document now
            return data.store({ id: new_id, c: 1 });
          }).then((res) => {
            // We should have gotten the ID back again
            assert.deepEqual([new_id], res);

            // Make sure `store` overwrote the original document
            return data.findOne(new_id).value();
          }).then((res) => {
            // Check that we get back what we put in.
            assert.deepEqual({ id: new_id, c: 1 }, res);
            done();
          }).catch(done);
        });

        // Storing `null` is an error.
        it("#.store(null)", (done) => {
          data.store(null).catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // Storing `undefined` is also an error.
        it("#.store(undefined)", (done) => {
          data.store().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
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
            return data.find(new_id_0, new_id_1, 1).value();
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

      }); // Testing `store`

      describe("Testing `insert`", () => {

        // The `insert` command stores documents in the database, and errors if
        // the documents already exist.
        it("#.insert(single_then_attempt_overwrite)", (done) => {
          data.insert({ id: 1, a: 1, b: 1 }).then((res) => {
            // The promise should return an array with an ID of the inserted
            // document.
            assert.deepEqual([1], res);

            // Let's make sure we get back the document that we put in.
            return data.findOne(1).value();
          }).then((res) => {
            // Check that we get back what we put in.
            assert.deepEqual({ id: 1, a: 1, b: 1 }, res);

            // Let's attempt to overwrite the document now. This should error.
            data.insert({ id: 1, c: 1 }).catch((err) => {
              assert.isDefined(err);
              assert.isNotNull(err);
              done();
            });
          });
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
            return data.findOne(new_id).value();
          }).then((res) => {
            // Check that we get back what we put in.
            assert.deepEqual({ id: new_id, a: 1, b: 1 }, res);

            // Let's attempt to overwrite the document now
            data.insert({ id: new_id, c: 1 }).catch((err) => {
              assert.isDefined(err);
              assert.isNotNull(err);
              done();
            });
          });
        });

        // Inserting `null` is an error.
        it("#.insert(null)", (done) => {
          data.insert(null).catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // Inserting `undefined` is also an error.
        it("#.insert(undefined)", (done) => {
          data.insert().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
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
            return data.find(new_id_0, new_id_1, 1).value();
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
            return data.findOne(2).value();
          }).then((res) => {
            // Check that we get back what we put in.
            assert.deepEqual({ id: 2, a: 2 }, res);

            // One of the documents in the batch already exists
            data.insert([{ id: 1, a: 1 }, { id: 2, a: 2 }, { id: 3, a: 3 }]).catch((err) => {
              done();
            });
          });
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

      }); // Testing `insert`

      describe("Testing `upsert`", () => {

        // The `uspert` command stores documents in the database, and updates
        // them if they already exist.
        it("#.upsert(single_then_update)", (done) => {
          data.upsert({ id: 1, a: { b: 1, c: 1 }, d: 1 }).then((res) => {
            // The promise should return an array with an ID of the inserted
            // document.
            assert.deepEqual([1], res);

            // Let's make sure we get back the document that we put in.
            return data.findOne(1).value();
          }).then((res) => {
            // Check that we get back what we put in.
            assert.deepEqual({ id: 1, a: { b: 1, c: 1 }, d: 1 }, res);

            // Let's update the document now
            return data.upsert({ id: 1, a: { c: 2 } });
          }).then((res) => {
            // We should have gotten the ID back again
            assert.deepEqual([1], res);

            // Make sure `upsert` updated the original document
            return data.findOne(1).value();
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
            return data.findOne(new_id).value();
          }).then((res) => {
            // Check that we get back what we put in.
            assert.deepEqual({ id: new_id, a: { b: 1, c: 1 }, d: 1 }, res);

            // Let's update the document now
            return data.upsert({ id: new_id, a: { c: 2 } });
          }).then((res) => {
            // We should have gotten the ID back again
            assert.deepEqual([new_id], res);

            // Make sure `upsert` updated the original document
            return data.findOne(new_id).value();
          }).then((res) => {
            // Check that we get back what we put in.
            assert.deepEqual({ id: new_id, a: { b: 1, c: 2 }, d: 1 }, res);
            done();
          }).catch(done);
        });

        // Upserting `null` is an error.
        it("#.upsert(null)", (done) => {
          data.upsert(null).catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // Upserting `undefined` is also an error.
        it("#.upsert(undefined)", (done) => {
          data.store().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
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
            return data.find(new_id_0, new_id_1, 1).value();
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
      }); // Testing `upsert`

      describe("Testing `update`", () => {

        // The `update` command updates documents already in the database. It
        // errors if the document doesn't exist.
        it("#.update(single_non_existent)", (done) => {
          data.update({ id: 1, a: 1, b: 1 }).catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // It means you can't update a document without providing an id.
        it("#.update(single_non_id)", (done) => {
          data.update({ a: 1, b: 1 }).catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // Let's store a document first, then update it.
        it("#.update(single_existing)", (done) => {
          data.store({ id: 1, a: { b: 1, c: 1 }, d: 1 }).then((res) => {
            // The promise should return an array with an ID of the inserted
            // document.
            assert.deepEqual([1], res);

            // Let's make sure we get back the document that we put in.
            return data.findOne(1).value();
          }).then((res) => {
            // Check that we get back what we put in.
            assert.deepEqual({ id: 1, a: { b: 1, c: 1 }, d: 1 }, res);

            // Let's update the document now
            return data.update({ id: 1, a: { c: 2 } });
          }).then((res) => {
            // We should have gotten the ID back again
            assert.deepEqual([1], res);

            // Make sure `upsert` updated the original document
            return data.findOne(1).value();
          }).then((res) => {
            // Check that the document was updated correctly
            assert.deepEqual({ id: 1, a: { b: 1, c: 2 }, d: 1 }, res);
            done();
          }).catch(done);
        });

        // Calling `update` with `null` is an error.
        it("#.update(null)", (done) => {
          data.update(null).catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // Calling `update` with `undefined` is also an error.
        it("#.update(undefined)", (done) => {
          data.update().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // The `update` command allows storing multiple documents in one call.
        // Let's update a few documents and make sure we get them back.
        it("#.update(multiple)", (done) => {
          data.store([{ id: 1, a: { b: 1, c: 1 }, d: 1 },
                      { id: 2, a: { b: 2, c: 2 }, d: 2 }]).then((res) => {
            // The promise should return an array with an ID of the inserted
            // document.
            assert.deepEqual([1, 2], res);

            // Let's make sure we get back the documents that we put in.
            return data.find(1, 2).value();
          }).then((res) => {
            // Check that we get back what we put in.
            assert.sameDeepMembers([{ id: 1, a: { b: 1, c: 1 }, d: 1 },
                                    { id: 2, a: { b: 2, c: 2 }, d: 2 }],
                                   res);

            // All right. Let's update the documents now
            return data.update([{ id: 1, a: { c: 2 } },
                                { id: 2, d: 3 }]);
          }).then((res) => {
            // We should have gotten the ID back again
            assert.deepEqual([1, 2], res);

            // Make sure `update` updated the documents properly
            return data.find(1, 2).value();
          }).then((res) => {
            // Check that we get back what we put in.
            assert.sameDeepMembers([{ id: 1, a: { b: 1, c: 2 }, d: 1 },
                                    { id: 2, a: { b: 2, c: 2 }, d: 3 }],
                                  res);

            done();
          }).catch(done);
        });

        // If any operation in a batch update fails, everything is reported as a
        // failure. Note that we're updating `null` below, and a document with
        // no ID. Both are failures.
        it("#.update(multiple_one_null)", (done) => {
          data.update([{ id: 1, a: 1 }, null, { a: 1 }]).catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // Updating an empty batch of documents is ok, and returns an empty
        // array.
        it("#.update(empty_batch)", (done) => {
          data.update([]).then((res) => {
            // The promise should return an array with the IDs of the documents
            // in order, including the generated IDS.
            assert.isArray(res);
            assert.lengthOf(res, 0);
            done();
          }).catch(done);
        });

      }); // Testing `update`

      describe("Testing `replace`", () => {

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
            return data.findOne(1).value();
          }).then((res) => {
            // Check that we get back what we put in.
            assert.deepEqual({ id: 1, a: { b: 1, c: 1 }, d: 1 }, res);

            // Let's replace the document now
            return data.replace({ id: 1, a: { c: 2 } });
          }).then((res) => {
            // We should have gotten the ID back again
            assert.deepEqual([1], res);

            // Make sure `replace` replaced the original document
            return data.findOne(1).value();
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
            return data.find(1, 2).value();
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
            return data.find(1, 2).value();
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

      }); // Testing `replace`

    }); // Storing API

    describe("Testing `remove`", () => {

      var testData = [
        { id: 1, a: 1 },
        { id: 2, a: 2 },
        { id: 3, a: 3 },
        { id: 'do_not_remove_1' },
        { id: 'do_not_remove_2' }
      ];

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
          return data.findOne(1).value();
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

      // It's also possible to remove multiple docuemnts. We'll throw in a
      // missing one, for good measure.
      it("#.remove(a, b, missing)", (done) => {
        data.remove(2, 3, 9).then((res) => {
          assert.isUndefined(res);

          // Let's make sure the documents aren't there
          return data.find(2, 3, 9).value();
        }).then((res) => {
          // Let's make sure the documents aren't there
          assert.deepEqual([], res);
          done();
        }).catch(done);
      });

      // Calling `remove` with no arguments is ok (because people will be using
      // it with `apply`)
      it("#.remove()", (done) => {
        data.remove().then((res) => {
          assert.isUndefined(res);
          done();
        }).catch(done);
      });

      // Passing an object to `remove` is an error because neither primary nor
      // secondary keys can be objects in RethinkDB. Also, we aren't doing `{
      // id: x }` destructuring.
      it("#.remove(obj)", (done) => {
        data.remove({ id: 'do_not_remove_1' }).catch((err) => {
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

    }); // Testing `remove`

    // Test the lookup API
    describe("Lookup API", () => {

      var testData = [
        { id: 1, a: 10 },
        { id: 2, a: 20 },
        { id: 3, a: 20 },
        { id: 4, a: 20 },
        { id: 5, a: 50 },
        { id: 6, a: 60 },
      ];

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

      // We'll also need a separate empty collection
      var empty_collection;
      before((done) => {
        empty_collection = fusion('empty_test_collection');
        removeAllData(empty_collection, done);
      });


      describe("Testing full collection read", () => {

        // Grab everything from the collection.
        it("#.collection", (done) => {
          data.value().then((res) => {
            assert.sameDeepMembers(testData, res);
            done();
          }).catch(done);
        });

        // Reading from an empty collection should result in an empty array
        it("#.empty_collection", (done) => {
          empty_collection.value().then((res) => {
            assert.sameDeepMembers([], res);
            done();
          }).catch(done);
        });

      });

      describe("Testing `findOne`", () => {

        // Let's grab a specific document using `findOne`
        it("#.findOne(id)", (done) => {
          data.findOne(1).value().then((res) => {
            assert.deepEqual({ id: 1, a: 10 }, res);
            done();
          }).catch(done);
        });

        // This is equivalent to searching by field `id`
        it("#.findOne(id, field:id)", (done) => {
          data.findOne(1, { field: 'id' }).value().then((res) => {
            assert.deepEqual({ id: 1, a: 10 }, res);
            done();
          }).catch(done);
        });

        // `findOne` returns `null` if a document doesn't exist.
        it("#.findOne(missing)", (done) => {
          data.findOne('abracadabra').value().then((res) => {
            assert.isNull(res);
            done();
          }).catch(done);
        });

        // Looking for `null` is an error. RethinkDB doesn't allow secondary
        // index values to be `null`.
        it("#.findOne(null)", (done) => {
          data.findOne(null).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // Looking for `undefined` is also an error.
        it("#.findOne(undefined)", (done) => {
          data.findOne().value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // We can also `findOne` by a different (indexed!) field. In that case,
        // `findOne` will return the first match.
        it("#.findOne(field)", (done) => {
          data.findOne(10, { field: 'a' }).value().then((res) => {
            assert.deepEqual({ id: 1, a: 10 }, res);
            done();
          }).catch(done);
        });

        // Let's try this again for a value that doesn't exist.
        it("#.findOne(field_no_value)", (done) => {
          data.findOne(100, { field: 'a' }).value().then((res) => {
            assert.isNull(res);
            done();
          }).catch(done);
        });

        // Let's try this again for a field that doesn't exist.
        it("#.findOne(field_no_field)", (done) => {
          data.findOne(1, { field: 'b' }).value().then((res) => {
            assert.isNull(res);
            done();
          }).catch(done);
        });

        // Let's try this again, now with multiple results.
        it("#.findOne(field_many_values)", (done) => {
          data.findOne(20, { field: 'a' }).value().then((res) => {
            // The id should be one of 2, 3, or 4
            assert.include([2, 3, 4], res['id']);
            done();
          }).catch(done);
        });

        // Searching for an object is an error because neither primary nor
        // secondary keys can be objects in RethinkDB. Also, we aren't doing `{
        // id: x }` destructuring.
        it("#.findOne(obj)", (done) => {
          data.findOne({ id: 1 }).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // Same for secondary key searches
        it("#.findOne(obj, field)", (done) => {
          data.findOne({ id: 20 }, { field: 'a' }).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

      }); // Testing `findOne`

      describe("Testing `find`", () => {

        // Let's grab a specific document using `find`
        it("#.find(id)", (done) => {
          data.find(1).value().then((res) => {
            assert.deepEqual([{ id: 1, a: 10 }], res);
            done();
          }).catch(done);
        });

        // This is equivalent to searching by field `id`
        it("#.find(id, field:id)", (done) => {
          data.find(1, { field: 'id' }).value().then((res) => {
            assert.deepEqual([{ id: 1, a: 10 }], res);
            done();
          }).catch(done);
        });

        // `find` returns `[]` if a document doesn't exist.
        it("#.find(missing)", (done) => {
          data.find('abracadabra').value().then((res) => {
            assert.deepEqual([], res);
            done();
          }).catch(done);
        });

        // We can also `find` by a different (indexed!) field.
        it("#.find(field)", (done) => {
          data.find(10, { field: 'a' }).value().then((res) => {
            assert.deepEqual([{ id: 1, a: 10 }], res);
            done();
          }).catch(done);
        });

        // Let's try this again for a value that doesn't exist.
        it("#.find(field_no_value)", (done) => {
          data.find(100, { field: 'a' }).value().then((res) => {
            assert.deepEqual([], res);
            done();
          }).catch(done);
        });

        // Let's try this again for a field that doesn't exist.
        it("#.find(field_no_field)", (done) => {
          data.find(1, { field: 'b' }).value().then((res) => {
            assert.equal([], res);
            done();
          }).catch(done);
        });

        // Let's try this again, now with multiple results.
        it("#.find(field_many_values)", (done) => {
          data.find(20, { field: 'a' }).value().then((res) => {
            // There are three docs where `a == 20`
            assert.sameDeepMembers([{ id: 2, a: 20 },
                                    { id: 3, a: 20 },
                                    { id: 4, a: 20 }],
                                   res);
            done();
          }).catch(done);
        });

        // Looking for `null` is an error since secondary index values cannot be
        // `null` in RethinkDB.
        it("#.find(null)", (done) => {
          data.find(null).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // No args is ok, because people will be using `apply`
        it("#.find(undefined)", (done) => {
          data.find().value().then((res) => {
            assert.deepEqual([], res);
            done();
          });
        });

        // Find lets us look for multiple documents. Let's try it on a primary
        // key.
        it("#.find(a, b)", (done) => {
          data.find(1, 2, 20).value().then((res) => {
            // There are three docs where `a == 20`
            assert.sameDeepMembers([{ id: 1, a: 10 },
                                    { id: 2, a: 20 }],
                                   res);
            done();
          }).catch(done);
        });

        // Let's try multiple documents on a secondary key.
        it("#.find(a, b, field)", (done) => {
          data.find(10, 20, 200, { field: 'a' }).value().then((res) => {
            // There are three docs where `a == 20`
            assert.sameDeepMembers([{ id: 1, a: 10 },
                                    { id: 2, a: 20 },
                                    { id: 3, a: 20 },
                                    { id: 4, a: 20 }],
                                   res);
            done();
          }).catch(done);
        });

        // Let's try it on a missing field
        it("#.find(a, b, field_no_field)", (done) => {
          data.find(1, 2, 200, { field: 'abracadabra' }).value().then((res) => {
            assert.equal([], res);
            done();
          }).catch(done);
        });

        // When one thing fails, everything fails.
        it("#.find(a, null, c)", (done) => {
          data.find(1, null, 2).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          }).catch(done);
        });

        // Let's try it again on a secondary key.
        it("#.find(a, null, c, field)", (done) => {
          data.find(10, null, 20, { field: 'a' }).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          }).catch(done);
        });

        // Searching for an object is an error because neither primary nor
        // secondary keys can be objects in RethinkDB. Also, we aren't doing `{
        // id: x }` destructuring.
        it("#.find(obj)", (done) => {
          data.find({ id: 1 }).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // Same for secondary key searches
        it("#.find(obj, field)", (done) => {
          data.find({ id: 20 }, { field: 'a' }).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

      }); // Testing `find`

    }); // Test the lookup API

  }); // Core API tests

}); // Fusion Client Library
