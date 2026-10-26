# Develop and publish pi-skills

## Run the checks

Install the locked dependencies with Node.js 22.20 or later.

```bash
npm ci --ignore-scripts
npm run check
npm test
```

The tests use temporary directories to verify settings persistence through Pi's resource loader. Catalog tests use fixture responses and do not contact skills.sh.

To load the working copy in Pi, run the following command from the repository root.

```bash
pi --extension ./src/index.ts
```

Run `/skills help` to verify that Pi loaded the extension. Run `/skills find typescript` to check the live catalog. This search downloads descriptions but does not install skills until you choose an install action.

## Inspect the npm package

```bash
npm pack --dry-run
```

The package includes the TypeScript extension, documentation, and license. Pi loads the TypeScript source directly. No build step is required. The `skills` runtime dependency supplies installation and update support. Pi supplies its own coding-agent package through a peer dependency.

The development dependency on Pi 1.4.0 uses an npm override for a patched `undici`. The override affects this checkout's dependency tree. Published package consumers use their own Pi installation.

## Publish a version

The npm name is `pi-skills`. If that name is unavailable when you publish, change `package.json` and the README installation command to an npm name you control. Keep the `pi-package` keyword and `pi.extensions` manifest so the package remains eligible for the [Pi package gallery](https://pi.dev/packages).

For the first release, keep version `0.1.0`. For a later release, update the version before publishing.

```bash
npm version patch
```

Authenticate with the npm account that owns the package name.

```bash
npm login
```

Run the release checks and inspect the archive contents.

```bash
npm run check
npm test
npm pack --dry-run
```

Publish the package. The `prepublishOnly` script repeats the type check and tests.

```bash
npm publish --access public
```

Tag the first release after npm confirms publication. `npm version` creates a version tag for later releases.

```bash
git tag v0.1.0
git push origin main --tags
```

After npm indexes the package, check its entry in the [Pi package gallery](https://pi.dev/packages). Gallery indexing runs outside this repository and can take time.
