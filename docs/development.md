# Develop and publish pi-skills

## Run the checks

Install the locked dependencies with Node.js 22.20 or later.

```bash
npm ci --ignore-scripts
npm run check
npm test
```

The tests use temporary directories to verify settings persistence through Pi's resource loader. Picker tests cover draft changes, filtering, bulk actions, Ctrl+S, and cancellation. Catalog picker tests cover search, previews, mouse selection, shortcuts, installation scopes, request cancellation, and terminal sizing. Catalog API tests use fixture responses and do not contact skills.sh or GitHub.

Uninstall tests check scope and repository matching, staged removal, and cancellation. A test invokes the installed skills CLI in a temporary project to verify that uninstall removes the selected skill and lock entry while preserving another skill's files.

To load the working copy in Pi, run the following command from the repository root.

```bash
pi --extension ./src/index.ts
```

Run `/skills` to open the picker. Toggle several skills with Enter, change filters with Tab, and press Esc to verify that the draft is discarded. Reopen the picker and press Ctrl+S after changes to save them and reload Pi's resources. Run `/skills find typescript` to check the live catalog.

In the catalog picker, use Ctrl+F to search again. Move between results to check their descriptions and update dates. Press **b** to check browser launch. The **p** and **g** keys install immediately in project and global scope. The **u** and Shift+U keys uninstall from those scopes.

## Inspect the npm package

```bash
npm pack --dry-run
```

The package includes the TypeScript extension, documentation, and license. Pi loads the TypeScript source directly. No build step is required. The `skills` runtime dependency supplies installation and update support. Pi supplies its coding-agent and terminal UI packages through peer dependencies.

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
