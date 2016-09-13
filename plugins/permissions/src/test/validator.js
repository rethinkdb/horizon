// RSI: link this up
describe('Validator', () => {
  it('unparseable', () => {
    assert.throws(() => new Validator('() => ;'), /Unexpected token/);
  });

  it('broken', () => {
    const validator = new Validator('() => foo');
    assert.throws(() => validator.isValid(), /Validation error/);
  });

  it('permitted', () => {
    const validator = new Validator(permitted_validator);
    assert(validator.isValid({ id: 3 }));
    assert(validator.isValid({ id: 3 }, { id: 0 }));
    assert(validator.isValid({ id: 3 }, { id: 0 }, { id: 1 }));
  });

  it('user permitted', () => {
    const validator = new Validator(user_permitted_validator);
    assert(validator.isValid({ id: 3 }, { id: 3 }));
    assert(validator.isValid({ id: 3 }, { id: 13 }));
    assert(!validator.isValid({ id: 3 }, { id: 4 }));
  });

  it('forbidden', () => {
    const validator = new Validator(forbidden_validator);
    assert(!validator.isValid({ id: 3 }));
    assert(!validator.isValid({ id: 3 }, { id: 3 }));
    assert(!validator.isValid({ id: 3 }, { id: 0 }, { id: 1 }));
  });
});
