# pi-skills

Manage skills from inside the [Pi coding agent](https://pi.dev). Browse skills and their directories in one picker, save your selections with Ctrl+S, and install skills from [skills.sh](https://skills.sh).

## Install the plugin

Use Node.js 22.20 or later and Pi 1.4 or later.

```bash
pi install npm:pi-skills
```

Until the npm package is published, install from a local checkout.

```bash
npm ci --ignore-scripts
pi install .
```

Run `/reload` in an open Pi session after installation.

## Choose which skills Pi loads

Run `/skills` to open the picker. Each skill shows its discovery directory and a checkbox, `[x]` for enabled and `[ ]` for disabled.

Use the arrow keys to move and Enter to toggle a skill. The picker stays open so you can change several selections. Type to search by name, description, or directory. Press Tab to cycle through **All**, **Active**, **Inactive**, and **Changed**.

Press Ctrl+A to enable every skill in the current view, or Ctrl+D to disable them. Press Ctrl+S to save all changes and reload Pi's resources once. Press Esc to close the picker and discard unsaved changes.

To uninstall a downloaded skill, highlight it and press Ctrl+X. Press Ctrl+S to apply the uninstall, or press Ctrl+X again to undo the mark. Only downloads tracked by the skills CLI can be uninstalled this way.

## Find and install a skill

Search the skills.sh catalog.

```text
/skills find react performance
```

Search opens a full-screen picker. Each result shows its repository, installation count, and last update date when available. Move with the arrow keys, or hover over a result, to read its description below the list.

Press **b** to open the highlighted skill in your browser, **p** to install it in the project, or **g** to install it globally. Press **u** to uninstall it from the project, or Shift+U to uninstall it globally. Press Ctrl+F or **/** to enter another search. Install and uninstall actions keep the picker open. Press Esc when finished to close it and reload Pi's resources after these actions.

To install a known skill without the search menu, specify its repository and skill name.

```text
/skills install vercel-labs/agent-skills vercel-react-best-practices
```

Add `--global` to install for your user account. Project installs require project trust in Pi.

## Uninstall a downloaded skill

Use the picker shortcuts above, or run the uninstall command.

```text
/skills uninstall vercel-react-best-practices
/skills uninstall vercel-react-best-practices --global
```

The command defaults to the current project. Uninstall removes the downloaded files, the lock entry, and the skill's links for other agents in that scope. See the [uninstall reference](docs/commands.md#uninstall-scope) for shared skill locations and scope limits.

## Update downloaded skills

Run `/skills update` for skills tracked by the skills CLI in the current project. Use `--global` for your user account.

```text
/skills update
/skills update vercel-react-best-practices --global
```

Commit local skill edits before updating. The skills CLI can replace downloaded files. Pi reloads its resources after the CLI succeeds.

For a skill without a supported upstream update, ask the agent to research it.

```text
/skills update-agent frontend-design
```

Omit the name to include every discovered skill. This command starts an agent request that uses your existing browsing tools. If those tools are unavailable, the agent asks how to continue.

See the [command reference](docs/commands.md) for scope, discovery, and update limits. See [development and publishing](docs/development.md) to test or release the package.
