var check = (pred, message) => {
  if (!pred) {
    throw new Error(message);
  }
};

var fail = (message) => check(false, message);

module.exports.check = check;
module.exports.fail = fail;
