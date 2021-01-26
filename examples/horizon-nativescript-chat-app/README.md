This is an example of how to integrate [Horizon](http://horizon.io/) with a [NativeScript](https://www.nativescript.org/) app.

### Prerequisites

* Install Rethinkdb: https://rethinkdb.com/docs/install/
* Install Horizon: `npm install -g horizon`


## Server Setup

### Create horizon server

```
hz init nschatApp
cd nschatAPP
hz serve --dev  --allow-unauthenticated true --auto-create-collection true --auto-create-index true
```

##Start Android version
```
npm i
tns run android
```

##Start iOS version
```
npm i
tns run ios
```
