const OFF = 0;
const WARN = 1;
const ERROR = 2;

module.exports = {
  extends: "../.eslintrc.js",
  rules: {
    "max-len": [ ERROR, 100 ],
    "no-invalid-this": [ OFF ]
  },
  env: {
    "es6": true,
    "node": true,
    "mocha": true,
  },
};
