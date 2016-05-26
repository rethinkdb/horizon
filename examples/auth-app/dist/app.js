'use strict'

const horizon = Horizon({ authType: 'anonymous'});

const crossOut = (element) => {
  element.setAttribute("style", "text-decoration: line-through; color: grey;");
}

// #1 - Connect to Horizon server

horizon.onReady(() => {
  crossOut(document.querySelector('#connection-success'));
})

horizon.connect();

// #2 - Ensure Github OAuth client_id & client_secret added

fetch("/horizon/auth_methods").then((response) => {
  return response.text();
}).then((json) => {
  console.log(json)
  const strategies = JSON.parse(json);
  if (strategies.auth && strategies.indexOf('github') >= 0){
    crossOut(document.querySelector('#github-configured'));
  }
})


// #3 - Create

if(!horizon.hasAuthToken()){
  
}
