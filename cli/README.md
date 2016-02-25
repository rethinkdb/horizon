# Horizon CLI - `horizon` || `hz`

This directory contains everything corresponding to the Horizon CLI interface usable as `horizon` or `hz`.

## Getting Started

You can install `hz` by using `npm`.

```sh
npm install -g horizon
```

However, if you are actively working on Horizon, you will want your recent changes
to update your command line client `hz` without having to go back into each `/client`,
`/server`, and `/cli` directory to reinstall. So you will want to use `npm link` to
update this on the fly. Following these commands will make this possible:

```bash
# From /server
npm link ../client
# From /cli
npm link ../server
npm install
npm link

# Now test you can init a Horizon app in a new directory
hz init hello-world

# From there you can then serve the `hello-world/dist` directory  
# and start RethinkDB all in one step
hz serve hello-world --start-rethinkdb --dev
```

## CLI Commands

### `hz init`
Create a horizon app directory, automatically creating a `src` and `dist` directory
within the folder.

Positional Args | Description
----------------|------------
projectName |  Name of directory to create. Defaults to current directory

### `hz serve`

This serves the directory and supplies all the tooling needed for serving a
Horizon web application.

##### Available options

Positional Args | Description
----------------|------------
project | Change to this directory before serving

Optional Args| Description
------------|----------------------------------
  --bind HOST         | Local hostname to serve Horizon on (repeatable).
  --port PORT         | Local port to serve horizon on. Defaults to `8181`.
  --connect HOST:PORT | Host and port of the RethinkDB server to connect to. Defaults to localhost:28015
  --key-file PATH     | Path to the key file to use, defaults to `./key.pem`.
  --cert-file PATH    | Path to the cert file to use, defaults to `./cert.pem`.
  --allow-unauthenticated | Whether to allow unauthenticated Horizon connections.
  --debug             | Enable debug logging.
  --insecure          | Serve insecure websockets, ignore `--key-file` and `--cert-file`.
  --start-rethinkdb   | Start up a RethinkDB server in the current directory
  --auto-create-table | Create tables used by requests if they do not exist
  --auto-create-index | Create indexes used by requests if they do not exist
  --serve-static [PATH] | Serve static files from a directory. Defaults to `dist`.
  --dev               | Runs the server in development mode, this sets `--debug`, `--insecure`, `--auto-create-tables`, and `--auto-create-indexes`.

  #### Serving securely, generating certs for SSL
  There are proper ways to get a certificate registered through a Certificate
  Authority, but for the purpose of getting up-and-running as soon as possible,
  generate a self-signed certificate.  This command will generate the certificate
  using the default options from `openssl`, and should not be used for anything
  serious:

  ```sh
  openssl req -x509 -newkey rsa:2048 -keyout horizon-key.pem -out horizon-cert.pem -days 365 -nodes -batch
  ```

  Once a key file and cert file have been obtained, launch the server without the `--insecure`
  flag, and provide the files in the `--key-file` and `--cert-file` options.
