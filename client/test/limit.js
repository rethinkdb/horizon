limitSuite = (getData) => {
  return () => {

  var data;

  before(() => {
    data = getData();
  });

  // Limit returns an array of documents
  it("#.order(id).limit(2)", (done) => {
    data.order('id').limit(2).value().then((res) => {
      assert.deepEqual([{ id: 1, a: 10 },
                        { id: 2, a: 20, b: 1 }], res);
      done();
    }).catch(done);
  });

  // We can chain `limit` off a collection
  it("#.limit(2)", (done) => {
    data.limit(2).value().then((res) => {
      assert.isArray(res);
      assert.lengthOf(res, 2);
      done();
    }).catch(done);
  });

  // Or off other things
  it("#.findAll.limit(2)", (done) => {
    data.findAll({ a: 20 }).limit(2).value().then((res) => {
      assert.isArray(res);
      assert.lengthOf(res, 2);
      done();
    }).catch(done);
  });

  // `limit(0)` is ok
  it("#.limit(0)", (done) => {
    data.limit(0).value().then((res) => {
      assert.deepEqual([], res);
      done();
    }).catch(done);
  });

  // `limit(null)` is an error
  it("#.limit(null)", (done) => {
    data.limit(null).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    }).catch(done);
  });

  // `limit(-1)` is an error
  it("#.limit(-1)", (done) => {
    data.limit(-1).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    }).catch(done);
  });

  // `limit(non_int)` is an error
  it("#.limit('k')", (done) => {
    data.limit('k').value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    }).catch(done);
  });

  // Chaining off of limit is illegal
  it("#.limit('k').findAll", (done) => {
    try { data.limit(1).findAll({ id: 1 }).value(); }
    catch (e) { done(); }
  });
  it("#.limit('k').below", (done) => {
    try { data.limit(1).below({ id: 1 }).value(); }
    catch (e) { done(); }
  });
  it("#.limit('k').order", (done) => {
    try { data.limit(1).order('id').value(); }
    catch (e) { done(); }
  });

  } // Testing `limit`
}
