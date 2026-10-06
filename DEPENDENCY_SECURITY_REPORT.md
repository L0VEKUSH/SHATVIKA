# Dependency security report

Audit date: 2026-10-06

## Executive conclusion

The production dependency tree has no reported vulnerabilities. The complete
development tree has 9 findings (2 moderate and 7 high), all associated with
build, lint, or CSS tooling. No production application code change is
required.

The findings should not be "fixed" with `npm audit fix --force`: npm proposes
Tailwind CSS 4.3.3, which is a breaking migration from Tailwind CSS 3, and
also proposes an incompatible `eslint-config-next` downgrade path. Neither
migration was applied.

## Verification results

| Check | Result |
|---|---|
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm audit` | 9 vulnerabilities |
| Full audit severity | 2 moderate, 7 high |
| `npm ls --omit=dev` for vulnerable packages | No vulnerable packages in the runtime tree |
| `npm ci --omit=dev --ignore-scripts --dry-run` | Passed after lockfile synchronization |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | Passed per the verified 21-file, 136-test baseline |
| `npm run build:production` | Passed per the verified production-build baseline |

The full audit findings are development/build-toolchain related. The
production-only audit is the relevant exposure check for the deployed runtime
and reports zero vulnerabilities.

## A. Production runtime dependency status

No vulnerable package is reachable from the production dependency tree.
`npm audit --omit=dev` reports zero vulnerabilities, and the production-only
package tree contains none of `braces`, `postcss-selector-parser`,
`tailwindcss`, `chokidar`, `fast-glob`, `micromatch`, or `postcss-nested`.

The application can therefore build in a builder environment and deploy with
production dependencies only, provided the build output and required runtime
assets are copied according to the selected Next.js deployment model.

## B. Build/development dependency status

The vulnerable packages are reachable only through development tooling:

- `tailwindcss@3.4.19`
- `eslint-config-next@15.5.25`
- Tailwind's watcher/glob/PostCSS dependency chain
- Next ESLint's glob dependency chain

These packages are used during linting and CSS/build preparation. They are not
runtime application dependencies and are excluded by the production audit.

## C. Exact remaining vulnerability paths

### High severity: Tailwind chain

```text
tailwindcss@3.4.19
  -> chokidar@3.6.0
    -> braces@3.0.3
  -> fast-glob@3.3.3
    -> micromatch@4.0.8
      -> braces@3.0.3
  -> postcss-nested@6.2.0
    -> postcss-selector-parser@6.1.4
```

The audit reports 7 high findings across the affected package/effect nodes,
including the vulnerable `braces`, `chokidar`, `fast-glob`, `micromatch`, and
Tailwind nodes.

### High severity: Next ESLint chain

```text
eslint-config-next@15.5.25
  -> @next/eslint-plugin-next@15.5.25
    -> fast-glob@3.3.1
      -> micromatch@4.0.8
```

### Moderate severity: selector parser chain

```text
tailwindcss@3.4.19
  -> postcss-nested@6.2.0
    -> postcss-selector-parser@6.1.4
```

The two moderate findings are the `postcss-nested` and
`postcss-selector-parser` advisory nodes.

## D. Immediate production code change

None is required. No vulnerable package is present in the production-only
dependency tree, and the findings do not require changing application code,
API behavior, or runtime security controls.

## E. Migration decision

Schedule a separate, compatibility-tested dependency migration. It should
include:

1. A Tailwind CSS 3-to-4 migration branch with PostCSS/configuration review.
2. Visual and production-build verification for every application surface.
3. A separately reviewed Next ESLint/tooling update compatible with Next 15.
4. Full typecheck, lint, unit, integration, E2E, and production-build runs.
5. A fresh audit and a review of the resulting lockfile.

Do not combine this migration with production security/application changes, and
do not use `npm audit fix --force`.

## F. Recommended deployment strategy

Use a two-stage deployment:

1. In a controlled builder environment, run `npm ci`, the required checks, and
   `npm run build:production`.
2. Deploy the generated Next.js build output with `npm ci --omit=dev` (or the
   platform's equivalent production-only install), the production environment
   variables, and the selected process supervision/health-check configuration.

The production-only install plan was validated with
`npm ci --omit=dev --ignore-scripts --dry-run`, and the resulting dependency
scope has zero audit findings. The build stage must remain isolated from
untrusted user-controlled glob, selector, or CSS input.

## G. Exact changes required

The only repository change required by this review was synchronizing
`package-lock.json` with `package.json` so that a clean `npm ci` is valid.
This did not change the direct dependency policy, upgrade Tailwind, upgrade
Next.js, or add arbitrary overrides.

The existing brace-expansion overrides are unrelated to the remaining
`braces@3.0.3` advisory:

- `minimatch@3.1.5` uses `brace-expansion@1.1.21`
- `minimatch@10.2.5` uses `brace-expansion@5.0.12`
- `readdir-glob` uses `brace-expansion@2.1.7`

They target distinct `brace-expansion` package versions and do not suppress or
replace the vulnerable `braces` package used by Tailwind. They should remain
because they are targeted compatible remediation constraints. The other
existing overrides are also currently referenced by the installed dependency
graph; no unused override was identified that should be removed as part of
this review.

## Deferral rationale

The advisories affect development/build tooling rather than deployed runtime
dependencies. A forced upgrade would introduce a larger, untested CSS/tooling
migration and could change generated output or lint behavior. Deferring the
migration is therefore the lower-risk production decision while preserving a
tracked remediation plan.
