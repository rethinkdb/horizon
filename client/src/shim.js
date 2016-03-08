/* global WebSocket */

// Check for websocket
if (typeof WebSocket !== 'undefined') {
  module.exports.WebSocket = WebSocket
} else {
  module.exports.WebSocket = () => {
    console.error("Tried to use WebSocket but it isn't defined or polyfilled")
  }
}
