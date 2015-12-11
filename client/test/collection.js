collectionSuite = (getFusion, getData, getTestData) => {
  return () => {

  var fusion, data, testData;

  before(() => {
    fusion = getFusion();
    data = getData();
    testData = getTestData();
  });

  // We'll need a separate empty collection
  var empty_collection;
  before((done) => {
    empty_collection = fusion('empty_test_collection');
    removeAllData(empty_collection, done);
  });

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

  } // Testing full collection reads
}
