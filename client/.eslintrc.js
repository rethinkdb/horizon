const OFF = 0;
const WARN = 1;
const ERROR = 2;

module.exports = {
  extends: "../.eslintrc.js",
  rules: {
    "arrow-parens": [ ERROR, "as-needed" ],
    "no-confusing-arrow": [ OFF ],
    "no-use-before-define": [ OFF ],
    "semi": [ ERROR, "never" ],
    "max-len": [ ERROR, 80, 2 ],
  },
  env: {
    "browser": true,
    "commonjs": true,
    "es6": true,
    "mocha": true,
  },
  parser: "babel-eslint",
};
