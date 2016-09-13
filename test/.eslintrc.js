const OFF = 0;
const WARN = 1;
const ERROR = 2;

module.exports = {
  extends: "../.eslintrc.js",
  rules: {
//    "camelcase": [ ERROR ],
    "max-len": [ ERROR, 89 ],
    "prefer-template": [ OFF ],
  },
  env: {
    "es6": true,
    "node": true,
    "mocha": true,
  },
};
