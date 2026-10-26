# Command reference

The plugin registers one Pi command, `/skills`.

| Command | Result |
| --- | --- |
| `/skills` | Opens the skill picker in Pi's terminal UI. Other modes display all discovered skills. |
| `/skills find <query>` | Searches skills.sh and opens the results menu. An omitted query opens an input dialog. |
| `/skills install <owner/repo> <skill> [--global]` | Downloads one GitHub skill through the skills CLI. |
| `/skills update [name] [--global \| --project]` | Updates skills tracked by the skills CLI in the selected scope. |
| `/skills update-agent [name]` | Sends an agent request to research and update the specified skill, or all discovered skills. |
| `/skills help` | Displays command help. |

## Skill picker

The picker starts with every discovered skill. Each row shows a checkbox, name, scope, and discovery directory. The selected skill's description appears below the list.

| Key | Action |
| --- | --- |
| Up and Down | Move the selection. |
| Enter | Toggle the selected skill and keep the picker open. |
| Tab | Cycle through All, Active, Inactive, and Changed. |
| Shift+Tab | Cycle through filters in reverse. |
| Text input | Search names, descriptions, and directories. |
| Ctrl+A | Enable every editable skill in the filtered view. |
| Ctrl+D | Disable every editable skill in the filtered view. |
| Ctrl+S | Save all pending changes and close the picker. |
| Esc | Close the picker and discard pending changes. |
| Ctrl+C | Clear the search, or cancel if the search is empty. |

`[x]` means enabled in the pending configuration. `[ ]` means disabled. Active filters checked skills, Inactive filters unchecked skills, and Changed filters skills with unsaved changes. Search narrows the current filter. Changes remain pending across filters and searches. Toggling a skill back to its original state removes its pending change.

## Discovery and loaded skills

Discovery uses Pi's package resolver and skill loader. It includes trusted project skills, user skills, configured paths, and installed package skills. Missing packages are skipped during discovery.

Skills supplied through the CLI or another extension also appear. Skills with no persistent source entry have a `read-only` label and cannot be toggled. Bulk actions skip these skills.

The checkboxes represent configuration. A checked skill with a `not loaded` label is enabled in settings but absent from the current session's loaded skills. Duplicate names and startup options can cause this state. A skill with `disable-model-invocation: true` remains checked when enabled, even though Pi omits it from the system prompt.

The directory distinguishes skills that share a name. The `update-agent` command also accepts an exact name, a full skill directory, or a `SKILL.md` path.

## Toggle persistence

Toggles change an in-memory draft. Ctrl+S writes all changes to each skill's existing user or project scope through Pi's `SettingsManager`. Package skills use the package's `skills` filter. Other skills use exact path overrides in the settings `skills` array. Other resource filters remain intact.

A successful save with changes reloads Pi's extensions, skills, prompts, themes, and context files once. Closing with Esc or Ctrl+C does not write settings or reload resources. Ctrl+S with no changes closes the picker without writing settings or reloading resources.

## Catalog search

Search returns up to ten GitHub skills. It uses the public `/api/search` endpoint used by the skills CLI. Descriptions come from the search response when provided, or from the skill page's structured data or description metadata. A failed description request does not remove the result.

Search requests time out after 15 seconds. Description requests time out after 5 seconds, with at most three in flight. The browser action opens the selected skills.sh page through the operating system's default browser. If browser launch fails, the plugin displays the URL.

In sessions without dialog support, search displays results and URLs. Installation remains available through `/skills install`.

## Install and update scope

Install and update default to project scope. `--project` explicitly selects project scope. `--global` selects user scope. The two flags cannot be combined.

The plugin invokes the installed `skills` CLI dependency through Node.js. It does not fetch a CLI through `npx` at command time. Installation passes `--agent pi --yes`. The CLI uses `.agents/skills` in the project for project installs and `~/.agents/skills` for global installs. Pi discovers both locations.

Node.js must be available on `PATH` when Pi runs as a compiled Bun executable.

Automatic updates use the skills CLI's lock files. They can include skills installed by that CLI for other agents in the selected scope. The plugin does not update arbitrary manually copied skills or skills inside Pi packages. Pi package skills follow their package's update process.

CLI operations time out after three minutes. A failed or interrupted operation may have changed some files. The plugin displays the CLI output, and `/reload` refreshes Pi after partial changes.

The skills CLI has its own network requests and installation telemetry. It honors the `DISABLE_TELEMETRY` and `DO_NOT_TRACK` environment variables.

## Agent-assisted updates

`/skills update-agent` sends a user message to the current agent with the selected skills' names and file paths. The request asks the agent to find upstream sources, verify current instructions, preserve local edits, and report changes. Its result depends on the agent and tools available in that session. The plugin registers no model tools and bundles no web search tool.

The agent request includes disabled skills when no name is specified. A named skill must exist in the discovered inventory. `all` also selects the full inventory.

## Upstream references

- [Pi package format and gallery discovery](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)
- [Pi skill discovery](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)
- [skills.sh search client](https://github.com/vercel-labs/skills/blob/main/src/find.ts)
- [skills CLI](https://github.com/vercel-labs/skills)
