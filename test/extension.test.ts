import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { DefaultResourceLoader, SettingsManager, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import skillsExtension from "../src/index.ts";

function harness(trusted = true) {
  let handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  const messages: string[] = [];
  const notifications: string[] = [];
  const executions: Array<{ command: string; args: string[] }> = [];
  let reloaded = false;
  skillsExtension({
    registerCommand: (name, options) => {
      assert.equal(name, "skills");
      handler = options.handler;
    },
    sendMessage: (message) => { messages.push(String(message.content)); },
    exec: async (command, args) => {
      executions.push({ command, args });
      return { code: 0, killed: false, stdout: "Done", stderr: "" };
    },
  } as Partial<ExtensionAPI> as ExtensionAPI);
  const ctx = {
    cwd: tmpdir(), hasUI: false,
    isProjectTrusted: () => trusted,
    ui: { notify: (message: string) => { notifications.push(message); } },
    reload: async () => { reloaded = true; },
  } as unknown as ExtensionCommandContext;
  return { messages, notifications, executions, run: (args: string) => handler(args, ctx), reloaded: () => reloaded };
}

test("commands reject invalid install arguments before execution", async () => {
  const h = harness();
  await h.run("install a/b test-skill --global --project");
  await h.run("install a/b test-skill --all");
  await h.run("install a/b");
  await h.run("install a/b --yes");
  assert.equal(h.executions.length, 0);
  assert.equal(h.notifications.length, 4);
});

test("untrusted projects block project mutations but allow global installation", async () => {
  const h = harness(false);
  await h.run("install owner/repo test-skill");
  assert.match(h.notifications.at(-1)!, /Trust this project/);
  assert.equal(h.executions.length, 0);
  await h.run("install owner/repo test-skill --global");
  assert.equal(h.executions[0].command, process.execPath);
  assert.deepEqual(h.executions[0].args.slice(1), ["add", "owner/repo", "--skill", "test-skill", "--agent", "pi", "--yes", "--global"]);
  assert.equal(h.reloaded(), true);
});

test("update routes to the installed CLI with explicit scope", async () => {
  const h = harness();
  await h.run("update test-skill --project");
  assert.deepEqual(h.executions[0].args.slice(1), ["update", "test-skill", "--project", "--yes"]);
  await h.run("help");
  assert.match(h.messages.at(-1)!, /update-agent/);
});

test("Pi loads the published TypeScript entry point and registers the command", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-skills-load-"));
  try {
    const loader = new DefaultResourceLoader({
      cwd: root, agentDir: join(root, "agent"),
      settingsManager: SettingsManager.inMemory(),
      additionalExtensionPaths: [resolve("src/index.ts")],
      noSkills: true, noPromptTemplates: true, noThemes: true,
    });
    await loader.reload();
    const result = loader.getExtensions();
    assert.deepEqual(result.errors, []);
    const extension = result.extensions.find((extension) => extension.path === resolve("src/index.ts"));
    assert.ok(extension);
    assert.ok(extension.commands.has("skills"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
