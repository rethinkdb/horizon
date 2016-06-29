### Handshake
The handshake is required before any requests can be served.  If the first message sent cannot be parsed as a handshake, the connection will be dropped.  The handshake will be used to associate the client with a specific user (and set of security rules) on the server.  This should be extensible in the same way as #12.

For now let's just leave this a placeholder, since we haven't gotten to authentication yet.

#### Handshake Request
```
{
  "request_id": <NUMBER>,
  "method": "unauthenticated" | "anonymous" | "token",
  "token": <STRING>,
}
```

* `request_id` is a number uniquely identifying this request, it will be returned in the response.
* `method` designates the type of authentication to be performed.
  * `unauthenticated` performs no further steps and will not associate the connection with any user.
  * `anonymous` will create a new account with no external authentication provider.
  * `token` will associate the connection with the user in the horizon access token provided.
* `token` is the horizon access token that the client must already possess.
  * This field is required when `method` is `token`, and invalid otherwise.

#### Handshake Response
```
{
  "request_id": <NUMBER>,
  "token": <STRING>
}
```
* `token` is the horizon access token that is associated with this connection.
  * This token may be used to establish new connections under the same user account until the token expires.

#### Handshake Error Response
```
{
  "request_id": <NUMBER>,
  "error": <STRING>,
  "error_code": <NUMBER>
}
```

### Requests

All requests match the following pattern:
```
{
  "request_id": <NUMBER>,
  "type": <STRING>,
  "options": <OBJECT>
}
```
* `request_id` is a number uniquely identifying this request, it will be returned in any responses
* `type` is the endpoint for the query - one of `query`, `subscribe`, `store_error`, `store_replace`, `update`, or `remove`.
* `options` is an object structured differently for each endpoint.


#### query, subscribe

```
{
  "request_id": <NUMBER>,
  "type": "query" | "subscribe",
  "options": {
    "collection": <STRING>,
    "order": [ <ARRAY>, "ascending" | "descending"],
    "above": [ <OBJECT>, "open" | "closed" ],
    "below": [ <OBJECT>, "open" | "closed" ],
    "find": <OBJECT>,
    "find_all": [<OBJECT>, ...],
    "limit": <NUMBER>,
  }
}
```
* `collection` describes which table to operate on in the horizon database.
* `order` orders the results according to an array of fields - optional.
  * The first argument is an array of field names, most-significant first.
  * The second argument determines which direction the results are sorted in.
* `above` and `below` are arrays describing the boundaries regarding `order` - optional.
  * `above` and `below` can only be specified if `order` is provided.
  * The first argument is an object whose key-value pairs correspond to fields in `order`.
  * The second argument should be `closed` to include the boundary, and `open` otherwise.
* `find` returns one object in `collection` that exactly matches the fields in the object given - optional.
  * `find` cannot be used with `find_all`, `order`, `above`, or `below`.
* `find_all` is an array of objects whose key-value pairs correspond to keys in `index` - optional.
  * Returns any object in `collection` that exactly matches the fields in any of the objects given.
  * `find_all` cannot be used with `find`.
  * `find_all` with multiple objects cannot be used with `order`, `above`, or `below`.
* `limit` limits the number of results to be selected - optional.

#### insert, store, upsert, replace, update, remove

```
{
  "request_id": <NUMBER>,
  "type": "store" | "update" | "upsert" | "insert" | "replace" | "remove",
  "options": {
    "collection": <STRING>,
    "data": [<OBJECT>, ... ]
  }
}
```
* `collection` describes which table to operate on in the horizon database
* `data` is the documents to be written (or removed)
  * `data[i].id` is required for `remove` operations, all other fields are optional
  * `data[i].id` may be omitted in an `insert`, `store`, or `upsert` operations: a new row will be inserted in the collection
* `type` is the write operation to perform
  * `insert` inserts new documents, erroring if any document already exists
  * `update` updates existing documents. It errors if any document does not already exist
  * `upsert` updates existing documents or inserts them if they do not exist
  * `replace` replaces existing documents entirely. It errors if any document does not already exist
  * `store` replaces existing documents entirely, or inserts them if they don't exist.
  * `remove` removes documents. It will not error if a document does not exist

#### end_subscription
Tells the horizon server to stop sending data for a given subscription.  Data may still be received until the server has processed this and sent a `"state": "complete"` response for the subscription.
```
{
  "request_id": <NUMBER>,
  "type": "end_subscription"
}
```

#### Keepalive
This is used by the client to perform an empty request to avoid connection interruption.
```
{
  "request_id": <NUMBER>,
  "type": "keepalive"
}
```

### Responses

#### Error Response
This can be sent for any request at any time.  Once an error response is sent, no further responses shall be sent for the corresponding `request_id`.
```
{
  "request_id": <NUMBER>,
  "error": <STRING>,
  "error_code": <INTEGER>
}
```
* `request_id` is the same as the `request_id` in the corresponding request
* `error` is a descriptive error string
* `error_code` is a code that can be used to identify the type of error, values TBD

#### query, subscribe
`query` and `subscribe` requests will result in a stream of results from the horizon server to the client.  The stream will be an ordered set of messages from the server following the structure below.  If an error occurs, the above Error Response structure will be used, and the stream is considered "complete".  An Error Response may still be sent even after a successful data response, but not after `"state": "complete"`.
```
{
  "request_id": <NUMBER>,
  "data": <ARRAY>,
  "state": "synced" | "complete"
}
```
* `request_id` is the same as the `request_id` in the corresponding request
* `data` is an array of results for the `query` or `subscribe`, and may be empty
* `state` is optional, and indicates a change in the stream of data:
  * `synced` means that following the consumption of `data`, the client has all the initial results of a `subscribe`
  * `complete` means that following the consumption of `data`, no more results will be returned for the request

#### Write responses
`store`, `replace`, `insert`, `update`, `upsert`, and `remove` requests will be given a single response.  This may be an Error Response, or:
```
{
  "request_id": <NUMBER>,
  "data": [ { "id": <DOCUMENT_ID>, "$hz_v$": <DOCUMENT_VERSION> } | { "error": <STRING>, "error_code": <INTEGER> }, ...],
  "state": "complete"
}
```
* `data` is an array of objects corresponding to the documents specified in the write (whether or not a change occurred). For inserted documents it will be the id generated by the server as well as the latest version field for the affected document.  If an error occurred, there will instead be an error description string and an error code in the object .  The items in the array correspond directly to the changes in the request, in the same order.
* `state` can only be "complete" for write responses

#### Keepalive
`keepalive` requests will be given a single response.  This will never be an error response unless there is a protocol error.
```
{
  "request_id": <NUMBER>,
  "state": "complete"
}
```
