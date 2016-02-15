'use strict';

module.exports = (pipe, callback) => {
  let buffer = '';
  pipe.on('data', (data) => {
    buffer += data.toString();

    let endline_pos = buffer.indexOf('\n');
    while (endline_pos !== -1) {
      const line = buffer.slice(0, endline_pos);
      buffer = buffer.slice(endline_pos + 1);
      callback(line);
      endline_pos = buffer.indexOf('\n');
    }
  });
};
