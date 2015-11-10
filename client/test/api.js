chai.config.showDiff = true;
var assert = chai.assert;
var Fusion = require("Fusion");


// This test suite covers various edge cases in the Fusion client library API.
// It does not cover correctness of the full system in various circumstances.
// The purpose of the API test suite is to act as a runnable, checkable spec for
// API of the client library. This also doesn't cover subscriptions, there is a
// separate test suite for that.
describe("Fusion Client Library API", () => {

  // Test the methods and event callbacks on the Fusion object.
  describe("Fusion Object API", () => {

    // Test object creation, the `dispose` method, and `connected/disconnected`
    // events.
    it("new Fusion(...)", (done) => {
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
    }); // "new Fusion(...)"

    // Test the `error` event.
    it("new Fusion(...).on('error')", (done) => {
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
    }); // "new Fusion(...).on('error')"
  }); // "Fusion Object API"

  // Test the reads and writes API
  describe("Reads and writes API", () => {

    // The connection for our tests
    var fusion;
    var data;

    // Set up the fusion connection before running these tests.
    before((done) => {
      fusion = new Fusion("localhost:8181", { secure: false });
      fusion.on('connected', () => {
        data = fusion('test-data');
        done();
      });
    });

    // Kill the fusion connection after running these tests.
    after((done) => {
      fusion.on('disconnected', () => done());
      fusion.dispose();
    });

    // Store a single element with an ID
    it("#.store(id)", (done) => {
      data.store({ id: 1, a: 1, b: 1 }).then((res) => {
        // The promise should return an array with an ID of the inserted
        // document.
        assert.deepEqual(res, [1]);
        done();
      }).catch(done);
    });

    // `store` overwrites documents that already exist.
    it("#.store(overwrite_existing)", (done) => {
      data.store({ id: 1, a: 2 }).then((res) => {
        // The promise should return an array with an ID of the overwritten
        // document. We'll test the value of this document later, when we call
        // `find`.
        assert.deepEqual(res, [1]);
        done();
      }).catch(done);
    });

    // This is the same as calling `replace` if the document already exists.
    it("#.replace(overwrite_existing)", (done) => {
      data.replace({ id: 1, a: 3 }).then((res) => {
        // The promise should return an array with an ID of the overwritten
        // document. We'll test the value of this document later, when we call
        // `find`.
        assert.deepEqual(res, [1]);
        done();
      }).catch(done);
    });

    // To error if the document already exists, use `insert`.
    it("#.insert(unique_conflict)", (done) => {
      data.insert({ id: 1, a: 4 }).catch((err) => {
        // We should receive an error because the document with `id: 1` already
        // exists.
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });

    // The following should work since there is no conflict.
    it("#.insert(unique_no_conflict)", (done) => {
      data.insert({ id: 2, a: 2 }).then((res) => {
        // The promise should return an array with an ID of the inserted
        // document.
        assert.deepEqual(res, [2]);
        done();
      }).catch(done);
    });

    // As you might have noticed, `insert` inserts a document if it's missing.
    it("#.insert(missing_ok)", (done) => {
      data.insert({ id: 3, a: 3 }).then((res) => {
        // The promise should return an array with an ID of the inserted
        // document.
        assert.deepEqual(res, [3]);
        done();
      }).catch(done);
    });

    // But what if we want to error on a missing document? We use `replace`.
    it("#.replace(missing_error)", (done) => {
      data.replace({ id: 4, a: 4 }).catch((err) => {
        // We should receive an error because the document with `id: 4` doesn't
        // already exist.
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });

    // Storing `null` or `undefined` is also an error.
    it("#.store(null)", (done) => {
      data.store(null).catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });
    it("#.store(undefined)", (done) => {
      data.store().catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });

    // But storing an empty document is ok -- we get back an array with the
    // generated ID.
    it("#.store(empty_no_id)", (done) => {
      data.store({}).then((res) => {
        // The promise should return an array with a generated ID of the
        // inserted document.
        assert.isArray(res);
        assert.lengthOf(res, 1);
        assert.isString(res[0]);
        done();
      }).catch(done);
    });

    // We can store all kinds of documents without an ID.
    it("#.store(no_id)", (done) => {
      data.store({ a: 5 }).then((res) => {
        // The promise should return an array with a generated ID of the
        // inserted document.
        assert.isArray(res);
        assert.lengthOf(res, 1);
        assert.isString(res[0]);
        done();
      }).catch(done);
    });

    // Now is a good time to point out that `store` supports inserting multiple
    // documents.
    it("#.store(multiple)", (done) => {
      data.store([{}, {}]).then((res) => {
        // The promise should return an array with the generated IDs of the
        // inserted documents.
        assert.isArray(res);
        assert.lengthOf(res, 2);
        assert.isString(res[0]);
        assert.isString(res[1]);
        done();
      }).catch(done);
    });

    // Of course, IDs can also be specified explicitly.
    it("#.store(multiple)", (done) => {
      data.store([{ id: 6, a: 6}, { id: 7, a: 7 }]).then((res) => {
        // The promise should return an array with the generated IDs of the
        // inserted documents.
        assert.deepEqual(res, [6, 7]);
        done();
      }).catch(done);
    });

    // By the way, we can also update specific fields in documents instead of
    // overwriting them. Let's store a more complex document to illustrate this.
    it("#.store(complex)", (done) => {
      data.store({ id: 8, a: { b: 1, c: 2 }, d: { e: 1, f: 2 } }).then((res) => {
        // The promise should return an array with an ID of the overwritten
        // document. We'll test the value of this document later, when we call
        // `find`.
        assert.deepEqual(res, [8]);
        done();
      }).catch(done);
    });

    // Now let's call `update` to update the document instead of replacing it.
    it("#.update(doc)", (done) => {
      data.update({ id: 8, a: { c: 3 }, d: { f: 3 } }).then((res) => {
        // The promise should return an array with an ID of the updated
        // document. We'll test the value of this document later, when we call
        // `find`, but FYI it should be
        // { id: 8, a: { b: 1, c: 3 }, d: { e: 1, f: 3 } }.
        assert.deepEqual(res, [8]);
        done();
      }).catch(done);
    });

    // We can call `upsert` if we want to update a document or insert it if it's
    // missing.
    it("#.upsert(update_missing)", (done) => {
      data.upsert({ id: 9, a: { c: 3 }, d: { f: 3 } }).then((res) => {
        // The promise should return an array with an ID of the inserted
        // document. We'll test the value of this document later, when we call
        // `find`, but FYI it should be { id: 9, a: { c: 3 }, d: { f: 3 } }.
        assert.deepEqual(res, [9]);
        done();
      }).catch(done);
    });

    // This also works if the user doesn't specify an ID.
    it("#.upsert(update_missing_no_id)", (done) => {
      data.upsert({ a: 10 }).then((res) => {
        // The promise should return an array with the generated ID for the
        // inserted document.
        assert.isArray(res);
        assert.lengthOf(res, 1);
        assert.isString(res[0]);
        done();
      }).catch(done);
    });

    // Unless of course the user asked us to error on missing documents by
    // calling `update` instead.
    it("#.update(update_missing_error)", (done) => {
      data.update({ id: 10, a: { c: 3 }, d: { f: 3 } }).catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });
    it("#.update(update_missing_error_no_id)", (done) => {
      data.update({ a: 11 }).catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });

    // If the user tries to store multiple documents and anything errors, the
    // whole thing resolves to an error. That's a bit of an unfortunate
    // compromise, but that's what we'll do for simplicity, at least for V1.
    it("#.store(some_docs_error_some_do_not)", (done) => {
      data.replace({}, { id: 6, b: 6 }, {}).catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });

    // We already mentioned the update command. Here it is again.
    it("#.update(...)", (done) => {
      data.update({ id: 11, a: 11 }).then((res) => {
        // The promise should return an array with an ID of the updated
        // document.
        assert.deepEqual(res, [11]);
        done();
      }).catch(done);
    });

    // `upsert` works if the user didn't specify an ID.
    it("#.upsert(no_id)", (done) => {
      data.upsert({ a: 12 }).then((res) => {
        // The promise should return an array with an ID of the updated
        // document. This is equivalent to just inserting.
        assert.isArray(res);
        assert.lengthOf(res, 1);
        assert.isString(res[0]);
        done();
      }).catch(done);
    });

    // `upsert` again
    it("#.upsert(no_id_missing)", (done) => {
      data.upsert({ a: 12 }).then((res) => {
        // The promise should return an array with an ID of the updated
        // document.
        assert.isArray(res);
        assert.lengthOf(res, 1);
        assert.isString(res[0]);
        done();
      }).catch(done);
    });

    // What if they want to error on missing documents? Call `update` instead.
    it("#.update(missing)", (done) => {
      data.update({ id: 12, a: 12 }).catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });
    it("#.update(missing_no_id)", (done) => {
      data.update({ a: 12 }).catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });

    // And of course users can `upsert` multiple documents in one call
    it("#.upsert(multiple)", (done) => {
      data.upsert([{}, {}]).then((res) => {
        // The promise should return an array with the generated IDs of the
        // inserted documents.
        assert.isArray(res);
        assert.lengthOf(res, 2);
        assert.isString(res[0]);
        assert.isString(res[1]);
        done();
      }).catch(done);
    });
    it("#.update(multiple_existing)", (done) => {
      data.update([{ id: 9, b: 9 }, { id: 11, c: 11 }]).then((res) => {
        // The promise should return an array with the IDs of the updates
        // documents.
        assert.deepEqual(res, [9, 11]);
        done();
      }).catch(done);
    });

    // Like `store`, `update` has nice error handling to tell the user if they
    // passed invalid arguments.
    it("#.update(null)", (done) => {
      data.update(null).catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });
    it("#.update(undefined)", (done) => {
      data.update().catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });

    // If the user tries to update multiple documents and anything errors, the
    // whole thing resolves to an error. That's a bit of an unfortunate
    // compromise, but that's what we'll do for simplicity, at least for V1.
    it("#.update(some_docs_error_some_do_not)", (done) => {
      data.update({}, { id: 6, c: 6 }, {},
                 { missing: 'error' }).catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });

    // All right! If you're perceptive, you might have noticed that we've
    // created a total of 17 documents in the database. Let's make sure that's
    // the case.
    it("#.collection", (done) => {
      data.value().then((res) => {
        assert.isArray(res);
        assert.lengthOf(res, 17);
        for (var i of res) {
          assert.isObject(i);
        }
        done();
      }).catch(done);
    });

    // Let's grab a specific document using `findOne`
    it("#.findOne", (done) => {
      data.findOne(1).value().then((res) => {
        assert.deepEqual(res, { id: 1, a: 3 });
        done();
      }).catch(done);
    });

    // We can also `findOne` by a different (indexed!) field. In that case,
    // `findOne` will return the first match. In case there are multiple
    // documents, the one returned isn't deterministic, so users should use this
    // at their own risk.
    it("#.findOne(field)", (done) => {
      data.findOne(3, { field: 'a' }).value().then((res) => {
        assert.deepEqual(res, { id: 1, a: 3 });
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

    // BTW, `findOne` does the nice error-handling thingy.
    it("#.findOne(bad_arg)", (done) => {
      data.findOne(3, { abracadabra: 1 }).value().catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });

    // We can also call `find` which returns an array of documents. By default,
    // `find` searches by the primary key.
    it("#.find", (done) => {
      data.find(1).value().then((res) => {
        assert.deepEqual(res, [{ id: 1, a: 3 }]);
        done();
      }).catch(done);
    });

    // Which is equivalent to searching by the ID field explicitly.
    it("#.find(field)", (done) => {
      data.find(1, { field: 'id' }).value().then((res) => {
        assert.deepEqual(res, [{ id: 1, a: 3 }]);
        done();
      }).catch(done);
    });

    // But look, we can search by a different indexed field and get multiple
    // documents! (Note, these should be returned ordered by ID)
    it("#.find(fields)", (done) => {
      data.find(3, { field: 'a' }).value().then((res) => {
        assert.deepEqual(res, [{ id: 1, a: 3 }, { id: 3, a: 3 }]);
        done();
      }).catch(done);
    });

    // You can also find multiple values in the database. Again, everything gets
    // returned ordered by ID. BTW, remember those documents we updated before?
    // We're checking them here, so be careful if you mess with this test.
    it("#.find(updated1, updated2)", (done) => {
      data.find(8, 9).value().then((res) => {
        assert.deepEqual(res, [{ id: 8, a: { b: 1, c: 3 }, d: { e: 1, f: 3 } },
                               { id: 9, a: { c: 3 }, b: 9, d: { f: 3 } }]);
        done();
      }).catch(done);
    });

    // We can do it on a custom field, too.
    it("#.find(a, b, field)", (done) => {
      data.find(2, 3, { field: 'a' }).value().then((res) => {
        assert.deepEqual(res, [{ id: 1, a: 3 },
                               { id: 2, a: 2 },
                               { id: 3, a: 3 }]);
        done();
      }).catch(done);
    });

    // But what happens if some of the documents are missing?
    it("#.find(missing, a, missing)", (done) => {
      data.find('abracadabra1', 1, 'abracadabra2').value().then((res) => {
        assert.deepEqual(res, [{ id: 1, a: 3 }]);
        done();
      }).catch(done);
    });

    // And of course `find` has nice error handling.
    // BTW, `findOne` does the nice error-handling thingy.
    it("#.find(bad_arg)", (done) => {
      data.find(3, { abracadabra: 1 }).value().catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });

    // All right, let's remove a document. The promise resolves with no
    // arguments.
    it("#.remove(...)", (done) => {
      data.remove(2).then((res) => {
        assert.isUndefined(res);
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

    // It's also possible to remove multiple docuemnts
    it("#.remove(a, b)", (done) => {
      data.remove(8, 9).then((res) => {
        assert.isUndefined(res);
        done();
      }).catch(done);
    });

    // And of course `remove` does the delightful error handling where the user
    // is notified if they pass a silly optarg.
    it("#.remove(bard_arg)", (done) => {
      data.remove(3, { abracadabra: 1 }).catch((err) => {
        assert.isDefined(err);
        assert.isNotNull(err);
        done();
      });
    });

    // All right. We removed five documents while you weren't watching. Let's
    // double check that it's the case.
    it("#.collection", (done) => {
      data.value().then((res) => {
        assert.isArray(res);
        assert.lengthOf(res, 12);
        done();
      }).catch(done);
    });

  }); // "Reads and writes API"
});
