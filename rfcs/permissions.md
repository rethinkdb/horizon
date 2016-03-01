# Permissions

### Related issue:
rethinkdb/horizon#4

### Problem

Any real application needs to be able to restrict what operations
users are able to perform. Horizon needs a way to specify and enforce
these kinds of permissions.

### Proposed solution

At a high level, we have

1. **Query templates** which restrict the kinds of queries that can be
   run. These are very performant since we can reject bad operations
   before a query is even executed.
2. **Arbitrary js rules** which restrict the results that can be
   returned from a query. They are specified with a pure javascript
   function, and are more flexible than query templates (at the cost
   of being potentially very slow). These are intended as an escape
   hatch when query templates aren't able to enforce the desired
   security rule.
3. **Group access permissions** each document belongs to a user or a
   group, and permission to read,write,

#### Templating

Templates are specified in the `hzapp.config` file in the section
`[permission.templates]`

There are 2 special variables: `USER` and `ANYTHING`.
- `USER` stands in for the current user document. It has any
attributes a user object will have.
- `ANYTHING` is a don't care value.

Security rules are specified by whitelisting queries.

Example:
Let's say you had a messaging app that issued 3 queries:

- "get me all the messages I've received"
- "get me all the messages I've sent"
- "send a new message"

The security rules would look like:

```toml
[permission.templates]
whitelist = [
  "horizon('messages').findAll({to: USER.id})",
  "horizon('messages').findAll({from: USER.id})",
  "horizon('messages').insert({from: USER.id, to: ANYTHING, text: ANYTHING})"
]
```

Subsets of whitelisted queries are allowed without explicit whitelisting:

Example:

If there is a template:

```toml
[permission.templates]
whitelist = [
  "horizon('A').findAll({owner: USER.id})",
  "horizon('B')"
]
```

Then all of these queries are legal:

- `horizon('A').findAll({owner: USER.id})`
- `horizon('A').findAll({owner: USER.id}).above({date: Date.now()})`
- `horizon('A').findAll({owner: USER.id, type: 'car'})`
- `horizon('B')`
- `horizon('B').findAll({category: 'cars'})`
- `horizon('B').findAll({category: 'cars'}).above({date: tomorrow})`

#### Arbitrary js

Arbitrary js rules are specified in the `[permission.js]` section of
`hzapp.config`. Each rule has a name as a key, which can be returned in
errors to the client indicating which rule was violated.

Users provide an arbitrary JS function that takes as an input the
current user (including all user attributes like groups), and the
document they're trying to read from the database. It returns whether
or not they're allowed to read it as a boolean.

Example:

```toml
[permissions.js]
no_cats_allowed = """
function(user, docToWrite) {
  if (user.groups.indexOf("cat") !== -1) {
    return false;
  }
  return true;
}
"""
```

When an individual write in a batch write fails an arbitrary js check,
the entire batch won't fail. Instead that document will be skipped,
and the server will attempt to continue on for the rest of the
documents in the batch.

#### Client changes

No client changes

#### Protocol changes

No protocol changes

#### Server changes

The server will need to read in the permissions from the
`hzapp.config` file, and enforce them as described above.

### Additional usage examples

Group permissions can be implemented as arbitrary attributes on a
user:

```toml
[permission.templates]
whitelist = [
  "horizon('users')"
]
```

## UNFINISHED
