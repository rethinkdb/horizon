'use strict'

const Rx = require('rx')
const rethinkdbSort = require('./sort.js')

Object.assign(module.exports, {
  followCollection,
  followObject,
})

/* Reduces changefeed initial/uninitial values to a single array */
function arrayReduce(arr, change) {
  switch (change.type) {
  case 'initial':
    return arr.push(change.new_val)
  case 'uninitial':
    arr.splice(arr.findIndex(doc => doc.id === change.old_val.id), 1)
    return arr
  default:
    console.warning(`Should not happen: ${JSON.stringify(change)}`)
  }
}

function sortByFieldDirection(arr, field, ascending) {
  let comparison = rethinkdbSort
  if (!ascending) {
    comparison = (a, b) => rethinkdbSort(b, a)
  }
  arr.sort(comparison)
  return arr
}

function followCollection(responseObservable, sortBy, ascending) {
  // Take all initial values, pivot into an array
  // only grab type: 'initial', and stop on state: synced
  let initials = responseObservable
        .filter(doc => doc.type === 'initial' || doc.type === 'uninitial')
        .takeUntil(doc => doc.state === 'synced')
        .reduce(arrayReduce)
        .map(arr => sortByFieldDirection(arr, sortBy, ascending))
  // Take all values that aren't either initial or uninitial
  let changes = responseObservable
        .filter(doc => doc.type !== 'initial' && doc.type !== 'uninitial')
  // Scan over changes to the initial array. Sort by key!
  let applyChanges = observable.scan
  // Remaining issue: can I get the initial values to be the seed for
  // the scan?

}

function followObject(observable) {
  // used when the query is find and doesn't return an array
}
