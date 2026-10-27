# Develop and publish pi-skills

## Check a local checkout

Use Node.js 22.20 or later.

```sh
npm ci --ignore-scripts
npm run check
npm test
pi -e ./src/index.ts
```

In Pi, run `/skills` to check toggles, filters, saving, and cancellation. Run `/skills find typescript` to check catalog search. Catalog install and uninstall shortcuts change files immediately.

Pi loads the TypeScript source directly. The `skills` runtime dependency supplies installation, removal, and updates.

## Publish a release

1. Update the version with `npm version patch` or the required release type.
2. Run `npm run check` and `npm test`.
3. Inspect the file list with `npm pack --dry-run`.
4. Sign in with `npm login` and publish with `npm publish --access public`.
5. Push the release commit and version tag.

The package name is `@thgilciffart/pi-skills`. The `prepublishOnly` hook repeats the checks. Keep `pi.extensions` and the `pi-package` keyword in the manifest.
