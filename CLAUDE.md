# pi-plugins

Monorepo for Pi extensions published as npm packages. One directory per package
under `packages/`; each keeps its own npm name and version.

## Release a package

```bash
cd packages/<pkg>
# edit, then run the checks below
cd ../..
script/release-tag.sh <pkg>     # tags <pkg>-v<version>
git push origin <pkg>-v<version>
```

The tag triggers `.github/workflows/publish.yml`, which publishes only that
package to npm through OIDC. No npm token is stored in the repository.

## Checks

```bash
cd packages/<pkg>
npm ci   # or `npm install` when the package has no lockfile
npm run typecheck --if-present
npm run test:ci 2>/dev/null || npm test --if-present
```

CI runs the same commands for the packages a push touched.
