'use strict';

module.exports = (value, option_name) => {
  if (value !== undefined && value !== null) {
    const lower = value.toLowerCase ? value.toLowerCase() : value;
    if (lower === true || lower === 'true' || lower === 'yes') {
      return true;
    } else if (lower === false || lower === 'false' || lower === 'no') {
      return false;
    }
    throw new Error(`Unexpected value "${option_name}=${value}", should be yes or no.`);
  }
};
