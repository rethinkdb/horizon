const optionsSymbol = Symbol('optionsSymbol');
const sendSymbol = Symbol('sendSymbol');

export class TermBase {
  constructor(options, send) {
    this[optionsSymbol] = options;
    this[sendSymbol] = send;
  }
}

export function addOption(name, type) {
  if (type === 'terminal') {
    TermBase.prototype[name] = function (...args) {
      const newOptions = Object.assign({[name]: args}, this[optionsSymbol])
      return this[sendSymbol](newOptions)
    }
  } else {
    TermBase.prototype[name] = function (...args) {
      const newOptions = Object.assign({[name]: args}, this[optionsSymbol])
      return new TermBase(newOptions, this[sendSymbol])
    }
  }
}

// RSI: something about _lazyWrites and errors in writes
