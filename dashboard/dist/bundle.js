function app(opts, expand) {
      
IncrementalDOM.elementOpen("style", null, null);
      
    IncrementalDOM.elementClose("style");


    let data = model.data();
    let {navigation} = data.state;
  

IncrementalDOM.elementOpen("main", null, null);
      
IncrementalDOM.elementOpen("header", null, null);
      
IncrementalDOM.elementVoid("img", null, null, "id", "logo", "src", "images/mark-text.png")

IncrementalDOM.elementOpen("nav", null, null);
      
navigation.items.forEach(function(item, index) {
IncrementalDOM.elementOpen("div", null, null, "class", navigation.selected === item ? 'selected' : '');
      
IncrementalDOM.elementOpen("a", null, null, "href", "#", "onclick", ev => model.navigate(item));
      IncrementalDOM.text(`${item}`);
    IncrementalDOM.elementClose("a");

    IncrementalDOM.elementClose("div");
});

    IncrementalDOM.elementClose("nav");

    IncrementalDOM.elementClose("header");

dashboard({"model": model,"data": data}, function() {
      
    });

    IncrementalDOM.elementClose("main");

IncrementalDOM.elementVoid("footer", null, null)

    }
function tile(opts, expand) {
      
IncrementalDOM.elementOpen("div", null, null, "class", `tile ${opts.class}`);
      
IncrementalDOM.elementOpen("div", null, null, "class", "inner");
      
IncrementalDOM.elementOpen("div", null, null, "class", "content");
      expand()
    IncrementalDOM.elementClose("div");

IncrementalDOM.elementOpen("div", null, null, "class", "caption");
      IncrementalDOM.text(`${opts.caption}`);
    IncrementalDOM.elementClose("div");

    IncrementalDOM.elementClose("div");

    IncrementalDOM.elementClose("div");

    }
function tiles(opts, expand) {
      

    let {clients, collections, cursors} = opts.data;
  

IncrementalDOM.elementOpen("div", null, null, "class", "tiles");
      
tile({"caption": "Clients","class": "clients"}, function() {
      
IncrementalDOM.elementVoid("i", null, null, "class", "icon ion-ios-person")

IncrementalDOM.elementOpen("div", null, null, "class", "value");
      IncrementalDOM.text(`${clients.length}`);
    IncrementalDOM.elementClose("div");

    });

tile({"caption": "Collections","class": "collections"}, function() {
      
IncrementalDOM.elementVoid("i", null, null, "class", "icon ion-ios-copy")

IncrementalDOM.elementOpen("div", null, null, "class", "value");
      IncrementalDOM.text(`${collections.length}`);
    IncrementalDOM.elementClose("div");

    });

tile({"caption": "Requests","class": "requests"}, function() {
      
IncrementalDOM.elementVoid("i", null, null, "class", "icon ion-ios-pulse")

IncrementalDOM.elementOpen("div", null, null, "class", "value");
      IncrementalDOM.text(`${cursors.length}`);
    IncrementalDOM.elementClose("div");

    });

    IncrementalDOM.elementClose("div");

    }
