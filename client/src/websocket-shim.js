if(WebSocket !== undefined){
  module.exports = WebSocket
}else{
  module.exports = () => {
    console.error("Tried to use WebSocket but it isn't defined or polyfilled")
  }
}
