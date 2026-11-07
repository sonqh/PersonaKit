# ADR-003 TypeScript on Node 22 with no runtime dependencies

- Status: Accepted by the owner on 2026-11-06

## Decision

- Language: TypeScript. Runtime: Node.js 22.18 or newer.
- Node runs the TypeScript sources directly (type stripping). A fresh clone runs `bin/personakit.mjs` without a build step. The code uses only syntax that type stripping supports. `erasableSyntaxOnly` in `tsconfig.json` enforces this.
- The core in `src/core/` has no framework and no dependency on a model provider.
- Runtime dependencies: none. ULIDs, validation, canonical JSON, atomic writes, and locks use Node built-ins.
- Development dependencies: `typescript` for the type check and `@types/node` for Node types. Tests use the built-in `node:test` runner.
- `mammoth` is a development dependency only (owner decision, 2026-11-07). Tests compare the DOCX reader with its raw text output. No runtime code imports it.
- Every new runtime dependency needs a line in this record and the owner's approval.

## Alternatives considered

- A schema library such as Zod or Ajv. Rejected for M1: the schema is small, and hand-written checks give clear messages without a dependency.
- A compiled `dist/` build. Rejected for M1: agents run the CLI from a clone, and a build step adds a way for it to fail. A published package will need a build later.

## Consequences

- `npm install` is needed only for the type check.
- Node refuses type stripping for files inside `node_modules`. A published npm package must ship compiled JavaScript. That is not an M1 goal.
