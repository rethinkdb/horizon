# Identity Management

### Related issue:
rethinkdb/horizon#3

### Problem

Horizon needs a concept of a user, and clients of a Horizon server
need to be able to add, delete and list users. Users are a fundamental
entity needed for both the authentication system and permission
system. App developers may also want to add additional meaning to
users depending on their needs.

### Proposed solution

Create a virtual collection called `users` which is really a view into the internal Horizon users table. All operations should transparently operate on a subdocument in the real table.

#### Client changes

No client changes necessary. There will simply appear to be an
ordinary collection in new apps called `users`.

Examples:

```js
horizon('users').find(userId)
horizon('users').findAll({first_name: "John", last_name: "Smith"})
```

#### Protocol changes

No protocol changes.

#### Server changes

A `horizon_internal.users` table exists internally right now for
authentication. We should continue to use this to track users, but
should add a sub-document with the key `app_data`. When a query or
write operation from the client refers to the `users` collection, it
instead should operate on the the `app_data` subdocument.

Example:

Actual document in `horizon_internal.users`:

```json
{
  "id": 23,
  "permissions": [],
  "app_data": {
    "foo": "bar"
  }
}
```
Document returned when client requests user 23:

```json
{
  "id": 23,
  "foo": "bar"
}
```

Resulting document after `horizon('users').update({id: 23, age: 65})`

``` json
{
  "id": 23,
  "permissions": [],
  "app_data": {
    "foo": "bar",
    "age": 65
  }
}
```

Additionally, queries for users will use secondary indexes on the
nested `app_data` document, but queries for users by id will use the
primary key of the document.

Example:

A client query like:

Client query:
```js
horizon('users').findAll({age: 65}).fetch()
```

Backend:
```js
// index creation
r.db('horizon_internal').table('users').indexCreate('app_data_age', x => x('app_data')('age'))
// query
r.db('horizon_internal').table('users').getAll(65, {index: 'app_data_age'})
```
