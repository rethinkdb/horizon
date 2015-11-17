fusionObjectSuite = () => {
  return () => {

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
      }); // "new Fusion().on('error')"
    });

  } // Testing Fusion object
}
