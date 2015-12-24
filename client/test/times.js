timesSuite = (getData) => {
  return () => {

  var data;

  before(() => {
    data = getData();
  });

  var range = (count) => Array.from(Array(count).keys());

  beforeEach((done) => {
    var rows = range(16).map((i) => ({ id: i, value: i % 4, time: new Date(Math.floor(i / 4)) }));
    data.store(rows).then((res) => {
      assert.isArray(res);
      assert.lengthOf(res, 16);
      done();
    });
  });

  it("#.find(time: X)", (done) => {
    data.find({ time: new Date(0) }).value().then((res) => {
      assert.deepEqual({ id: 0, time: new Date(0), value: 0 }, res);
      done();
    }).catch(done);
  });

  it("#.find(value: X, time: Y)", (done) => {
    data.find({ value: 1, time: new Date(3) }).value().then((res) => {
      assert.deepEqual({ id: 13, value: 1, time: new Date(3) }, res);
      done();
    }).catch(done);
  });

  it("#.findAll(time: X)", (done) => {
    data.findAll({ time: new Date(2) }).value().then((res) => {
      assert.deepEqual(range(4).map((i) => ({ id: i + 8, value: i, time: new Date(2) })), res);
      done();
    }).catch(done);
  });

  it("#.findAll(value: X, time: Y)", (done) => {
    data.findAll({ value: 2, time: new Date(3) }).value().then((res) => {
      assert.deepEqual([{ id: 14, value: 2, time: new Date(3) }], res);
      done();
    }).catch(done);
  });

  it("#.findAll(value: X).above(time: Y)", (done) => {
    data.findAll({ value: 3 }).above({ time: new Date(1) }).value().then((res) => {
      assert.deepEqual(range(3).map((i) => ({ id: 3 + (i + 1) * 4, value: 3, time: new Date(i + 1) })), res);
      done();
    }).catch(done);
  });

  it("#.findAll(value: X).above(time: Y).below(time: Z)", (done) => {
    data.findAll({ value: 2 }).above({ time: new Date(1) }).below({ time: new Date(3) }).value().then((res) => {
      assert.deepEqual([{ id: 6, value: 2, time: new Date(1) }, { id: 10, value: 2, time: new Date(2) }], res);
      done();
    }).catch(done);
  });
  } // Testing `find`
}
