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

### Client to Server Messages

#### Requests
All requests match the following pattern:
```
{
  "request_id": <NUMBER>,
  "options": {
    <METHOD>: [ <ARGUMENT>, ... ],
  }
}
```
* `request_id` is a number uniquely identifying this request, it will be returned in any responses
* `options` is an object containing arguments to be passed to various handlers.  Each key is the name of the method, and the value is an array of arguments specified.


#### Stop Request
Tells the horizon server to close a request early and to stop sending
any more changes for the given `request_id`.  Data may still be
received until the server has processed this and sent a 
`"state": "complete"` response for the subscription.
```
{
  "request_id": <NUMBER>,
  "type": "stop"
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

### Server to Client Messages

#### Request Responses

##### Success
The client maintains an object for each request, which can be modified
by JSON patches sent from the server.  Each message may contain a set
of patches until `"state": "complete"` is specified, at which point no
further messages should be sent.
```
{
  "request_id": <NUMBER>,
  "patches": [ <PATCH>, ... ],
  "state": "complete"
}
```

The object maintained in the client contains a few fields to influence
how it is presented to the user in its observable.  Its format is:
```
{
  "type": "value" | "set",
  "val": <ANY>,
  "synced": true | false
}
```

The value will not be published to the observable unless `synced` is
true.  This allows the multiple (non-atomic) patches to be applied 
without the user being shown inconsistent data.  The `type` field
indicates what should be passed as the value of the observable:
 * "value": the `val` field is the literal value to pass on to the
     observable
 * "set" : the `val` field is an object whose keys are used internally
     for patching, but should be presented to the observable as an
     array (deterministically ordered?).

##### Error
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

#### Keepalive Response
`keepalive` requests will be given a single response.  This will never be an error response unless there is a protocol error.
```
{
  "request_id": <NUMBER>,
  "state": "complete"
}
```
