module.exports.check = function (pred, message) {
  if (!pred) {
    throw message;
  }
};

module.exports.fail = function (message) {
  check(false, message);
};
