# ts-morph

[![CI](https://github.com/dsherret/ts-morph/workflows/CI/badge.svg)](https://github.com/dsherret/ts-morph/actions?query=workflow%3ACI)

Monorepo for [ts-morph](packages/ts-morph) and related projects.

## Packages

- [ts-morph](packages/ts-morph) - TypeScript Compiler API wrapper. Provides an easier way to programmatically navigate and manipulate TypeScript and JavaScript code.
- [@ts-morph/bootstrap](packages/bootstrap) - Separate library for getting quickly setup with the Compiler API.

## Resources

- [TypeScript AST Viewer](https://ts-ast-viewer.com)

## Quick Install & Run (Windows / Linux / macOS)

```sh
# Install / hydrate from v11 CAS via holo-pm
holo-pm install repository://github.com/awesome-os/ts-morph@main

# Or project & run directly via holo-project (0-byte hardlink)
holo-project "project://node/ts-morph?from=repository://github.com/awesome-os/ts-morph@main"
```
