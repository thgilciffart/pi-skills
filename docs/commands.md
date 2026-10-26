# Command reference

The plugin registers one Pi command, `/skills`.

| Command | Result |
| --- | --- |
| `/skills` | Opens the skill picker in Pi's terminal UI. Other modes display all discovered skills. |
| `/skills find [query]` | Opens the full-screen catalog picker. An omitted query focuses its search field. |
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

Search opens a full-screen overlay over the current Pi session. It returns up to ten GitHub skills through the public `/api/search` endpoint used by the skills CLI. Results appear before their detail requests finish.

| Key | Action |
| --- | --- |
| Up and Down | Highlight a result. |
| Mouse hover or click | Highlight a result when terminal mouse events are available. |
| Mouse wheel | Move through the results. |
| Ctrl+F or `/` | Clear and focus the search field for a new query. |
| Enter in the search field | Submit the query. |
| Tab in the search field | Return to the existing results. |
| `b` in the results | Open the highlighted skill on skills.sh in the default browser. |
| `p` in the results | Install the highlighted skill in the current project. |
| `g` in the results | Install the highlighted skill globally. |
| Esc or Ctrl+C | Close the picker. |

The list shows skill names, repositories, installation counts, and update dates. The highlighted skill's description appears in the preview below the list. Narrow terminals show a compact list and retain the metadata in the preview. Descriptions come from the search response when provided, or from the skill page's structured data or description metadata.

Update dates come from skills.sh when its search response provides them. Otherwise, the plugin matches the skill's directory through GitHub's repository tree and reads the latest commit affecting that directory, including supporting files. Dates use UTC. Ambiguous matches, incomplete repository trees, unavailable metadata, and GitHub rate limits produce an unknown date. The plugin does not substitute the repository's overall update date.

Details load in the background for at most three skills at a time. The highlighted result moves to the front of the remaining queue. Search requests time out after 15 seconds. Individual description and GitHub requests time out after 5 seconds. Repository trees are cached for the picker. A failed detail request does not remove a result. A new search cancels old requests, and closing the picker cancels remaining metadata requests.

Installations run immediately and keep the picker open. Repeated install shortcuts do not start parallel operations. A successful installation has an installed marker, and repeating the same scope is skipped during that picker session. Pi reloads its resources once when the picker closes after an installation attempt. Closing is disabled while an installation or browser launch runs.

If browser launch fails, the status line includes the skill's URL.

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
- [GitHub commits API](https://docs.github.com/en/rest/commits/commits#list-commits)
- [GitHub repository trees API](https://docs.github.com/en/rest/git/trees#get-a-tree)
