### Handshake
The handshake is required before any requests can be served.  If the first message sent cannot be parsed as a handshake, the connection will be dropped.  The handshake will be used to associate the client with a specific user (and set of security rules) on the server.  This should be extensible in the same way as #12.

For now let's just leave this a placeholder, since we haven't gotten to authentication yet.

#### Handshake Request
```
{ "request_id": <NUMBER> }
```

#### Handshake Response
```
{ "request_id": <NUMBER>, "user_id": <VALUE> }
```

#### Handshake Error Response
```
{ "request_id": <NUMBER>, "error": <STRING>, "error_code": <NUMBER> }
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
    "index": <ARRAY>,
    "order": "ascending" | "descending"
    "lower_bound": [ <OBJECT>, "open" | "closed" ],
    "upper_bound": [ <OBJECT>, "open" | "closed" ],
    "find": <OBJECT>,
    "find_all": [<OBJECT>, ...],
    "limit": <NUMBER>,
  }
}
```
* `collection` describes which table to operate on in the fusion database
* `index` is an array of field names to index the query by. It must be specified.
  * The order of field names in `index` should be in order of decreasing cardinality.
* `order` orders the results according to `index` - optional
* `lower_bound` and `upper_bound` are arrays describing the boundaries regarding `index`.
  * `lower_bound` and `upper_bound` can only be specified if `order` is provided.
  * The first argument is an object whose key-value pairs correspond to keys in `index`.
  * The second argument should be `closed` to include the boundary, and `open` otherwise.
* `find` is an object whose key-value pairs correspond to keys in `index`.
  * `find` will select a subset of `collection` which matches all the fields in the object.
  * The keys should correspond to a subset of the `index` fields, starting from the left.
  * The values indicate the literal values for those fields.
* `find_all` is an array of objects whose key-value pairs correspond to keys in `index`.
  * `find_all` cannot be specified with `find`, `order`, `lower_bound`, or `upper_bound`.
  * `find_all` will select a subset of `collection` which matches all the fields in any of the objects given.
* `limit` limits the number of results to be selected - optional

Notes:
`index` determines the underlying single or compound index that the implementation
will use to fulfill the query.  Order is important, a different combination of the
same fields will result in a different index being utilized.  In the `index` array,
fields on the right are used as tie-breakers for fields on the left.  Thus, the
fields tied to a hard value by `find` should be at the beginning of the array,
and the fields used with `lower_bound` and `upper_bound` should be at the end of
the array (with the least-significant last).

Because `find_all` may select discontinuous chunks of data from across the collection,
it cannot be meaningfully used with `order`, `lower_bound`, or `upper_bound`.

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
* `collection` describes which table to operate on in the fusion database
* `data` is the documents to be written (or removed)
  * `data[i].id` is required for `remove` operations, all other fields are optional
  * `data[i].id` may be omitted in an `insert`, `store`, or `upsert` operations: a new row will be inserted in the collection
* `type` is the write operation to perform
  * `insert` inserts new documents, erroring if any document already exists
  * `update` updates existing documents. It errors if any document does not already exist
  * `upsert` updates existing documents or inserts them if they do not exist
  * `replace` replaces existing documents entirely. It errors if any document does not already exist
  * `store` replaces existing documents entirely, or inserts them if they do'nt exist.
  * `remove` removes documents. It will not error if a document does not exist

#### end_subscription
Tells the fusion server to stop sending data for a given subscription.  Data may still be received until the server has processed this and sent a `"state": "complete"` response for the subscription.
```
{
  "request_id": <NUMBER>,
  "type": "end_subscription"
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
`query` and `subscribe` requests will result in a stream of results from the fusion server to the client.  The stream will be an ordered set of messages from the server following the structure below.  If an error occurs, the above Error Response structure will be used, and the stream is considered "complete".  An Error Response may still be sent even after a successful data response, but not after `"state": "complete"`.
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

#### store, remove
`store` and `remove` requests will be given a single response.  This may be an Error Response, or:
```
{
  "request_id": <NUMBER>,
  "data": [<DOCUMENT_ID>, ...],
  "state": "complete"
}
```
* `data` is an array of ids of affected documents (whether or not a change occurred). For inserted documents it will be the id generated by the server
* `state` can only be "complete" for write responses
