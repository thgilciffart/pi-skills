# Command reference

## Commands

| Command | Result |
| --- | --- |
| `/skills` | Opens the skill picker. Other modes list discovered skills. |
| `/skills find [query]` | Opens catalog search. An omitted query focuses the search field. |
| `/skills install <owner/repo> <skill> [--global]` | Downloads a GitHub skill through the skills CLI. |
| `/skills uninstall <skill> [--global \| --project]` | Removes a tracked download in the selected scope. |
| `/skills update [name] [--global \| --project]` | Updates tracked downloads in the selected scope. |
| `/skills update-agent [name]` | Asks the agent to research and update a skill, or all discovered skills. |
| `/skills help` | Displays command help. |

## Skill picker

Rows show a checkbox, name, scope, and discovery directory. The highlighted skill's description appears below the list.

| Key | Action |
| --- | --- |
| Up, Down | Move the selection. |
| Enter | Toggle the selected skill. On a marked uninstall, undo the mark. |
| Tab, Shift+Tab | Cycle forward or backward through All, Active, Inactive, and Changed. |
| Text | Search names, descriptions, and directories within the current filter. |
| Ctrl+A, Ctrl+D | Enable or disable all editable skills in the current view. |
| Ctrl+X | Mark a tracked download for uninstall or undo the mark. |
| Ctrl+S | Save pending changes and close. |
| Esc | Discard pending changes and close. |
| Ctrl+C | Clear the search, or cancel when it is empty. |

`[x]` means enabled in the draft, and `[ ]` means disabled. Changed shows unsaved changes. Bulk toggles leave uninstall marks intact.

Ctrl+S writes changes to each skill's existing scope through Pi's settings manager. Package skills use the package's `skills` filter; other skills use exact path overrides. A successful save with changes reloads Pi's resources once. Saving without changes or cancelling does not write settings or reload resources.

## Discovery

Pi's package resolver and skill loader discover trusted project skills, user skills, configured paths, and installed package skills. Missing packages are skipped.

Skills from CLI arguments or other extensions also appear. A `read-only` skill has no persistent source entry and cannot be toggled. Bulk actions skip it.

Checkboxes represent configuration, not current loading. An enabled skill may show `not loaded` because of duplicate names or startup options. `disable-model-invocation: true` does not change the enabled state.

## Catalog picker

Search returns up to ten GitHub skills from the skills.sh search API. Descriptions and update dates load in the background.

| Key | Action |
| --- | --- |
| Up, Down | Highlight a result. |
| Mouse hover, click, wheel | Select or scroll when the terminal forwards mouse events. |
| Ctrl+F, `/` | Focus and clear the search field. |
| Enter in search | Submit the query. |
| Tab in search | Return to the results. |
| `b` | Open the highlighted skill in a browser. |
| `p`, `g` | Install in project or global scope. |
| `u`, Shift+U | Uninstall from project or global scope. |
| Esc, Ctrl+C | Close. |

Install and uninstall run immediately and keep the picker open. Closing is disabled during an operation. Pi reloads resources once on close after an install or uninstall attempt.

Dates come from skills.sh or the latest GitHub commit affecting the matched skill directory. They use UTC. Missing or ambiguous metadata produces an unknown date. The repository's overall update date is not used.

Search times out after 15 seconds; individual metadata requests time out after 5 seconds. Failed metadata requests leave results available. A new search or closing the picker cancels outstanding metadata requests.

Without dialog support, search displays results and URLs. `/skills install` remains available.

## Install and update scope

Project scope is the default. `--project` selects it explicitly; `--global` selects user scope. The flags cannot be combined. Project installs and uninstalls require Pi project trust.

The plugin runs its installed `skills` dependency through Node.js, with `--agent pi --yes` for installs. Node.js must be on `PATH`, including when Pi runs as a compiled Bun executable.

Downloads live in `.agents/skills` for projects or `~/.agents/skills` globally. Updates use the CLI's lock files and may include downloads for other agents in that scope. Manually copied skills and skills inside Pi packages do not receive these updates.

CLI operations time out after three minutes. Failed or interrupted operations may leave partial changes; `/reload` refreshes Pi afterward. The CLI honors `DISABLE_TELEMETRY` and `DO_NOT_TRACK`.

## Uninstall scope

Uninstall accepts one tracked skill name and rejects wildcard removal. Catalog shortcuts verify that the installed source matches the selected repository.

Tracking uses project `skills-lock.json` and the CLI's global `.skill-lock.json`. The global lock is under `~/.agents` unless `XDG_STATE_HOME` selects another state directory. Manually copied skills, Pi package skills, and skills inherited from another project cannot be uninstalled here.

Removal deletes the canonical download, its lock entry, and agent links in that scope. Other agents sharing that download lose it too. Disabling a skill changes only Pi's loading settings.

The plugin verifies that both the directory and lock entry are gone. Existing Pi path overrides remain in settings.

## Agent-assisted updates

`update-agent` sends a user message containing skill names and paths. The request asks the current agent to find upstream sources, check instructions, preserve local edits, and report changes. Results depend on the agent's available tools; this plugin supplies no browsing tool.

A name, full skill directory, or `SKILL.md` path selects a discovered skill. Omitting the argument, or using `all`, includes disabled skills too.
