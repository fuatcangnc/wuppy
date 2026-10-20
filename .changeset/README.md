# Changesets

Describe every user-visible change with `pnpm changeset` (pick the packages and the bump). Maintainers run
`pnpm changeset version` to write the changelogs and bump versions, then `pnpm changeset publish`.
All Wuppy packages share one version (`fixed`), so a plugin author only has to track one number.
