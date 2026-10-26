# pi-skills

Manage skills from inside the [Pi coding agent](https://pi.dev). List enabled skills, see where Pi discovers them, toggle them, and install skills from [skills.sh](https://skills.sh).

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

Run `/skills` to see enabled skills and their directories. Choose **View all skills** to include disabled skills, or run `/skills all`.

Run `/skills toggle` to select a skill. To change a known skill directly, use its name.

```text
/skills disable frontend-design
/skills enable frontend-design
```

If two skills have the same name, use the full path to the skill's `SKILL.md` file. Toggles save in Pi's settings and reload its resources immediately.

## Find and install a skill

Search the skills.sh catalog.

```text
/skills find react performance
```

Each result shows its repository, installation count, description when available, and page URL. Select a result, then choose **View in browser**, **Install in this project**, or **Install globally**.

To install a known skill without the search menu, specify its repository and skill name.

```text
/skills install vercel-labs/agent-skills vercel-react-best-practices
```

Add `--global` to install for your user account. Project installs require project trust in Pi.

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
