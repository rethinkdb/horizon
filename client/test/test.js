chai.config.showDiff = true;
var assert = chai.assert;
var Fusion = require("Fusion");


describe("Fusion Client Library", function() {

  //Doesn't actually do anything for now, need `isConnected` callback
  describe("Make a connection to the database", function() {
    it("new Fusion(...)", function(done) {
      var fusion = new Fusion("localhost:8181", false);
      assert.notEqual(fusion, undefined);
      fusion.toPromise('connected').then(function(){ done() }, done)
    });
  });

  describe("Collections", function(done) {

    var testDoc = {
      id: "test",
      obj: {},
      array: [],
      string: "",
      int: 42,
      float: 42.0
    };

    var fusion = new Fusion("localhost:8181", false);
    var tests = fusion("tests");

    it("#.store(...)", function(done) {
      tests.store(testDoc)
        .then(function(result) {
          assert.deepEqual(result.new_val, testDoc);
          done();
        })
        .catch(function(err) {
          done(err);
        });
    });

    it("#.findOne(...)", function(done) {
      tests.findOne(testDoc.id)
        .value()
        .then(function(result) {
          assert.deepEqual(result, testDoc);
          done();
        })
        .catch(function(err) {
          done(err);
        });
    });

    it("#.find(...)", function(done) {
      tests.find("id", "test")
        .value()
        .then(function(result) {
          assert.deepEqual(result[0], testDoc);
          done();
        })
        .catch(function(err) {
          done(err);
        })
    });

    it("#.update(...)", function() {
      var testUpdateDoc = {
        id: "test",
        obj: {},
        array: [],
        string: "",
        int: 43,
        float: 43.0
      };
      tests.update(testUpdateDoc)
        .then(function(result) {
          return tests.findOne(testUpdateDoc.id).value();
        })
        .then(function(result) {
          assert.deepEqual(result, testUpdateDoc);
        })
        .catch(function(err) {
          done(err);
        })
    });

  });
});
