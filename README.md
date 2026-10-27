# pi-skills

Choose which skills [Pi](https://pi.dev) loads, and find, install, or update skills from [skills.sh](https://skills.sh).

## Install

Requires Node.js 22.20 or later and Pi 1.4 or later.

```sh
pi install npm:@thgilciffart/pi-skills
```

Run `/reload` in an open Pi session.

## Choose skills

Run `/skills` to open the picker. Type to search by name, description, or directory. Use Up and Down to move, Enter to toggle a skill, and Tab to cycle through All, Active, Inactive, and Changed.

Ctrl+A enables every editable skill in the current view. Ctrl+D disables them. Ctrl+X marks a tracked download for uninstall; press it again to undo the mark.

Press Ctrl+S to apply changes and reload Pi's resources. Esc discards the draft. Uninstalling a shared download also removes it for other agents in that scope.

## Find and manage downloads

```text
/skills find react performance
/skills install vercel-labs/agent-skills vercel-react-best-practices
/skills uninstall vercel-react-best-practices
/skills update
```

Commands default to project scope. Add `--global` to install, uninstall, or update for your user account. Project installs and uninstalls require Pi project trust.

Catalog search opens a picker. Press **b** to open a result in your browser, **p** to install it in the project, or **g** to install globally. Press **u** to uninstall from the project or Shift+U to uninstall globally. Ctrl+F starts another search. These actions run immediately; Esc closes the picker and reloads resources after changes.

Updates apply to skills tracked by the skills CLI. Commit local edits first because updates can replace downloaded files.

For manually installed skills, `/skills update-agent <name>` asks the current agent to research an update using its available tools. Omit the name to include all discovered skills.

See the [command reference](docs/commands.md) for controls, discovery, and scope limits, or [development guide](docs/development.md) for checks and releases.

[MIT license](LICENSE).
