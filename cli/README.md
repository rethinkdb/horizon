# Horizon CLI - `hz`

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
```
