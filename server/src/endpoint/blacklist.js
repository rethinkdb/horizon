'use strict';

const OpCode = require('rethinkdb/proto-def').Term.TermType;

module.exports = [
  OpCode.DB,
  OpCode.INSERT_AT,
  OpCode.DELETE_AT,
  OpCode.CHANGE_AT,
  OpCode.SPLICE_AT,
  OpCode.UPDATE,
  OpCode.DELETE,
  OpCode.REPLACE,
  OpCode.INSERT,
  OpCode.DB_CREATE,
  OpCode.DB_DROP,
  OpCode.DB_LIST,
  OpCode.TABLE_CREATE,
  OpCode.TABLE_DROP,
  OpCode.TABLE_LIST,
  OpCode.CONFIG,
  OpCode.STATUS,
  OpCode.RECONFIGURE,
  OpCode.REBALANCE,
  OpCode.SYNC,
  OpCode.GRANT,
  OpCode.INDEX_CREATE,
  OpCode.INDEX_DROP,
  OpCode.INDEX_LIST,
  OpCode.INDEX_STATUS,
  OpCode.INDEX_WAIT,
  OpCode.INDEX_RENAME,
];

