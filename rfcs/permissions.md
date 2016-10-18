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
* Group ownership is not transitive. That is, if group `A` is the
  `owning_group` of group `B`, and group `B` is the `owning_group` for
  group `C`, members of group `A` are **not** considered owners of
  group `C`, even though members of group `B` are. This is to simplify
  logic for checking ownership and circularity.
* The `owner` of a group cannot be removed from the group without
  replacing the owner, or changing ownership to another group. This is
  intended to prevent groups from being impossible to administrate.
* A group cannot be named `"ANYONE"`.

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
  "requestId": <NUMBER>,
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
  "requestId": <NUMBER>,
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
  "requestId": <NUMBER>,
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
  "requestId": <NUMBER>,
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
* ensure that the current owner of a group cannot be removed as a
  member of the group.
* ensure no group can be created with the name `ANYONE`

## Query template rules

Query templates are a white list of the shapes of queries that can be
executed by users. Rules can be enabled for certain groups, or for all
groups.

### Config changes for query template rules

Templates are specified in the `hzapp.config` file in the section
`[query_whitelist]`

There are 2 special variables: `USER` and `ANYTHING`.
- `USER` stands in for the current user. It has several properties:
  - `id` the username/primary key of the user
  - `groups` a set of groups the user belongs to
  - `groups_owned` a set of groups the user owns (either directly, or
    by being a member of an `owning_group`)
  - `appData` an object with data created and maintained by the
    app. If users have access to write to their own document, rules
    based on this data may be insecure.
- `ANYTHING` is a don't care value. This is to explicitly declare any
  value is acceptable in a query.

In the section `[query_whitelist]` each key specifies the group that
the specified queries are whitelisted for. They can't refer to groups
created dynamically by the application. There is a special group
`ANYONE` that indicates the specified queries are executable by any
user, even ones that are anonymous or unauthenticated.

As for syntax:
* The queries can start with `horizon` or `hz` before the parenthesis
* The queries should be valid javascript syntax.

Example:

```toml
[query_whitelist]
ANYONE = [
  "horizon('messages').findAll({to: USER.id})",
  "horizon('messages').findAll({from: USER.id})",
  "horizon('broadcasts').findAll({to_group: USER.groups, from: ANYTHING})",
]
admin = [
  "horizon('messages').findAll({})",
]
```

This would allow a user to retrieve all messages they have either sent
or received, as well as any broadcasts to any group the user is a
member of. (Note that `to_group: USER.groups` is not interpreted as
equality, it's translated implicitly to 'the `to_group` field matches
any elements of `USER.groups`).

This would also allow any members of the `admin` group to run queries
for all messages.

#### Subsets of whitelisted queries are ok

Extensions of whitelisted queries are allowed without explicitly
stating them.

N.B. This takes advantage of the fact that chaining more operations
onto a Horizon query currently always returns fewer results. If this
assumption is violated in the future, implicit whitelisting described
in this section will not be safe.

Example:

If there is a template:

```toml
[query_whitelist]
ANYONE = [
  "horizon('A').findAll({owner: USER.id})",
  "horizon('B')"
]
```

Then all of these queries are legal:

- `horizon('A').findAll({owner: userId})`
- `horizon('A').findAll({owner: userId}).above({date: Date.now()})`
- `horizon('A').findAll({owner: userId, type: 'car'})`
- `horizon('B')`
- `horizon('B').findAll({category: 'cars'})`
- `horizon('B').findAll({category: 'cars'}).above({date: tomorrow})`

#### Specifying write operations

Templates for write operations can restrict certain fields of
documents being stored. Implicitly, any fields not mentioned in the
template are free to be whatever the user wants.

Example:

```toml
[query_whitelist]
ANYONE = [
  "horizon('messages').insert({from: USER.id, to: USER.groups})"
]
```

The above rule would allow this query for a user in the `players`
group:

- `horizon('messages').insert({from: userId, to: 'players', msg: 'Hey there!'})`

### Server changes for query template rules

The server will need to be able to eval the whitelist rules and store
a representation of them that makes it easy to quickly validate an
incoming query.

The server will need to create a few changefeeds per user:

- A changefeed on the user's document itself. This is to keep an up-to-date view of
the user's `appData` object for evaluating rules. This may be skipped
if none of the rules make use of a user's `appData` field.
- A changefeed on the `group` internal table. This is to keep track of
which groups a user is the owner of.
- A changefeed on the `group_membership` table to keep track of which
  groups a user is a member of.

The server should be able to infer from this data which groups the
user is a member of `owning_group` for.

Crucially, it should reject queries that do not match one of the
whitelisted rules for the user's groups.

## Arbitrary js rules

Arbitrary js rules are specified in the `[js_blacklist]`
section of `hzapp.config`. Each rule has a name as a key, which can be
returned in errors to the client indicating which rule was violated.

### Config changes for arbitrary js rules

#### Read rules

Users provide an arbitrary JS function that takes as an input the
current user (including attributes on the `USER` object above), and
the document they're trying to read from the database. It returns
whether or not they're allowed to read it as a boolean.

These rules go in the `[js_blacklist]` section. As
with query templates, the group or `ANYONE` should be specified to
narrow the scope of where the rule applies.

Example:

```toml
[js_blacklist.no_old_docs]
applies_to = 'ANYONE'
for = 'reads'
collection = 'aged_documents'
js = """
function(user, document) {
  if (document.age > user.appData.maxDocAge) {
    return false;
  } else {
    return true;
  }
}
"""
```

- `applies_to` specifies this rule applies to anyone, this can be any
group name or 'ANYONE'
- `for` can be either `reads` or `writes`
- `collection` is an optional field specifying a collection the rule
  should apply to. This can also be an array of collection names. If
  not present, the rule applies globally.
- `js` contains the actual function definition

When an error is raised, it should mention that the rule `no_old_docs`
was violated for the query.

N.B. Arbitrary document ages are a very inefficient way to enforce
document schemas. They aren't intended to be used for that purpose.

#### Write rules

Write rules are similar to read rules, except that they get both the
previous version of the document and the new version of the
document. These rules go in the `[js_blacklist.writes]`
section.

Example:

Suppose for a group called `users` we have the following rule:

```toml
[js_blacklist.no_changing_ownership]
for = 'writes'
group = 'ANYONE'
js = """
function(user, oldDocument, newDocument) {
  if (oldDocument.owner !== newDocument.owner) {
    return false;
  } else {
    return true;
  }
}
"""
```

This rule would disallow changing the ownership of any document in any
collection.

#### Errors in batch writes

When an individual write in a batch write fails an arbitrary js check,
the entire batch won't fail. Instead that document will be skipped,
and the server will attempt to continue on for the rest of the
documents in the batch.

### Server changes for arbitrary js rules

The server will need to read in the permissions from the
`hzapp.config` file, and enforce them as described above.