function dashboard(opts, expand) {
      
IncrementalDOM.elementOpen("div", null, null, "id", "dashboard", "class", "epoch-theme-default");
      
tiles({"data": opts.data}, function() {
      
    });

IncrementalDOM.elementOpen("div", null, null, "class", "graph-container");
      
if (!opts.model.graph) {
IncrementalDOM.elementVoid("div", null, null, "id", "graph", "class", "epoch")

opts.model.initializeGraph();
} else {IncrementalDOM.skip()}

    IncrementalDOM.elementClose("div");

IncrementalDOM.elementOpen("div", null, null, "class", "box");
      
IncrementalDOM.elementOpen("div", null, null, "class", "title requests");
      
IncrementalDOM.elementOpen("h2", null, null);
      IncrementalDOM.elementVoid("i", null, null, "class", "icon ion-ios-pulse")
IncrementalDOM.text(` Recent Requests`);
    IncrementalDOM.elementClose("h2");

    IncrementalDOM.elementClose("div");

IncrementalDOM.elementOpen("table", null, null);
      
IncrementalDOM.elementOpen("tr", null, null);
      
IncrementalDOM.elementOpen("th", null, null);
      IncrementalDOM.text(`Command`);
    IncrementalDOM.elementClose("th");

IncrementalDOM.elementVoid("th", null, null)

IncrementalDOM.elementOpen("th", null, null);
      IncrementalDOM.text(`Client`);
    IncrementalDOM.elementClose("th");

IncrementalDOM.elementVoid("th", null, null)

IncrementalDOM.elementOpen("th", null, null);
      IncrementalDOM.text(`Collection`);
    IncrementalDOM.elementClose("th");

IncrementalDOM.elementVoid("th", null, null)

IncrementalDOM.elementOpen("th", null, null);
      IncrementalDOM.text(`Time`);
    IncrementalDOM.elementClose("th");

    IncrementalDOM.elementClose("tr");

opts.data.requests.slice(0,5).forEach(function(req, index) {
IncrementalDOM.elementOpen("tr", `${req.id[0]}-${req.id[1]}`, ["class", "item"], "key", `${req.id[0]}-${req.id[1]}`);
      
IncrementalDOM.elementOpen("td", null, null, "class", `token requests ${req.raw.type}`);
      
IncrementalDOM.elementVoid("i", null, null, "class", `icon ion-ionic icon-${req.raw.type}`)

IncrementalDOM.elementOpen("span", null, null, "class", "text");
      IncrementalDOM.text(`${req.raw.type}`);
    IncrementalDOM.elementClose("span");

    IncrementalDOM.elementClose("td");

IncrementalDOM.elementOpen("td", null, null, "class", "between");
      IncrementalDOM.text(`by`);
    IncrementalDOM.elementClose("td");

IncrementalDOM.elementOpen("td", null, null, "class", "token clients");
      
IncrementalDOM.elementVoid("i", null, null, "class", "icon ion-ios-person")

IncrementalDOM.elementOpen("span", null, null, "class", "text");
      IncrementalDOM.text(`${req.client.ip}`);
    IncrementalDOM.elementClose("span");

    IncrementalDOM.elementClose("td");

IncrementalDOM.elementOpen("td", null, null, "class", "between");
      IncrementalDOM.text(`on`);
    IncrementalDOM.elementClose("td");

IncrementalDOM.elementOpen("td", null, null, "class", "collections token");
      
IncrementalDOM.elementVoid("i", null, null, "class", "icon ion-ios-copy")

IncrementalDOM.elementOpen("span", null, null, "class", "text");
      IncrementalDOM.text(`${req.raw.options.collection}`);
    IncrementalDOM.elementClose("span");

    IncrementalDOM.elementClose("td");

IncrementalDOM.elementOpen("td", null, null, "class", "between");
      IncrementalDOM.text(`at`);
    IncrementalDOM.elementClose("td");

IncrementalDOM.elementOpen("td", null, null, "class", "token timestamp");
      
IncrementalDOM.elementOpen("span", null, null, "class", "text");
      
IncrementalDOM.elementVoid("i", null, null, "class", "icon ion-ios-clock")

time({"time": req.time,"format": "MMM D hh:mm a"}, function() {
      
    });

    IncrementalDOM.elementClose("span");

    IncrementalDOM.elementClose("td");

    IncrementalDOM.elementClose("tr");
});

    IncrementalDOM.elementClose("table");

IncrementalDOM.elementOpen("div", null, null, "class", "box");
      
IncrementalDOM.elementOpen("div", null, null, "class", "title clients");
      
IncrementalDOM.elementOpen("h2", null, null);
      IncrementalDOM.elementVoid("i", null, null, "class", "icon ion-ios-person")
IncrementalDOM.text(` Recent Clients`);
    IncrementalDOM.elementClose("h2");

    IncrementalDOM.elementClose("div");

IncrementalDOM.elementOpen("table", null, null);
      
IncrementalDOM.elementOpen("tr", null, null);
      
IncrementalDOM.elementOpen("th", null, null);
      IncrementalDOM.text(`Address`);
    IncrementalDOM.elementClose("th");

IncrementalDOM.elementVoid("th", null, null)

IncrementalDOM.elementOpen("th", null, null);
      IncrementalDOM.text(`Origin`);
    IncrementalDOM.elementClose("th");

IncrementalDOM.elementVoid("th", null, null)

IncrementalDOM.elementOpen("th", null, null);
      IncrementalDOM.text(`Time`);
    IncrementalDOM.elementClose("th");

    IncrementalDOM.elementClose("tr");

opts.data.clients.slice(0,10).forEach(function(client, index) {
IncrementalDOM.elementOpen("tr", `${client.id}-recent-client`, ["class", "item"], "key", `${client.id}-recent-client`);
      
IncrementalDOM.elementOpen("td", null, null, "class", "token clients");
      
IncrementalDOM.elementVoid("i", null, null, "class", "icon ion-ios-person")

IncrementalDOM.elementOpen("span", null, null, "class", "text");
      IncrementalDOM.text(`${client.ip}`);
    IncrementalDOM.elementClose("span");

    IncrementalDOM.elementClose("td");

IncrementalDOM.elementOpen("td", null, null, "class", "between");
      IncrementalDOM.text(`from`);
    IncrementalDOM.elementClose("td");

IncrementalDOM.elementOpen("td", null, null, "class", "token collections");
      
IncrementalDOM.elementOpen("span", null, null, "class", "text");
      IncrementalDOM.text(`${client.origin}`);
    IncrementalDOM.elementClose("span");

    IncrementalDOM.elementClose("td");

IncrementalDOM.elementOpen("td", null, null, "class", "between");
      IncrementalDOM.text(`at`);
    IncrementalDOM.elementClose("td");

IncrementalDOM.elementOpen("td", null, null, "class", "token timestamp");
      
IncrementalDOM.elementOpen("span", null, null, "class", "text");
      
IncrementalDOM.elementVoid("i", null, null, "class", "icon ion-ios-clock")

time({"time": client.time,"format": "MMM D hh:mm a"}, function() {
      
    });

    IncrementalDOM.elementClose("span");

    IncrementalDOM.elementClose("td");

    IncrementalDOM.elementClose("tr");
});

    IncrementalDOM.elementClose("table");

    IncrementalDOM.elementClose("div");

    IncrementalDOM.elementClose("div");

    IncrementalDOM.elementClose("div");
    }
