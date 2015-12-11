'use strict'

// This determines if Rx is defined or not
if (typeof Rx !== 'undefined') {
  module.exports.Rx = Rx
} else {
  let maybeRx = requireable('rx')
  if (maybeRx) {
    module.exports.Rx = maybeRx
  } else {
    module.exports.Rx = false
  }
}

// Check for websocket
if (typeof WebSocket !== 'undefined') {
  module.exports.WebSocket = WebSocket
} else {
  module.exports.WebSocket = () => {
    console.error(`Tried to use WebSocket but it isn't defined or polyfilled`)
  }
}

function requireable(name) {
  try {
    return require(name)
  } catch (_) {
    return false
  }
}
