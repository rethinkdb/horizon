# Permissions

## Description

[Related issue (#4)](https://github.com/rethinkdb/horizon/issues/4)

Any real application needs to be able to restrict what operations
users are able to perform on the database. Horizon needs a way to
specify and enforce these kinds of permissions.

## Proposed solution

At a high level, we are adding three new things:

1. **Groups** which users can belong to and own. It's also possible
   for a group to own another group. There will be new query types
   specifically for interacting with groups.
2. **Query template rules** which restrict the kinds of queries that can be
   run by a user. These are very performant since we can reject bad
   operations before a query is even executed.
3. **Arbitrary js rules** which restrict the results that can be
   returned from a query. They are specified with a pure javascript
   function, and are more flexible than query templates (at the cost
   of being potentially very slow). These are intended as an escape
   hatch when query templates aren't able to enforce the desired
   security rule.

Permissions will be specified in the `hzapp.config` file (which is
where app-level configuration like table names and secondary indexes
are defined). You may also specify hardcoded users and groups in the
config as well.

## Groups

* Each group has either an `owner` or an `owning_group`, as well as a
list of members.
* An `owner` can delete the group and add members to the group.
* If the group has an `owning_group` instead of an `owner`, any member
of the `owning_group` may delete the owned group as well as add and remove
members from the owned group.
* If a user is the `owner` of a group, she is automatically a member
of the group.
* However, members of an `owning_group` are not considered members of
  the owned group unless explicitly placed into the group.
* The `owning_group` can be the group itself. This is useful for
  creating administrator groups.

### Config file changes for groups

The config file gains two new sections related to groups:

`initial.users` contains one section for each user that should be
created when the app is set up for the first time. These users are
considered "hard coded" and can be assumed to be present in client
code. The keys in each user's section will be placed in the appData
document for that user (see the
[RFC on users](https://github.com/rethinkdb/horizon/pull/151)). If
there is no appData for that user, the section can be empty. The
purpose of this section is mainly useful for hard-coding
administrative users.

`initial.groups` contains one section for each new group. Each group
must have either an `owner` key, or an `owning_group` key. The `owner`
and `owning_group` values may only refer to groups and users specified
in the `initial.groups` and `initial.users` section. While groups can
be created dynamically (see the client section below), it's also
perfectly possible that an app may create all of its groups up front
and forbid new group creation outright.

Example:

```toml
[initial.user.admin]
foo = 'bar'
[initial.user.superadmin]
[initial.user.dalanmiller]
[initial.user.deontologician]
[initial.user.tryneus]

[initial.groups.administrators]
owning_group = 'administrators'
members = [ 'superadmin', 'admin' ]

[initial.groups.users]
owning_group = 'administrators'
members = [
 'dalanmiller',
 'deontologician',
 'tryneus',
]
```

### Client changes for groups

The Horizon client will gain a new `group` method at the same level as
collections, and supporting all the same operations as `.get`, with
restrictions on how the document can be manipulated.

`horizon.groups()` will refer to the "collection" of groups. It lives
in a different namespace from normal collections because the server
enforces some rules for operating on documents in the table.

A group document has the keys:
- `id`: contains the name of the group (referred to as `groupName` in
  this rfc)
- `owner`/`owning_group` with the `userId`/`groupName` that owns it

All of the write operations allowed on normal documents are allowed on
`.groups()`:
- `horizon.groups().[insert|store|upsert|replace|remove]`. These have
  their normal semantics, but will fail if any keys other than `id`,
  `owner` or `owning_group` are added, or if they are not valid (for
  instance, if they don't refer to a real user or group).
  - these operations are how groups are created, deleted, and
    ownership is changed.
  - if `insert`ing a group, and no `owner`/`owning_group` is set, the
    insert will fail.
- `horizon.groups().[find|findAll|above|below|order|limit]` have their
  normal semantics, except on groups.
- `horizon.groups().find(groupName).add(userId)` will add a user to a group.
- `horizon.groups().find(groupName).remove(userId)` will remove a user from a
  group. This is different from `horizon.groups().remove(groupName)`
  which will delete the group itself.
- `horizon.groups().find(groupName).members()` will list all members
  of the group. Documents will look like:

```
{
 "id": <GROUPNAME>,
 "owner" | "member": <USERID>,
}
```

Since members of an `owning_group` are not considered members of the
owned group, they will not be returned in the results of a `members()`
query.

### Protocol changes for groups

The write operations (`insert`, `update`, `upsert`, `replace`,
`store`, `remove`), as well as the read operations (`query`,
`subscribe`) will now allow the field `group_name` to be given
anywhere `collection` was accepted before. `group_name` and
`collection` are mutually exclusive.

Additionally, when the request type is `query` or `subscribe`, and the
`options` object has the `find` key set, the key `members` may be set
to `null`.

There is a new request type `group_members`, which enables the `add`
and `remove` operations on groups. When the the type is
`group_members`, the `options` key must contain the key `group_name`
with the name of the group, and either:
  - `add` with an array of userIds to add to the group; or
  - `remove` with an array of userIds to remove from the group

Examples:

`horizon.groups().find(groupName).members()` translates to:

```
{
  "request_id": <NUMBER>,
  "type": "query",
  "options": {
    "group_name": <GROUPNAME>,
    "members": null
  }
}
```

`horizon.groups().findAll({owner: userId}).limit(3)` translates to:

```
{
  "request_id": <NUMBER>,
  "type": "query",
  "options": {
    "group_name": null,
    "findAll": [{owner: <USERID>}],
    "limit": 3
  }
}
```

`horizon.groups().find(groupName).add(userId)` translates to:

```
{
  "request_id": <NUMBER>,
  "type": "group_members",
  "options": {
    "group_name": <GROUPNAME>,'
    "add": [<USERID>, ...],
  }
}
```

`horizon.groups().remove(groupName)` translates to:

```
{
  "request_id": <NUMBER>,
  "type": "remove",
  "options": {
    "group_name": <GROUPNAME>,
    "data": [<USERID>, ...]
  }
}
```

### Server changes for groups

The server will create two new internal tables: `groups` and
`group_members`.

`groups` will have the schema:

```
{
  "id": <GROUPNAME>,
  "owner" | "owning_group": <USERID> | <GROUPNAME>
}
```

The `group_members` table will have the schema:

```
{
  "id": [<GROUPNAME>, <USERID>]
}
```

There should be a secondary index on the user id, so groups can be
looked up for a user.

When creating a group, the document should first be inserted into the
`groups` table with the intended `owner`, then a member entry should
be added to the `group_membership` table. This allows the groups table
to become inconsistent if a crash in the server or client happens
between the `groups` insert and the `group_members` insert. In the
future, we should solve this with true two-phase commits, but for now
it's a rare enough problem and is mainly an inconvenience (since the
group name will just become unusable).

Additional things the server needs to do:
* ensure that inserts into the `group_members` table are valid user
  ids from the `users` table.
* ensure that when setting `owning_group`, the value is either the
  name of the current group, or is the name of an existing group.
* ensure that when a request operates on a group, that the user is
  either the owner of that group, or the user is a member of the
  `owning_group`.

## Query template rules

Query templates are a white list of the shapes of queries that can be
executed by users. Rules can be enabled for certain groups, or for all
groups.

### Config changes for query template rules

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
[permissions.query.whitelist]
ANYONE = [
  "horizon('messages').findAll({to: USER.id})",
  "horizon('messages').findAll({from: USER.id})",
  "horizon('messages').insert({from: USER.id, to: ANYTHING, text: ANYTHING})"
]
```

**TODO** validate rest of this section, correct it.

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

### Server changes for query template rules

**TODO**

## Arbitrary js rules

Arbitrary js rules are specified in the `[permission.js]` section of
`hzapp.config`. Each rule has a name as a key, which can be returned in
errors to the client indicating which rule was violated.

**TODO**

### Config changes for arbitrary js rules

**TODO** validate and correct this section

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


#### Server changes for arbitrary js rules

The server will need to read in the permissions from the
`hzapp.config` file, and enforce them as described above.

**TODO** complete section
