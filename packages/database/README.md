# @atmp/database

The single import boundary for the generated Prisma client.

This package intentionally has no source of its own: its `build` step is
`prisma generate`, and `main`/`types` point straight at the generated client. A
hand-written TypeScript re-export would either duplicate types or have to reach
outside its own `rootDir`, and it would add nothing.

## Rules

- Only infrastructure adapters import this package (repositories, Prisma
  service, migrations tooling).
- `domain/**` must never import it. ESLint enforces that.
- Nothing else in the workspace may import `@prisma/client` directly, so the
  client version and its lifecycle stay in one place.

The generated output is not committed. Run `pnpm prisma:generate` (or any
`pnpm build`) after cloning or after changing `prisma/schema.prisma`.
