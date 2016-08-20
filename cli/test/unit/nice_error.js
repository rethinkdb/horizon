'use strict';
const stripAnsi = require('strip-ansi');
const assert = require('chai').assert;
const NiceError = require('../../src/utils/nice_error');

const fakeFile = `\
some = fake, syntax
next := some(1, 2, 3)
def foo(bar) {
  -- what language is this?
}
`;

describe('NiceError', () => {
  describe('._sourceLine', () => {
    it('should have blue line number and white source text', (done) => {
      const inputs = [
        { src: 'foo bar', line: 2 },
        { src: 'baz wux', line: 200 },
        { src: ' a b c d e', line: 2000 },
      ];
      const expected = [
        '\u001b[34m2:\u001b[39m' + ' ' + '\u001b[37mfoo bar\u001b[39m',
        '\u001b[34m200:\u001b[39m' + ' ' + '\u001b[37mbaz wux\u001b[39m',
        '\u001b[34m2000:\u001b[39m' + ' ' + '\u001b[37m a b c d e\u001b[39m',
      ];
      const results = inputs.map(NiceError._sourceLine.bind(NiceError));
      assert.deepEqual(results, expected);
      done();
    });
  });
  describe('._extractContext', () => {
    it('can get one line of context from the middle', (done) => {
      const line = 3;
      const contextSize = 1;
      const expected = [
        { line: 2, src: 'next := some(1, 2, 3)' },
        { line: 3, src: 'def foo(bar) {' },
        { line: 4, src: '  -- what language is this?' },
      ];
      const results = NiceError._extractContext(fakeFile, line, contextSize);
      assert.deepEqual(results, expected);
      done();
    });
    it('can get a size 2 context', (done) => {
      const line = 3;
      const contextSize = 2;
      const expected = [
        { line: 1, src: 'some = fake, syntax' },
        { line: 2, src: 'next := some(1, 2, 3)' },
        { line: 3, src: 'def foo(bar) {' },
        { line: 4, src: '  -- what language is this?' },
        { line: 5, src: '}' },
      ];
      const results = NiceError._extractContext(fakeFile, line, contextSize);
      assert.deepEqual(results, expected);
      done();
    });
    it('can gets a size 2 context with 1 line below it', (done) => {
      const line = 2;
      const contextSize = 2;
      const expected = [
        { line: 1, src: 'some = fake, syntax' },
        { line: 2, src: 'next := some(1, 2, 3)' },
        { line: 3, src: 'def foo(bar) {' },
        { line: 4, src: '  -- what language is this?' },
      ];
      const results = NiceError._extractContext(fakeFile, line, contextSize);
      assert.deepEqual(results, expected);
      done();
    });
    it('can gets a size 3 context with 0 lines below it', (done) => {
      const line = 1;
      const contextSize = 3;
      const expected = [
        { line: 1, src: 'some = fake, syntax' },
        { line: 2, src: 'next := some(1, 2, 3)' },
        { line: 3, src: 'def foo(bar) {' },
        { line: 4, src: '  -- what language is this?' },
      ];
      const results = NiceError._extractContext(fakeFile, line, contextSize);
      assert.deepEqual(results, expected);
      done();
    });
    it('can gets a size 3 context with 0 lines after it', (done) => {
      const line = 6;
      const contextSize = 3;
      const expected = [
        { line: 3, src: 'def foo(bar) {' },
        { line: 4, src: '  -- what language is this?' },
        { line: 5, src: '}' },
        { line: 6, src: '' },
      ];
      const results = NiceError._extractContext(fakeFile, line, contextSize);
      assert.deepEqual(results, expected);
      done();
    });
    it('returns an empty array if line out of bounds', (done) => {
      const line = 7;
      const contextSize = 3;
      const expected = [];
      const results = NiceError._extractContext(fakeFile, line, contextSize);
      assert.deepEqual(results, expected);
      done();
    });
  });
  describe('.toString', () => {
    const message = 'This is an error message';
    it('is compatible with a basic Error', (done) => {
      const error = new NiceError(message);
      const result = error.toString();
      assert.deepEqual(result, message);
      done();
    });
    it('only displays the basic message', (done) => {
      const error = new NiceError(message, {
        description: 'Some long description',
        suggestions: [
          'Suggestion A',
          'Suggestion B',
        ],
        src: {
          filename: 'fakety.txt',
          contents: 'File contents',
          line: 0,
          column: 0,
        },
      });
      const result = error.toString();
      assert.deepEqual(result, message);
      done();
    });
  });
  describe('.niceString', () => {
    const message = 'Some kinda message';
    const description = `A much longer description here that may span \
many lines and be just really ridiculously long in order to completely \
explain what's going on.`
    const filename = './fake.dx';
    const line = 2;
    const column = 6;
    const suggestions = [
      'Always call your mother',
      'Never lie to your mother about being robbed in Rio',
    ];
    let error;
    beforeEach(() => {
      error = new NiceError(message, {
        description: description,
        src: {
          filename,
          contents: fakeFile,
          line,
          column,
        },
        suggestions,
      });
    });
    it('shows the description if present', (done) => {
      error.src = null;
      error.suggestions = null;
      const expected = `\
${message}

${description}
`;
      const result = stripAnsi(error.niceString());
      assert.deepEqual(result, expected);
      done();
    });
    it('returns a carrot in the right place with source', (done) => {
      error.suggestions = null;
      const expected = `\
${message}

${description}

In ./fake.dx, line 2, column 6:
1: some = fake, syntax
2: next := some(1, 2, 3)
        ^
3: def foo(bar) {
4:   -- what language is this?
`;
      const result = stripAnsi(error.niceString());
      assert.deepEqual(result, expected);
      done();
    });

    it('returns a list of suggestions if present', (done) => {
      error.src = null;
      error.description = null;
      const expected = `\
${message}

Suggestions:
  ➤ ${suggestions[0]}
  ➤ ${suggestions[1]}
`;
      const results = stripAnsi(error.niceString());
      assert.deepEqual(results, expected);
      done();
    });

    it('shows both suggestions and source if present', (done) => {
      error.description = null;
      error.suggestions.shift();
      error.src.line = 5;
      error.src.column = 1;
      const expected = `\
${message}

In ./fake.dx, line 5, column 1:
2: next := some(1, 2, 3)
3: def foo(bar) {
4:   -- what language is this?
5: }
   ^
6: \


Suggestion:
  ➤ ${suggestions[0]}
`;
      /* Note: there's an extra space in the string literal above on
       * the line starting with "6:". This could be removed, but a lot
       * of text editors are set to remove trailing spaces on save, so
       * a backslash and an extra newline are a workaround to avoid
       * the editor mucking with it. */
      const results = stripAnsi(error.niceString({ contextSize: 3 }));
      assert.deepEqual(results, expected);
      done();
    });
  });
});
