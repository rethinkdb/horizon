'use strict';

/*
A nice error type that allows you to associate a longer description, a
source file and suggestions with it.
*/

const chalk = require('chalk');

class NiceError extends Error {
  constructor(message, options) {
    super(message);
    const opts = options || {};
    this.description = opts.description || null;
    this.suggestions = opts.suggestions || null;
    // TODO: maybe allow multiple source locations and spans of text
    // instead of a single column offset
    this.src = (opts.src) ? Object.assign({}, opts.src) : null;
  }
  toString() {
    return this.message;
  }

  niceString(options) {
    const opts = options || {};
    const cSize = opts.contextSize != null ? opts.contextSize : 2;
    const results = [ this.message ];
    if (this.description) {
      results.push('', this.description);
    }
    if (this.src != null) {
      const formattedSrc = NiceError._formatContext(
        this.src.contents,
        this.src.line,
        this.src.column,
        cSize
      );
      if (formattedSrc.length > 0) {
        results.push(`\nIn ${this.src.filename}, ` +
                     `line ${this.src.line}, ` +
                     `column ${this.src.column}:`);
        results.push.apply(results, formattedSrc);
      }
    }
    if (this.suggestions) {
      results.push(
        '', // extra newline before suggestions
        chalk.red(
          this.suggestions.length > 1 ? 'Suggestions:' : 'Suggestion:'));
      results.push.apply(
        results, this.suggestions.map((note) => `  ➤ ${note}`));
    }
    results.push(''); // push a final newline on
    return results.join('\n');
  }

  static _sourceLine(ln) {
    return `${chalk.blue(`${ln.line}:`)} ${chalk.white(ln.src)}`;
  }

  static _extractContext(sourceContents, line, contextSize) {
    const lines = sourceContents.toString().split('\n');
    const minLine = Math.max(line - contextSize - 1, 0);
    const maxLine = Math.min(line + contextSize, lines.length);
    if (line > lines.length) {
      return [];
    } else {
      return lines.slice(minLine, maxLine).map((src, i) => ({
        line: i + minLine + 1,
        src,
      }));
    }
  }

  static _formatContext(sourceContents, line, col, contextSize) {
    return this._extractContext(sourceContents, line, contextSize)
      .map((srcLine) => {
        let formatted = this._sourceLine(srcLine);
        if (srcLine.line === line) {
          const prefix = `${line}: `;
          formatted +=
            `\n${' '.repeat(prefix.length + col - 1)}${chalk.green('^')}`;
        }
        return formatted;
      });
  }

}

module.exports = NiceError;
