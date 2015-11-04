require("babel-core/register");
const assert = require("assert"),
  https = require("https"),
  fs = require("fs"),
  ws = require("ws");

  //Can import client library this way, but `new WebSocket` will not work"
  // as well, you need to run `gulp test` to compile a non-browserified  of
  // version the client library.
  // fusion = require("/Users/dalanmiller/repos/fusion/client/test/index.js");

//Is my head screwed on correctly
describe('Array', function() {
  describe('#indexOf()', function () {
    it('should return -1 when the value is not present', function () {
      assert.equal(-1, [1,2,3].indexOf(5));
      assert.equal(-1, [1,2,3].indexOf(0));
      assert.equal(0, [1,2,3].indexOf(1));
    });
  });
});

describe("Should be able to successfully load client lib from server", () => {

    it("Response should return 200", () => {
      https.get("https://localhost:31420/fusion.js", (res) => {
        assert.equal(res.statusCode, 200);
      });
    });

    it("Response body should == actual code from file", () => {
      https.get("https://localhost:31420/fusion.js", (res) => {
        assert.equal(res.data, code);
      });
    });

});

// describe("Should be able to make connection to server", () => {
//
//   it("Connection should be successful", () => {
//     var Fusion = new fusion.Fusion("localhost:31420");
//
//   })
// });
