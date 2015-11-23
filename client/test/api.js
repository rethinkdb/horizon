
// This test suite covers various edge cases in the Fusion client library API.
// It does not cover correctness of the full system in various circumstances.
// The purpose of the API test suite is to act as a runnable, checkable spec for
// API of the client library. This also doesn't cover subscriptions, there is a
// separate test suite for that.

chai.config.showDiff = true;
var assert = chai.assert;
var Fusion = require("Fusion");

  // Test the methods and event callbacks on the Fusion object.
  describe("Fusion Object API", fusionObjectSuite());

  // Test the core client library API
  describe("Core API tests", () => {
    // The connection for our tests
    var fusion;
    var data;

    getFusion = () => {
      return fusion;
    }

    getData = () => {
      return data;
    }

    // Set up the fusion connection before running these tests.
    before((done) => {
      fusion = new Fusion("localhost:8181", { secure: false, debug: false });
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
    describe("Storage API", () => {

      // Drop all data after each test
      afterEach((done) => {
        removeAllData(data, done);
      });

      describe("Testing `store`", storeSuite(getData));
      describe("Testing `insert`", insertSuite(getData));
      describe("Testing `upsert`", upsertSuite(getData));
      describe("Testing `update`", updateSuite(getData));
      describe("Testing `replace`", replaceSuite(getData));

    }); // Storage API

    describe("Testing `remove`", removeSuite(getData));
    describe("Testing `removeAll`", removeAllSuite(getData));

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

      getTestData = () => {
        return testData;
      }

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

      describe("Testing full collection read",
               collectionSuite(getFusion, getData, getTestData));
      describe("Testing `find`", findSuite(getData));
      describe("Testing `findAll`", findAllSuite(getData));
      describe("Testing `order`", orderSuite(getData, getTestData));
      describe("Testing `limit`", limitSuite(getData));
      describe("Testing `above`", aboveSuite(getData));
      describe("Testing `below`", belowSuite(getData));
      describe("Test `above/below/limit` chaining variations",
               chainingSuite(getData));

    }); // Test the lookup API

    // Test the subscriptions API
    describe("Subscriptions API", () => {

      // Drop all the existing data
      beforeEach((done) => {
        removeAllData(data, done);
      });

      describe("Testing `findAll` subscriptions", findAllSubscriptionSuite(getData));

    }); // Test the subscriptions API

  }); // Core API tests
