findAllSuite = (getData) => {
  return () => {

  var data;

  before(() => {
    data = getData();
  });

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
    try {
      data.findAll(null).value();
    } catch(err) { done(); }
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
    try {
      data.findAll().value();
    } catch(err) { done(); }
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
    try {
      data.findAll(1, null, 2).value();
    } catch(err) { done(); }
  });

  // Let's try it again with an empty object.
  it("#.findAll(a, {}, {c:x})", (done) => {
    data.findAll(1, {}, { a: 20 }).value().catch((err) => {
      assert.isDefined(err);
      assert.isNotNull(err);
      done();
    }).catch(done);
  });

  } // Testing `findAll`
}
