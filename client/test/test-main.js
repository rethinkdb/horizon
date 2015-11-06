const utils = require("../../server/test/utils.js");
const mocha = require("mocha");
const assert = require("assert");
const logger = require('../../server/src/server.js').logger;
const child_process = require("child_process");

describe("Fusion Client Library Tests", () => {

  it("Mocha-PhantomJS", function(done) {
    child_process.exec('mocha-phantomjs --ssl-protocol=any --ignore-ssl-errors=true test/test.html', (err, stdout, stderr) => {
      if(err !== null){
          assert.equal(err.code, 0, "STDOUT:\n" + stdout, +"\n\nSTDERR:\n" + stderr);
      }
      done();
    });
  });

});
