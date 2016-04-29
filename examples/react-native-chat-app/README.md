# Horizon Chat example using React

This ReactNative Chat is based on the React Chat Example.
<center>![](https://i.imgur.com/gjQw1JN.png)</center>


## How to start

Install React Native if not already installed.
```bash
* npm install -g react-native-cli
```

Install local dependencies.
```bash
npm install
```

Patch Horizon-Client-Auth
```bash
vi ./node_modules/@horizon/client/lib/auth.js
In Line 97 in the first line of the setAuthFromQueryParams fucntion 
add a `return false` to disable that function
```

Start your Database
```bash
$ hz serve --dev .
```

Start React Native & Simulator
```bash
$ npm start
```


## Todo
- [ ] Auth needs in horizon to be fixed for react native
- [ ] Implement Android currently iOS only
- [ ] Fix visual gitches
- [ ] Better error handling for more stability
