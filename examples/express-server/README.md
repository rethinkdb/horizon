
#Embedding horizon within express

This folder contains a simple example that shows how to embed horizon within an express server. This offers the opportunity to integrate horizon at different stages with an express app. 

###Before we start
Make sure that you have the latest version of horizon installed. [Installing horizon](http://horizon.io/install/).
At the same time make sure that you have rethinkdb installed. [Installing rethinkdb](https://www.rethinkdb.com/docs/install/).

###Running the example
Let's initialize our app using horizon cli, we will call this app **example_app**.

```
hz init example_app
```
Let's turn on rethinkdb which will by default listen at port 28015.
```
rethinkdb
```
the **hz init** command will create a directory for us called example_app (which is the app name), now we will go to that directory.

```
cd example_app
```
Our default schema is found in **.hz** directory, to apply that schema we run the following command.
```
hz schema apply .hz/schema.toml
```
Copy the files of this repo (main.js and package.json) to our example_app directory, then run the following commands

```
npm i
node main.js
```
That's it. Head to http://localhost:8181 to see the example app running.








   
