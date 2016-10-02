const optionsSymbol = Symbol('optionsSymbol');
const sendSymbol = Symbol('sendSymbol');

export class TermBase {
  constructor(options, send) {
    this[optionsSymbol] = options;
    this[sendSymbol] = send;
  }
}

export function addOption(name, isTerminal) {
  if (isTerminal) {
    TermBase.prototype[name] = function (...args) {
      const newOptions = Object.assign({[name]: args}, this[optionsSymbol])
      return new TermBase(newOptions, this[sendSymbol])
    }
  } else {
    TermBase.prototype[name] = function (...args) {
      const newOptions = Object.assign({[name]: args}, this[optionsSymbol])
      return this[sendSymbol](newOptions)
    }
  }
}

// RSI: something about _lazyWrites and errors in writes
