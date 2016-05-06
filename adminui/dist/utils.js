
let getType = value =>
  value === null ? "null" :
  Array.isArray(value) ? "array" :
  typeof(value);

let css = obj =>
  Object.entries(obj).filter(([k, v]) => v).map(([k, v]) => k).join(" ");

Object.entries = object =>
  Object.keys(object)
        .filter(key => object.hasOwnProperty(key))
        .map(key => [key, object[key]]);

// From the Horizon client library
function applyChange(arr, change) {
  switch (change.type) {
  case 'remove':
  case 'uninitial': {
    if (change.old_offset != null) {
      arr.splice(change.old_offset, 1)
    } else {
      const index = arr.findIndex(x => x.id === change.old_val.id)
      arr.splice(index, 1)
    }
    break
  }
  case 'add':
  case 'initial': {
    // Add new values to the array
    if (change.new_offset != null) {
      // If we have an offset, put it in the correct location
      arr.splice(change.new_offset, 0, change.new_val)
    } else {
      // otherwise for unordered results, push it on the end
      arr.push(change.new_val)
    }
    break
  }
  case 'change': {
    // Modify in place if a change is happening
    if (change.old_offset != null) {
      // Remove the old document from the results
      arr.splice(change.old_offset, 1)
    }
    if (change.new_offset != null) {
      // Splice in the new val if we have an offset
      arr.splice(change.new_offset, 0, change.new_val)
    } else {
      // If we don't have an offset, find the old val and
      // replace it with the new val
      const index = arr.findIndex(x => x.id === change.old_val.id)
      arr[index] = change.new_val
    }
    break
  }
  case 'state': {
    // This gets hit if we have not emitted yet, and should
    // result in an empty array being output.
    break
  }
  default:
    throw new Error(
      `unrecognized 'type' field from server ${JSON.stringify(change)}`)
  }
  return arr
}