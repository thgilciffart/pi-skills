# Command reference

The plugin registers one Pi command, `/skills`.

| Command | Result |
| --- | --- |
| `/skills` | Lists enabled skills and opens a menu in interactive sessions. |
| `/skills enabled` | Same as `/skills`. |
| `/skills all` | Lists enabled, disabled, and inactive skills. |
| `/skills toggle [name or path]` | Toggles the specified skill, or opens a selector when the argument is absent. |
| `/skills enable <name or path>` | Enables a discovered skill. |
| `/skills disable <name or path>` | Disables a discovered skill. |
| `/skills find <query>` | Searches skills.sh and opens the results menu. An omitted query opens an input dialog. |
| `/skills install <owner/repo> <skill> [--global]` | Downloads one GitHub skill through the skills CLI. |
| `/skills update [name] [--global \| --project]` | Updates skills tracked by the skills CLI in the selected scope. |
| `/skills update-agent [name]` | Sends an agent request to research and update the specified skill, or all discovered skills. |
| `/skills help` | Displays command help. |

## Discovery and status

Each listed skill includes its name, description, and directory. Discovery uses Pi's package resolver and skill loader. It includes trusted project skills, user skills, configured paths, and installed package skills. Missing packages are skipped during discovery.

The enabled list comes from the current session's loaded skills. It also includes skills supplied through the CLI or another extension. A skill with `disable-model-invocation: true` remains enabled if Pi loads it, even though Pi omits it from the system prompt.

| Status | Meaning |
| --- | --- |
| `enabled` | Pi loaded this skill in the current session. |
| `disabled` | The resource configuration excludes this skill. |
| `inactive` | The resource configuration enables this skill, but Pi did not load it. Duplicate names and startup options can cause this state. |

Names must match exactly. A full skill directory or `SKILL.md` path also identifies a skill. Toggle paths may contain spaces and do not need quotation marks.

## Toggle persistence

Toggles write to the skill's existing user or project scope through Pi's `SettingsManager`. Package skills use the package's `skills` filter. Other skills use exact path overrides in the settings `skills` array. Other resource filters remain intact.

Successful toggles reload Pi's extensions, skills, prompts, themes, and context files. CLI skills and skills supplied only by another extension have no persistent source entry to change. Their source configuration controls whether they load.

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
