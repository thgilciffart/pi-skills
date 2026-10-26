import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { DefaultResourceLoader, SettingsManager } from "@earendil-works/pi-coding-agent";
import { discoverSkills, entryStatus, replaceOverride, setEnabled } from "../src/discovery.ts";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pi-skills-test-"));
  const cwd = join(root, "project");
  const agentDir = join(root, "agent");
  await mkdir(cwd);
  await mkdir(agentDir);
  await mkdir(join(cwd, ".git"));
  const skill = async (path: string, name: string) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `---\nname: ${name}\ndescription: Test skill ${name}.\n---\nInstructions.\n`);
  };
  const load = async (trusted = true) => {
    const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: trusted });
    const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager: settings, noExtensions: true, noPromptTemplates: true, noThemes: true });
    await loader.reload();
    return loader.getSkills().skills;
  };
  return { root, cwd, agentDir, skill, load, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test("toggles persist through Pi's real resource loader without crossing discovery roots", async () => {
  const f = await fixture();
  try {
    const piPath = join(f.cwd, ".pi/skills/shared/SKILL.md");
    const agentsPath = join(f.cwd, ".agents/skills/shared/SKILL.md");
    await f.skill(piPath, "fixture-pi");
    await f.skill(agentsPath, "fixture-agents");
    let active = await f.load();
    let snapshot = await discoverSkills(f.cwd, true, active, f.agentDir);
    const entry = snapshot.entries.find((entry) => entry.skill.filePath === piPath)!;
    assert.equal(entryStatus(entry), "enabled");
    await setEnabled(snapshot.settings, entry, false);
    active = await f.load();
    assert.equal(active.some((skill) => skill.filePath === piPath), false);
    assert.equal(active.some((skill) => skill.filePath === agentsPath), true);
    snapshot = await discoverSkills(f.cwd, true, active, f.agentDir);
    const disabled = snapshot.entries.find((entry) => entry.skill.filePath === piPath)!;
    assert.equal(entryStatus(disabled), "disabled");
    await setEnabled(snapshot.settings, disabled, true);
    assert.equal((await f.load()).some((skill) => skill.filePath === piPath), true);
  } finally { await f.cleanup(); }
});

test("package skill toggles preserve other filters and package fields", async () => {
  const f = await fixture();
  try {
    const pkg = join(f.root, "local-package");
    const path = join(pkg, "skills/package-test/SKILL.md");
    await f.skill(path, "fixture-package");
    await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "fixture-package", pi: { skills: ["skills"] } }));
    const settings = SettingsManager.create(f.cwd, f.agentDir, { projectTrusted: true });
    settings.setProjectPackages([{ source: pkg, prompts: [], extensions: [] }]);
    await settings.flush();
    const snapshot = await discoverSkills(f.cwd, true, await f.load(), f.agentDir);
    const entry = snapshot.entries.find((entry) => entry.skill.filePath === path)!;
    assert.ok(entry);
    await setEnabled(snapshot.settings, entry, false);
    assert.equal((await f.load()).some((skill) => skill.filePath === path), false);
    const saved = JSON.parse(await readFile(join(f.cwd, ".pi/settings.json"), "utf8"));
    assert.deepEqual(saved.packages[0].extensions, []);
    assert.deepEqual(saved.packages[0].prompts, []);
    const disabled = await discoverSkills(f.cwd, true, await f.load(), f.agentDir);
    await setEnabled(disabled.settings, disabled.entries.find((entry) => entry.skill.filePath === path)!, true);
    assert.equal((await f.load()).some((skill) => skill.filePath === path), true);
  } finally { await f.cleanup(); }
});

test("untrusted projects do not expose project skills", async () => {
  const f = await fixture();
  try {
    const path = join(f.cwd, ".pi/skills/private/SKILL.md");
    await f.skill(path, "fixture-private");
    const snapshot = await discoverSkills(f.cwd, false, [], f.agentDir);
    assert.equal(snapshot.entries.some((entry) => entry.skill.filePath === path), false);
  } finally { await f.cleanup(); }
});

test("plain discovery entries survive repeated toggles", () => {
  assert.deepEqual(replaceOverride(["/tmp/skill.md", "-/tmp/skill.md", "!other"], "/tmp/skill.md", true), ["/tmp/skill.md", "!other", "+/tmp/skill.md"]);
});

test("user skills toggle in user settings while duplicate names remain distinct", async () => {
  const f = await fixture();
  try {
    const userPath = join(f.agentDir, "skills/user-test/SKILL.md");
    const projectPath = join(f.cwd, ".pi/skills/project-test/SKILL.md");
    await f.skill(userPath, "fixture-duplicate");
    await f.skill(projectPath, "fixture-duplicate");
    const active = await f.load();
    const snapshot = await discoverSkills(f.cwd, true, active, f.agentDir);
    const entries = snapshot.entries.filter((entry) => entry.skill.name === "fixture-duplicate");
    assert.equal(entries.length, 2);
    assert.equal(entries.filter((entry) => entry.active).length, 1);
    assert.equal(entries.filter((entry) => entryStatus(entry) === "inactive").length, 1);
    await setEnabled(snapshot.settings, entries.find((entry) => entry.skill.filePath === userPath)!, false);
    const userSettings = JSON.parse(await readFile(join(f.agentDir, "settings.json"), "utf8"));
    assert.ok(userSettings.skills.some((path: string) => path.startsWith("-")));
    assert.equal((await f.load()).some((skill) => skill.filePath === userPath), false);
  } finally { await f.cleanup(); }
});

test("explicit Markdown discovery paths survive a disable and enable cycle", async () => {
  const f = await fixture();
  try {
    const path = join(f.root, "custom-skill.md");
    await f.skill(path, "fixture-custom");
    const settings = SettingsManager.create(f.cwd, f.agentDir, { projectTrusted: true });
    settings.setProjectSkillPaths([path]);
    await settings.flush();
    const snapshot = await discoverSkills(f.cwd, true, await f.load(), f.agentDir);
    await setEnabled(snapshot.settings, snapshot.entries.find((entry) => entry.skill.filePath === path)!, false);
    assert.equal((await f.load()).some((skill) => skill.filePath === path), false);
    const disabled = await discoverSkills(f.cwd, true, await f.load(), f.agentDir);
    const entry = disabled.entries.find((entry) => entry.skill.filePath === path)!;
    assert.ok(entry);
    await setEnabled(disabled.settings, entry, true);
    assert.equal((await f.load()).some((skill) => skill.filePath === path), true);
  } finally { await f.cleanup(); }
});
