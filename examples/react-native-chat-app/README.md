# Horizon Chat example using React

<img src="https://i.imgur.com/gjQw1JN.png" width="248">
<br>
React Chat Example in React Native.

## Todo
- [ ] Auth in horizon needs to be fixed rethinkdb/horizon#255. Works with a disabled auth (see "How to start")
- [ ] Add Android
- [ ] Better error handling for more stability
- [ ] Fix visual gitches

## How to start

Install React Native if not already installed.
```bash
* npm install -g react-native-cli
```

Install local dependencies.
```bash
npm install
```

Until Issue rethinkdb/horizon#255 is resolved. Disable auth by patch auth.js
```bash
vi +97 ./node_modules/@horizon/client/lib/auth.js
In line 97 add a return false to setAuthFromQueryParams to exit without doing anything
add a `return false` to disable it
```

Start your Database
```bash
$ hz serve --dev .
```

Start React Native & iOS Simulator
```bash
$ npm start
```

