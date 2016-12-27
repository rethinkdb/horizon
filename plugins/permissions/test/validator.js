'use strict';

const Validator = require('../validator');

const assert = require('assert');

const permittedValidator = '(userRow) => { return true; }';

const forbiddenValidator = '(userRow) => { return false; }';

const userPermittedValidator = `
(userRow, a, b) => {
  const value = (a && a.id) || (b && b.id);
  return userRow.id === (value % 10);
}
`;

// RSI: link this up
describe('Validator', () => {
  it('unparseable', () => {
    assert.throws(() => new Validator('() => ;'), /Unexpected token/);
  });

  it('broken', () => {
    const validator = new Validator('() => foo');
    assert.throws(() => validator.isValid(), /foo is not defined/);
  });

  it('permitted', () => {
    const validator = new Validator(permittedValidator);
    assert(validator.isValid({id: 3}));
    assert(validator.isValid({id: 3}, {id: 0}));
    assert(validator.isValid({id: 3}, {id: 0}, {id: 1}));
  });

  it('user permitted', () => {
    const validator = new Validator(userPermittedValidator);
    assert(validator.isValid({id: 3}, {id: 3}));
    assert(validator.isValid({id: 3}, {id: 13}));
    assert(!validator.isValid({id: 3}, {id: 4}));
  });

  it('forbidden', () => {
    const validator = new Validator(forbiddenValidator);
    assert(!validator.isValid({id: 3}));
    assert(!validator.isValid({id: 3}, {id: 3}));
    assert(!validator.isValid({id: 3}, {id: 0}, {id: 1}));
  });
});
