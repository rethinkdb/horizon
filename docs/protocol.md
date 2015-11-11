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
    "field_name": <STRING>,
    "selection": {
      "type": <STRING>,
      "args": <ARRAY>
    },
    "limit": <NUMBER>,
    "order": "ascending" | "descending"
  }
}
```
* `collection` describes which table to operate on in the fusion database
* `field_name` is the index to use for selection and ordering. It must be specified. A reasonable default value is `id`
* `selection` provides an operation to select some subset of the table - optional
  * `selection.type` may be `find_one`, `find`, or `between`
  * `selection.args` is an array of arguments for the selection
    * `find_one` - the array has a single value in it, being the ID of the object to find
    * `find` - the array has any number of values in it, each matching row will be found
    * `between` - the array has two values in it, the lower and upper bound for the selection
* `limit` limits the number of results to be selected - optional
* `order` orders the results according to `field_name` - optional

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
  * `store` replaces existing documents entirely, or inserts them if they doesn't exist.
  * `remove` removes documents

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
