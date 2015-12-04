'use strict'

const snakeCase = require('snake-case')

const { checkArgs,
        validIndexValue,
        strictAssign,
      } = require('./utility.js')

module.exports = {
  TermBase,
  Collection,
  FindAll,
  Find,
  Above,
  Below,
  Order,
  Limit,
}

// The outer method is called by Fusion to supply its internal
// (private) functions for querying, subscribing and doing writes The
// returned method is given to each Term, and is called with its
// initializer, to customize the object returned.
function TermBase(createSubscription, queryFunc, writeOp) {
  let termBase = initializer => {
    let term = {}
    initializer(addMethods, writeOp)
    return term

    // Given a query object, this adds the subscribe and value methods
    // to the term
    function addMethods(queryObj, ...keys) {
      term.subscribe = options => createSubscription(queryObj, options)
      term.value = () => queryFunc(queryObj)

      // Extend the object with the specified methods. Will fill in
      // error-raising methods for methods not specified, or a method
      // that complains that the method has already been added to the
      // query object.
      let methods = {
        findAll: FindAll,
        find: Find,
        order: Order,
        above: Above,
        below: Below,
        limit: Limit,
      }
      for (let key in methods) {
        if (keys.indexOf(key) !== -1) {
          // Check if query object already has it. If so, insert a dummy
          // method that throws an error.
          if (snakeCase(key) in queryObj) {
            term[key] = () => {
              throw new Error(`${key} has already been called on this query`)
            }
          } else {
            term[key] = methods[key](queryObj, termBase)
          }
        } else {
          term[key] = () => {
            throw new Error(`it is not valid to chain the method ${key} from here`)
          }
        }
      }
      return term
    }
  }
  return termBase
}


function Collection(termBase) {
  return function(collectionName) {
    let query = { collection: collectionName }
    let fusionWrite // set inside call to termBase

    return Object.assign(termBase((addMethods, writeOp) => {
      addMethods(query, 'find', 'findAll', 'order', 'above', 'below', 'limit')
      fusionWrite = (name, args, documents) => {
        checkArgs(name, args)
        let wrappedDocs = documents
        if (!Array.isArray(documents)) {
          wrappedDocs = [ documents ]
        } else if (documents.length === 0) {
          // Don't bother sending no-ops to the server
          return Promise.resolve([])
        }
        return writeOp(name, collectionName, wrappedDocs)
      }
    }), {
      // Collection public write methods
      store,
      upsert,
      insert,
      replace,
      update,
      remove,
      removeAll,
    })

    function store(documents) {
      return fusionWrite('store', arguments, documents)
    }

    function upsert(documents) {
      return fusionWrite('upsert', arguments, documents)
    }

    function insert(documents) {
      return fusionWrite('insert', arguments, documents)
    }

    function replace(documents) {
      return fusionWrite('replace', arguments, documents)
    }

    function update(documents) {
      return fusionWrite('update', arguments, documents)
    }

    function remove(documentOrId) {
      let wrapped = validIndexValue(documentOrId) ?
            { id: documentOrId } : documentOrId
      return fusionWrite('remove', arguments, [ wrapped ]).then(() => undefined)
    }

    function removeAll(documentsOrIds) {
      if (!Array.isArray(documentsOrIds)) {
        throw new Error('removeAll takes an array as an argument')
      }
      if (arguments.length > 1) {
        throw new Error('removeAll only takes one argument (an array)')
      }
      let wrapped = documentsOrIds.map(item => {
        if (validIndexValue(item)) {
          return { id: item }
        } else {
          return item
        }
      })
      return fusionWrite('remove', arguments, wrapped).then(() => undefined)
    }
  }
}

function FindAll(previousQuery, termBase) {
  return function(...fieldValues) {
    checkArgs('findAll', arguments, { maxArgs: 100 })
    let wrappedFields = fieldValues.map(item => {
      if (validIndexValue(item)) {
        return { id: item }
      } else {
        return item
      }
    })
    let findAllQuery = strictAssign(previousQuery, { find_all: wrappedFields })
    return termBase(addMethods => {
      if (wrappedFields.length === 1) {
        addMethods(findAllQuery, 'order', 'above', 'below', 'limit')
      } else {
        addMethods(findAllQuery)
      }
    })
  }
}

function Find(previousQuery, termBase) {
  return function(idOrObject) {
    checkArgs('find', arguments)
    let findObject = validIndexValue(idOrObject) ? { id: idOrObject } : idOrObject
    let findQuery = strictAssign(previousQuery, { find: findObject })
    let term = termBase(addMethods => addMethods(findQuery))

    // Wrap the .value() method with a callback that unwraps the resulting array
    let superValue = term.value
    term.value = () => superValue().then(
      resp => (resp.length === 0) ? null : resp[0])
    return term
  }
}

function Above(previousQuery, termBase) {
  return function(aboveSpec, bound = 'closed') {
    checkArgs('above', arguments, { minArgs: 1, maxArgs: 2 })
    let aboveQuery = strictAssign(previousQuery, { above: [ aboveSpec, bound ] })
    return termBase(addMethods => {
      addMethods(aboveQuery, 'findAll', 'order', 'below', 'limit')
    })
  }
}

function Below(previousQuery, termBase) {
  return function(belowSpec, bound = 'open') {
    checkArgs('below', arguments, { minArgs: 1, maxArgs: 2 })
    let belowQuery = strictAssign(previousQuery, { below: [ belowSpec, bound ] })
    return termBase(addMethods => {
      addMethods(belowQuery, 'findAll', 'order', 'above', 'limit')
    })
  }
}

function Order(previousQuery, termBase) {
  return function(fields, direction = 'ascending') {
    checkArgs('order', arguments, { minArgs: 1, maxArgs: 2 })
    let wrappedFields = Array.isArray(fields) ? fields : [ fields ]
    let orderQuery = strictAssign(previousQuery, {
      order: [ wrappedFields, direction ],
    })
    return termBase(addMethods => {
      addMethods(orderQuery, 'findAll', 'above', 'below', 'limit')
    })
  }
}

function Limit(previousQuery, termBase) {
  return function(size) {
    checkArgs('limit', arguments)
    let limitQuery = strictAssign(previousQuery, { limit: size })
    return termBase(addMethods => addMethods(limitQuery))
  }
}
