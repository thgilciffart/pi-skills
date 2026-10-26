import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { DefaultResourceLoader, loadSkills, SettingsManager, type ExtensionAPI, type ExtensionCommandContext, type Theme } from "@earendil-works/pi-coding-agent";
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

test("the command writes only on Ctrl+S and reloads once for several changes", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-skills-picker-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const agentDir = join(root, "agent");
  const cwd = join(root, "project");
  process.env.PI_CODING_AGENT_DIR = agentDir;
  try {
    const paths = [join(cwd, ".pi/skills/alpha/SKILL.md"), join(cwd, ".pi/skills/beta/SKILL.md")];
    for (let i = 0; i < paths.length; i++) {
      await mkdir(dirname(paths[i]), { recursive: true });
      await writeFile(paths[i], `---\nname: picker-fixture-${i}\ndescription: A fixture.\n---\nInstructions.\n`);
    }
    await mkdir(join(cwd, ".git"));
    const settingsPath = join(cwd, ".pi/settings.json");
    await writeFile(settingsPath, JSON.stringify({ skills: [], unrelated: true }));
    const original = await readFile(settingsPath, "utf8");
    const active = loadSkills({ cwd, agentDir, includeDefaults: false, skillPaths: paths }).skills;
    let keys: string[] = [];
    let reloads = 0;
    let handler!: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
    const notifications: string[] = [];
    skillsExtension({
      registerCommand: (_name, options) => { handler = options.handler; },
      sendMessage: () => {},
    } as Partial<ExtensionAPI> as ExtensionAPI);
    const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as Theme;
    const ctx = {
      cwd, mode: "tui", hasUI: true,
      isProjectTrusted: () => true,
      getSystemPromptOptions: () => ({ skills: active }),
      reload: async () => { reloads++; },
      ui: {
        notify: (message: string) => { notifications.push(message); },
        custom: async (factory: Parameters<ExtensionCommandContext["ui"]["custom"]>[0]) => {
          let result: unknown;
          const picker = await factory({ requestRender: () => {}, terminal: { rows: 24 } } as never, theme, {} as never, (value) => { result = value; });
          // Search isolates the fixtures from any user-level Agent Skills defaults.
          for (const key of "picker-fixture") picker.handleInput!(key);
          for (const key of keys) {
            assert.equal(await readFile(settingsPath, "utf8"), original);
            picker.handleInput!(key);
          }
          return result;
        },
      },
    } as unknown as ExtensionCommandContext;
    keys = ["\r", "\x1b[B", "\r", "\x1b"];
    await handler("", ctx);
    assert.equal(await readFile(settingsPath, "utf8"), original);
    assert.equal(reloads, 0);
    keys = ["\x13"];
    await handler("", ctx);
    assert.equal(await readFile(settingsPath, "utf8"), original);
    assert.equal(reloads, 0);
    keys = ["\r", "\x1b[B", "\r", "\x13"];
    await handler("", ctx);
    assert.deepEqual(notifications, []);
    assert.equal(reloads, 1);
    const saved = JSON.parse(await readFile(settingsPath, "utf8"));
    assert.equal(saved.unrelated, true);
    assert.equal(saved.skills.length, 2);
    assert.ok(paths.every((path) => saved.skills.includes(`-${path}`)));
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    await rm(root, { recursive: true, force: true });
  }
});

test("the full-screen catalog routes shortcuts to browser and both install scopes, then reloads once", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ skills: [{ source: "owner/repo", skillId: "test-skill", name: "Test skill", installs: 12, description: "A test skill.", updatedAt: "2026-10-20T00:00:00Z" }] }));
  for (const trusted of [true, false]) {
    let handler!: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
    const executions: Array<{ command: string; args: string[] }> = [];
    const reports: string[] = [];
    const errors: string[] = [];
    let reloads = 0;
    skillsExtension({
      registerCommand: (_name, options) => { handler = options.handler; },
      sendMessage: (message) => { reports.push(String(message.content)); },
      exec: async (command, args) => { executions.push({ command, args }); return { code: 0, killed: false, stdout: "Done", stderr: "" }; },
    } as Partial<ExtensionAPI> as ExtensionAPI);
    const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as Theme;
    const ctx = {
      cwd: tmpdir(), mode: "tui", hasUI: true,
      isProjectTrusted: () => trusted,
      reload: async () => { reloads++; },
      ui: {
        notify: (message: string) => { errors.push(message); },
        custom: async (factory: Parameters<ExtensionCommandContext["ui"]["custom"]>[0], options: { overlay: boolean; overlayOptions: { width: string; maxHeight: string } }) => {
          assert.equal(options.overlay, true);
          assert.equal(options.overlayOptions.width, "100%");
          assert.equal(options.overlayOptions.maxHeight, "100%");
          let closed = false;
          const picker = await factory({ requestRender: () => {}, terminal: { rows: 30 } } as never, theme, {} as never, () => { closed = true; });
          await setImmediate();
          assert.equal(picker.render(120).length, 30);
          for (const key of ["b", "p", "g", "g"]) { picker.handleInput!(key); await setImmediate(); }
          assert.equal(closed, false);
          assert.equal(reloads, 0);
          assert.deepEqual(reports, []);
          picker.handleInput!("\x1b");
          assert.equal(closed, true);
        },
      },
    } as unknown as ExtensionCommandContext;
    await handler("find testing", ctx);
    assert.deepEqual(errors, []);
    assert.equal(reloads, 1);
    assert.ok(executions[0].args.includes("https://skills.sh/owner/repo/test-skill"));
    const installs = executions.filter(({ command }) => command === process.execPath);
    assert.equal(installs.length, trusted ? 2 : 1);
    assert.ok(installs.at(-1)!.args.includes("--global"));
    if (trusted) assert.equal(installs[0].args.includes("--global"), false);
    assert.match(reports[0], trusted ? /Installed 2 skills/ : /Installed 1 skill/);
  }
});
