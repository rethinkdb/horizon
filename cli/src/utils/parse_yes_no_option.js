'use strict';

function parse_yes_no_option(value, option_name) {
  if (value !== undefined && value !== null) {
    const lower = value.toLowerCase ? value.toLowerCase() : value;
    if (value === true || value === 'true' || value === 'yes') {
      return true;
    } else if (value === false || value === 'false' || value === 'no') {
      return false;
    }
    throw new Error('Unexpected value "${option_name}=${value}", should be yes or no.');
  }
}

module.exports = parse_yes_no_option;
