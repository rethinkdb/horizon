chai.config.showDiff = true;
var assert = chai.assert;
var Fusion = require("Fusion");

function removeAllData(collection, done) {
  // Read all elements from the collection
  collection.value().then((res) => {
    // Now drop these elements
    return collection.removeAll(res);
  }).then((res) => {
    // Make sure we deleted everything
    return collection.value();
  }).then((res) => {
    assert.deepEqual([], res);
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
      }).on('error', done)
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
            return data.find(1).value();
          }).then((res) => {
            // Check that we get back what we put in.
            assert.deepEqual({ id: 1, a: { b: 1, c: 1 }, d: 1 }, res);

            // Let's update the document now
            return data.update({ id: 1, a: { c: 2 } });
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
            return data.findAll(1, 2).value();
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
            return data.findAll(1, 2).value();
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
        data.remove().catch((err) => {
          assert.isDefined(err);
          assert.isNotNull(err);
          done();
        }).catch(done);
      });

      // Calling `remove` with null is an error
      it("#.remove(null)", (done) => {
        data.remove(null).catch((err) => {
          assert.isDefined(err);
          assert.isNotNull(err);
          done();
        }).catch(done);
      });

      // Give an error if the user tries to use varargs (to help avoid
      // confusion)
      it("#.remove(too_many_args)", (done) => {
        data.remove(1, 2).catch((err) => {
          assert.isDefined(err);
          assert.isNotNull(err);
          done();
        }).then((val) => done(new Error(`Didn't fail ${val}`)));
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

    describe("Testing `removeAll`", () => {

      var testData = [
        { id: 1, a: 1 },
        { id: 2, a: 2 },
        { id: 3, a: 3 },
        { id: 4, a: 4 },
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

    }); // Testing `removeAll`


    // Test the lookup API
    describe("Lookup API", () => {

      var testData = [
        { id: 1, a: 10 },
        { id: 2, a: 20, b: 1 },
        { id: 3, a: 20, b: 2 },
        { id: 4, a: 20, b: 3 },
        { id: 5, a: 60 },
        { id: 6, a: 50 },
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

      describe("Testing `find`", () => {

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

      }); // Testing `find`

      describe("Testing `findAll`", () => {

        // Let's grab a specific document using `findAll`
        it("#.findAll(id)", (done) => {
          data.findAll(1).value().then((res) => {
            assert.deepEqual([{ id: 1, a: 10 }], res);
            done();
          }).catch(done);
        });

        // This is equivalent to searching by field `id`
        it("#.findAll(id: X)", (done) => {
          data.findAll({ id: 1 }).value().then((res) => {
            assert.deepEqual([{ id: 1, a: 10 }], res);
            done();
          }).catch(done);
        });

        // `findAll` returns `[]` if a document doesn't exist.
        it("#.findAll(missing)", (done) => {
          data.findAll('abracadabra').value().then((res) => {
            assert.deepEqual([], res);
            done();
          }).catch(done);
        });

        // We can also `findAll` by a different (indexed!) field.
        it("#.findAll(field)", (done) => {
          data.findAll({ a: 10 }).value().then((res) => {
            assert.deepEqual([{ id: 1, a: 10 }], res);
            done();
          }).catch(done);
        });

        // Let's try this again for a value that doesn't exist.
        it("#.findAll(field_no_value)", (done) => {
          data.findAll({ a: 100 }).value().then((res) => {
            assert.deepEqual([], res);
            done();
          }).catch(done);
        });

        // Let's try this again for a field that doesn't exist.
        it("#.findAll(field_no_field)", (done) => {
          data.findAll({ field: 'a' }).value().then((res) => {
            assert.deepEqual([], res);
            done();
          }).catch(done);
        });

        // Let's try this again, now with multiple results.
        it("#.findAll(field_many_values)", (done) => {
          data.findAll({ a: 20 }).value().then((res) => {
            // There are three docs where `a == 20`
            assert.sameDeepMembers([{ id: 2, a: 20, b: 1 },
                                    { id: 3, a: 20, b: 2 },
                                    { id: 4, a: 20, b: 3 }],
                                   res);
            done();
          }).catch(done);
        });

        // Looking for `null` is an error since secondary index values cannot be
        // `null` in RethinkDB.
        it("#.findAll(null)", (done) => {
          data.findAll(null).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          }).catch(done);
        });

        // Looking for an empty object is also an error
        it("#.findAll({})", (done) => {
          data.findAll({}).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          }).catch(done);
        });

        // No args is ok, because people will be using `apply`
        it("#.findAll(undefined)", (done) => {
          data.findAll().value().then((res) => {
            assert.deepEqual([], res);
            done();
          }).catch(done);
        });

        // `findAll` lets us look for multiple documents. Let's try it on a primary
        // key.
        it("#.findAll(a, {id: b}, missing)", (done) => {
          data.findAll(1, { id: 2 }, 20).value().then((res) => {
            // There are three docs where `a == 20`
            assert.sameDeepMembers([{ id: 1, a: 10 },
                                    { id: 2, a: 20, b: 1 }],
                                   res);
            done();
          }).catch(done);
        });

        // Let's try a mix of primary and secondary keys, with some missing
        it("#.findAll({a: X}, {a: missing}, id, {id:missing})", (done) => {
          data.findAll({ a: 20 }, { id: 200 }, 1, { a: 200 }).value().then((res) => {
            // There are three docs where `a == 20`
            assert.sameDeepMembers([{ id: 1, a: 10 },
                                    { id: 2, a: 20, b: 1 },
                                    { id: 3, a: 20, b: 2 },
                                    { id: 4, a: 20, b: 3 }],
                                   res);
            done();
          }).catch(done);
        });

        // Let's try when everything is missing
        it("#.findAll({missing: id}, {a:missing}, missing)", (done) => {
          data.findAll({ field: 1 }, 200, { a: 200 }).value().then((res) => {
            assert.deepEqual([], res);
            done();
          }).catch(done);
        });

        // When one thing fails, everything fails.
        it("#.findAll(a, null, c)", (done) => {
          data.findAll(1, null, 2).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          }).catch(done);
        });

        // Let's try it again with an empty object.
        it("#.findAll(a, null, c, field)", (done) => {
          data.findAll(1, {}, { a: 20 }).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          }).catch(done);
        });

      }); // Testing `findAll`

      describe("Testing `order`", () => {

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

      }); // Testing `order`

      describe("Testing `limit`", () => {

        // Limit returns an array of documents
        it("#.order(id).limit(2)", (done) => {
          data.order('id').limit(2).value().then((res) => {
            assert.deepEqual([{ id: 1, a: 10 },
                              { id: 2, a: 20, b: 1 }], res);
            done();
          }).catch(done);
        });

        // `limit(0)` is ok
        it("#.order(id).limit(0)", (done) => {
          data.order('id').limit(0).value().then((res) => {
            assert.deepEqual([], res);
            done();
          }).catch(done);
        });

        // `limit(null)` is an error
        it("#.order(id).limit(null)", (done) => {
          data.order('id').limit(null).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          }).catch(done);
        });

        // `limit(-1)` is an error
        it("#.order(id).limit(-1)", (done) => {
          data.order('id').limit(-1).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          }).catch(done);
        });

        // `limit(non_int)` is an error
        it("#.order(id).limit('k')", (done) => {
          data.order('id').limit('k').value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          }).catch(done);
        });

      }); // Testing `limit`

      describe("Testing `above`", () => {

        // By default `above` is closed
        it("#.order(id).above(5)", (done) => {
          data.order('id').above(5).value().then((res) => {
            assert.deepEqual([{ id: 5, a: 50 },
                              { id: 6, a: 60 }], res);
            done();
          }).catch(done);
        });

        // We can also pass that explicitly
        it("#.order(id).above(5, closed)", (done) => {
          data.order('id').above(5, 'closed').value().then((res) => {
            assert.deepEqual([{ id: 5, a: 50 },
                              { id: 6, a: 60 }], res);
            done();
          }).catch(done);
        });

        // But we can make it open
        it("#.order(id).above(5, open)", (done) => {
          data.order('id').above(5, 'open').value().then((res) => {
            assert.deepEqual([{ id: 6, a: 60 }], res);
            done();
          }).catch(done);
        });

        // Let's try something that returns no values
        it("#.order(id).above(maxval)", (done) => {
          data.order('id').above(7).value().then((res) => {
            assert.deepEqual([], res);
            done();
          }).catch(done);
        });

        // Let's try it on a compound index
        it("#.order([a,id]).above([20,3])", (done) => {
          data.order(['a', 'id']).above([20, 3]).value().then((res) => {
            assert.deepEqual([{ id: 3, a: 20, b: 2 },
                              { id: 4, a: 20, b: 3 },
                              { id: 5, a: 50 },
                              { id: 6, a: 60 }], res);
            done();
          }).catch(done);
        });

        // Let's try it on a compound index, but open
        it("#.order([a,id]).above([20,3], open)", (done) => {
          data.order(['a', 'id']).above([20, 3], 'open').value().then((res) => {
            assert.deepEqual([{ id: 4, a: 20, b: 3 },
                              { id: 5, a: 50 },
                              { id: 6, a: 60 }], res);
            done();
          }).catch(done);
        });

        // Just a prefix is ok
        it("#.order([a,id]).above([20])", (done) => {
          data.order(['a', 'id']).above([20]).value().then((res) => {
            assert.deepEqual([{ id: 2, a: 20, b: 1 },
                              { id: 3, a: 20, b: 2 },
                              { id: 4, a: 20, b: 3 },
                              { id: 5, a: 50 },
                              { id: 6, a: 60 }], res);
            done();
          }).catch(done);
        });

        // Let's try just a prefix, but open
        it("#.order([a,id]).above([20], open)", (done) => {
          data.order(['a', 'id']).above([20]).value().then((res) => {
            assert.deepEqual([{ id: 5, a: 50 },
                              { id: 6, a: 60 }], res);
            done();
          }).catch(done);
        });

        // However, if the key is compound, not passing an array is not ok
        it("#.order([a,id]).above(20)", (done) => {
          data.order(['a', 'id']).above(20).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          })
        });

        // Starting with `null` is not ok
        it("#.order(id).above(null)", (done) => {
          data.order('id').above(null).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // Empty value is not ok
        it("#.order(id).above()", (done) => {
          data.order('id').above().value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // Bad arguments are not ok
        it("#.order(id).above(1, bad)", (done) => {
          data.order('id').above(1, 'foo').value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

      }); // Testing `above`

      describe("Testing `below`", () => {

        // By default `below` is open
        it("#.order(id).below(3)", (done) => {
          data.order('id').below(3).value().then((res) => {
            assert.deepEqual([{ id: 1, a: 10 },
                              { id: 2, a: 20, b: 1 }], res);
            done();
          }).catch(done);
        });

        // We can also pass that explicitly
        it("#.order(id).below(3, 'open')", (done) => {
          data.order('id').below(3, 'open').value().then((res) => {
            assert.deepEqual([{ id: 1, a: 10 },
                              { id: 2, a: 20, b: 1 }], res);
            done();
          }).catch(done);
        });

        // But we can make it closed
        it("#.order(id).below(3, 'closed')", (done) => {
          data.order('id').below(3, 'closed').value().then((res) => {
            assert.deepEqual([{ id: 1, a: 10 },
                              { id: 2, a: 20, b: 1 },
                              { id: 3, a: 20, b: 2 }], res);
            done();
          }).catch(done);
        });

        // Let's try something that returns no values
        it("#.order(id).below(minval)", (done) => {
          data.order('id').below(0).value().then((res) => {
            assert.deepEqual([], res);
            done();
          }).catch(done);
        });

        // Let's try it on a compound index
        it("#.order([a,id]).below([20,3])", (done) => {
          data.order(['a', 'id']).below([20, 3]).value().then((res) => {
            assert.deepEqual([{ id: 1, a: 10 },
                              { id: 2, a: 20, b: 1 }], res);
            done();
          }).catch(done);
        });

        // Let's try it on a compound index, but closed
        it("#.order([a,id]).below([20,3], closed)", (done) => {
          data.order(['a', 'id']).below([20, 3], 'closed').value().then((res) => {
            assert.deepEqual([{ id: 1, a: 10 },
                              { id: 2, a: 20, b: 1 },
                              { id: 3, a: 20, b: 2 }], res);
            done();
          }).catch(done);
        });

        // Just a prefix is ok
        it("#.order([a,id]).below([20])", (done) => {
          data.order(['a', 'id']).below([20]).value().then((res) => {
            assert.deepEqual([{ id: 1, a: 10 }], res);
            done();
          }).catch(done);
        });

        // Let's try just a prefix, but closed
        it("#.order([a,id]).below([20], closed)", (done) => {
          data.order(['a', 'id']).below([20], 'closed').value().then((res) => {
            assert.deepEqual([{ id: 1, a: 10 },
                              { id: 2, a: 20, b: 1 },
                              { id: 3, a: 20, b: 2 },
                              { id: 4, a: 20, b: 3 }], res);
            done();
          }).catch(done);
        });

        // However, if the key is compound, not passing an array is not ok
        it("#.order([a,id]).below(20)", (done) => {
          data.order(['a', 'id']).below(20).value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          })
        });

        // Starting with `null` is not ok
        it("#.order(id).below(null)", (done) => {
          data.order('id').below(null).value().err((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // Empty value is not ok
        it("#.order(id).below()", (done) => {
          data.order('id').below().value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

        // Bad arguments are not ok
        it("#.order(id).below(1, bad)", (done) => {
          data.order('id').below(1, 'foo').value().catch((err) => {
            assert.isDefined(err);
            assert.isNotNull(err);
            done();
          });
        });

      }); // Testing `below`

      describe("Test `above/below/limit` chaining variations", () => {

        // Let's do a biiig chain
        it("#.findAll.order.above.below", (done) => {
          data.findAll({ a: 20 })
              .order('id').above(2).below(4)
              .value().then((res) => {
            assert.deepEqual([{ id: 2, a: 20, b: 1 },
                              { id: 3, a: 20, b: 2 }], res);
            done();
          }).catch(done);
        });

        // Let's flip it the other way
        it("#.findAll.order(desc).below.above", (done) => {
          data.findAll({ a: 20 })
              .order('id', 'descending')
              .below(4).above(2)
              .value().then((res) => {
            assert.deepEqual([{ id: 3, a: 20, b: 2 },
                              { id: 2, a: 20, b: 1 }], res);
            done();
          }).catch(done);
        });

        // Let's throw limit into the mix
        it("#.findAll.order.above.below.limit", (done) => {
          data.findAll({ a: 20 })
              .order('id').above(2).below(4).limit(1)
              .value().then((res) => {
            assert.deepEqual([{ id: 2, a: 20, b: 1 }], res);
            done();
          }).catch(done);
        });

        // Let's do it on the collection
        it("#.order.above.below.limit", (done) => {
          data.order('id').above(2).below(4).limit(1)
              .value().then((res) => {
            assert.deepEqual([{ id: 2, a: 20, b: 1 }], res);
            done();
          }).catch(done);
        });

        // Let's try a big compound example
        it("#.findAll.order([]).above.below.limit", (done) => {
          data.findAll({ b: 1 }, { id: 3 }, { b: 3 } )
              .order(['a', 'id'])
              .above([20, 3])
              .below([20, 4], 'closed')
              .limit(2)
              .value().then((res) => {
            assert.deepEqual([{ id: 3, a: 20, b: 2 },
                              { id: 4, a: 20, b: 3 }], res);
            done();
          }).catch(done);
        });

        // Let's try it again, but now only with a prefix
        it("#.findAll.order([x, y]).above([x]).below", (done) => {
          data.findAll({ b: 1 }, { id: 3 }, { b: 3 } )
              .order(['a', 'id'])
              .above([20])
              .below([20, 4], 'closed')
              .limit(2)
              .value().then((res) => {
            assert.deepEqual([{ id: 2, a: 20, b: 1 },
                              { id: 3, a: 20, b: 2 }], res);
            done();
          }).catch(done);
        });

        // Same, but `findAll` has more complex conditions, just to be sure this
        // works
        it("#.findAll({...}).order([x, y]).above([x]).below", (done) => {
          data.findAll({ a: 20, b: 1 }, { id: 3 }, { id: 4, b: 3 } )
              .order(['a', 'id'])
              .above([20])
              .below([20, 4], 'closed')
              .limit(2)
              .value().then((res) => {
            assert.deepEqual([{ id: 2, a: 20, b: 1 },
                              { id: 3, a: 20, b: 2 }], res);
            done();
          }).catch(done);
        });

      }); // Test `above/below/limit` chaining variations

      describe("Testing illegal chaining", () => {

        // All variations of chaining below should be illegal.

        // Chaining anything after `find` is an error because `find` returns a
        // single document.
        it("#.find.find", (done) => {
          try { data.find(1).find(2).value(); } catch (e) { done(); }
        });
        it("#.find.findAll", (done) => {
          try { data.find(1).findAll(2).value(); } catch (e) { done(); }
        });
        it("#.find.order", (done) => {
          try { data.find(1).order('id').value(); } catch (e) { done(); }
        });
        it("#.find.above", (done) => {
          try { data.find(1).above(0).value(); } catch (e) { done(); }
        });
        it("#.find.below", (done) => {
          try { data.find(1).below(2).value(); } catch (e) { done(); }
        });
        it("#.find.limit", (done) => {
          try { data.find(1).limit(1).value(); } catch (e) { done(); }
        });

        // Chaining `order` after `findAll` is ok (which allows chainging
        // `above/below/limit`), but chaining anything else is not ok.
        it("#.findAll.find", (done) => {
          try { data.findAll(1).find(2).value(); } catch (e) { done(); }
        });
        it("#.findAll.findAll", (done) => {
          try { data.findAll(1).findAll(2).value(); } catch (e) { done(); }
        });
        it("#.findAll.above", (done) => {
          try { data.findAll(1).above(0).value(); } catch (e) { done(); }
        });
        it("#.findAll.below", (done) => {
          try { data.findAll(1).below(2).value(); } catch (e) { done(); }
        });
        it("#.findAll.limit", (done) => {
          try {
            data.findAll(1).limit(1).value().then((res) => {
              done(new Error('`limit` should not be chainable off `findAll` without first chaining `order`'));
            });
          } catch (e) { done(); }
        });

        // Can't chain anything off `above` except `below/limit`
        it("#.order.above.find", (done) => {
          try { data.order('id').above(1).find(1).value(); } catch (e) { done(); }
        });
        it("#.order.above.findAll", (done) => {
          try { data.order('id').above(1).findAll(1).value(); } catch (e) { done(); }
        });
        it("#.order.above.above", (done) => {
          try { data.order('id').above(1).above(1).value(); } catch (e) { done(); }
        });

        // Can't chain anything off `below` except `above/limit`
        it("#.order.below.find", (done) => {
          try { data.order('id').below(1).find(1).value(); } catch (e) { done(); }
        });
        it("#.order.below.findAll", (done) => {
          try { data.order('id').below(1).findAll(1).value(); } catch (e) { done(); }
        });
        it("#.order.below.below", (done) => {
          try { data.order('id').below(1).below(1).value(); } catch (e) { done(); }
        });

        // Can't chain anything off limit
        it("#.order.limit.limit", (done) => {
          try { data.order('id').limit(1).limit(1).value(); } catch (e) { done(); }
        });
        it("#.order.limit.find", (done) => {
          try { data.order('id').limit(1).find(1).value(); } catch (e) { done(); }
        });
        it("#.order.limit.findAll", (done) => {
          try { data.order('id').limit(1).findAll(1).value(); } catch (e) { done(); }
        });
        it("#.order.limit.below", (done) => {
          try { data.order('id').limit(1).below(1).value(); } catch (e) { done(); }
        });
        it("#.order.limit.above", (done) => {
          try { data.order('id').limit(1).above(1).value(); } catch (e) { done(); }
        });
        it("#.order.limit.order", (done) => {
          try { data.order('id').limit(1).order('a').value(); } catch (e) { done(); }
        });

        // Can't double-chain order
        it("#.order.order", (done) => {
          try { data.order('id').order('a').value(); } catch (e) { done(); }
        });

        // Chaining `limit`, `above`, or `below` off of a collection is illegal
        // without first chaining `order`.
        it("#.above", (done) => {
          try { data.above(1).value(); } catch (e) { done(); }
        });
        it("#.below", (done) => {
          try { data.below(2).value(); } catch (e) { done(); }
        });
        it("#.limit", (done) => {
          try { data.limit(1).value(); } catch (e) { done(); }
        });

      }); // Testing illegal chaining

    }); // Test the lookup API

  }); // Core API tests

}); // Fusion Client Library
