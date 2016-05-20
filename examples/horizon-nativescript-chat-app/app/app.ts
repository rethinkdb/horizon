import application = require("application");
var moment = require("moment");

require('nativescript-websockets');

function fromNow(value:Date): any {
  if(value){
    return moment(value).fromNow();
  }
}

application.resources['fromNow'] = fromNow;
application.start({ moduleName: "main-page" });
