# Constraints

## Floor (always, no exceptions)

- No new suppression comments: `@ts-ignore`, `@ts-expect-error` without reason, `oxlint-disable`, `eslint-disable`
- No stubs that throw "Not implemented", no empty `catch {}`
- No skipped or deleted tests without a reason in the commit message
- No secrets in source; `.env` is never committed
- This file is not weakened to make a change pass
- Relative imports use explicit `.ts` / `.tsx` extensions (not `.js`); `allowImportingTsExtensions` is on

## Enforced

| Dimension | Rule | Checked by |
| --- | --- | --- |
| Types | zero errors, `strict` + `noUncheckedIndexedAccess` | `pnpm typecheck` |
| Lint | zero warnings | `pnpm lint` |
| Format | Prettier clean | `pnpm format:check` |
| Unit/integration | all green, real fs/Git/SQLite, no DB mocks | `pnpm test` |
| User journey | first-post journey passes in real Chromium | `pnpm test:e2e` (`pnpm test:e2e` builds admin + starter first) |
| Dev server | `astro dev` serves API, admin, sitemap, robots | `pnpm test:e2e` (project `dev`) |
| Build | every package builds; core's published layout has all 6 Astro entrypoints | `pnpm build` (runs `smoke:dist`) |
| Supply chain | 24 h release age, trust-downgrade block, install scripts denied | `pnpm-workspace.yaml` |
| Architecture | `packages/core/src` imports no `cloudflare:*`, `@cloudflare/*`, `wrangler`, `kysely-d1` | `packages/core/tests/unit/architecture.test.ts` |

`pnpm check` runs lint, typecheck and tests.

## Measured, not yet enforced

| Metric | Today | Direction |
| --- | --- | --- |
| Test count (unit+integration) | see `pnpm -r test` | must not fall |
| Coverage of changed lines | not measured | add `vitest --coverage` |
| Dependency audit | not run in CI | add `pnpm audit` to CI |

## Exceptions

None.