function request(opts, expand) {
      
IncrementalDOM.elementOpen("h3", null, null);
      IncrementalDOM.text(`Request`);
    IncrementalDOM.elementClose("h3");

IncrementalDOM.elementOpen("p", null, null);
      IncrementalDOM.text(`${opts.request}`);
    IncrementalDOM.elementClose("p");

IncrementalDOM.elementOpen("div", null, null, "class", "request-editor");
      
IncrementalDOM.elementOpen("p", null, null);
      IncrementalDOM.text(`${JSON.stringify(opts.request)}`);
    IncrementalDOM.elementClose("p");

IncrementalDOM.elementOpen("p", null, null);
      IncrementalDOM.text(`${opts.request.id[0]}`);
    IncrementalDOM.elementClose("p");

IncrementalDOM.elementOpen("p", null, null);
      IncrementalDOM.elementOpen("span", null, null, "class", "token requests");
      IncrementalDOM.text(`test`);
    IncrementalDOM.elementClose("span");
    IncrementalDOM.elementClose("p");

IncrementalDOM.elementOpen("h4", null, null);
      IncrementalDOM.text(`Raw Request:`);
    IncrementalDOM.elementClose("h4");

IncrementalDOM.elementOpen("textarea", null, null, "class", "raw", "oninput", editText);
      IncrementalDOM.text(`${JSON.stringify(opts.request.raw)}`);
    IncrementalDOM.elementClose("textarea");

IncrementalDOM.elementOpen("button", null, null, "onclick", sendRawRequest);
      IncrementalDOM.text(`Replay`);
    IncrementalDOM.elementClose("button");

    IncrementalDOM.elementClose("div");


  var currentText = "";

  function editText(ev) {
    console.log("Edit text:", ev);
    currentText = ev.target.value;
  }

  function sendRawRequest(ev) {
    console.log("This is a test:", ev, currentText);
  }
  

    }
function time(opts, expand) {
      
IncrementalDOM.elementOpen("span", null, null, "class", "time");
      IncrementalDOM.text(`${moment(opts.time).format(opts.format)}`);
    IncrementalDOM.elementClose("span");

    }