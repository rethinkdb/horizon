# Getting started with Horizon


First, install horizon from npm:

```
$ npm install -g horizon
```

Now you can initialize a new horizon project:

```
$ hz init example-app
```

This will create a directory with the following files:

```
$ tree -aF example-app/
example-app/
├── dist/
│   └── index.html
├── .hzconfig
└── src/
```

The `dist` directory is where you should output your static
files. Horizon doesn't have any opinions about what front-end build
system you use, just that the files to serve end up in `dist`. Your
source files would go into `src` but that's just a convention. Horizon
doesn't touch anything in `src`.

If you want, you can `npm init` or `bower init` in the `example-app`
directory to set up dependencies etc.

By default, horizon creates a basic `index.html` to serve so you can
verify everything is working:

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8">
    <script src="/horizon/horizon.js"></script>
    <script>
      var horizon = Horizon();
      horizon.onConnected(function() {
        document.querySelector('h1').innerHTML = 'It works!'
      });
    </script>
  </head>
  <body>
   <marquee><h1></h1></marquee>
  </body>
</html>
```

Finally, let's start up a horizon server in dev mode. This will start
a RethinkDB instance, connect to it, and serve our static files from
`example-app/dist`.

```
$ hz serve example-app --dev
Starting RethinkDB ...
Admin UI available on port 8080
Driver connections should connect on 28015
Horizon is running and available at http://localhost:8181
```
