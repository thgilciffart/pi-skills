import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { installedSkills, requireInstallation, verifyUninstalled } from "../src/installations.ts";
import { skillsCliPath, uninstallArgs } from "../src/cli.ts";

test("uninstall identifies the correct scope and rejects a different source", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-skills-installed-"));
  try {
    const cwd = join(root, "project");
    const home = join(root, "home");
    await mkdir(cwd);
    await mkdir(join(home, ".agents"), { recursive: true });
    await writeFile(join(cwd, "skills-lock.json"), JSON.stringify({ skills: { fixture: { source: "one/repo" }, "../bad": { source: "bad/repo" } } }));
    await writeFile(join(home, ".agents/.skill-lock.json"), JSON.stringify({ skills: { fixture: { source: "two/repo" } } }));
    const [project] = await installedSkills(cwd, false, home, "");
    const [global] = await installedSkills(cwd, true, home, "");
    assert.equal(project.source, "one/repo");
    assert.equal(project.filePath, join(cwd, ".agents/skills/fixture/SKILL.md"));
    assert.equal(global.source, "two/repo");
    assert.equal(global.global, true);
    await assert.rejects(verifyUninstalled(project), /left the lock entry/);
    await assert.rejects(requireInstallation("fixture", false, cwd, "different/repo"), /differs from the selected repository/);
    await assert.rejects(requireInstallation("missing", false, cwd), /not tracked/);
    assert.equal((await installedSkills(cwd, false, home, "")).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("global lock discovery honors XDG_STATE_HOME", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-skills-state-"));
  try {
    const state = join(root, "state");
    await mkdir(join(state, "skills"), { recursive: true });
    await writeFile(join(state, "skills/.skill-lock.json"), JSON.stringify({ skills: { fixture: { source: "one/repo" } } }));
    const [installed] = await installedSkills(root, true, join(root, "home"), state);
    assert.equal(installed.filePath, join(root, "home/.agents/skills/fixture/SKILL.md"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("the real skills CLI removes one project skill and its lock entry without affecting its neighbor", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-skills-uninstall-"));
  try {
    for (const name of ["remove-me", "keep-me"]) {
      const directory = join(root, ".agents/skills", name);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: A fixture.\n---\nInstructions.\n`);
      await writeFile(join(directory, "reference.txt"), "Supporting files.");
    }
    await writeFile(join(root, "skills-lock.json"), JSON.stringify({ version: 1, skills: { "remove-me": { source: "one/repo", sourceType: "github" }, "keep-me": { source: "two/repo", sourceType: "github" } } }));
    const installed = await requireInstallation("remove-me", false, root);
    await assert.rejects(verifyUninstalled(installed), /still exists/);
    await promisify(execFile)(process.execPath, [skillsCliPath(), ...uninstallArgs("remove-me", false)], { cwd: root, env: { ...process.env, DISABLE_TELEMETRY: "1" }, timeout: 20_000 });
    await verifyUninstalled(installed);
    const lock = JSON.parse(await readFile(join(root, "skills-lock.json"), "utf8"));
    assert.equal(lock.skills["remove-me"], undefined);
    assert.equal(lock.skills["keep-me"].source, "two/repo");
    assert.equal(await readFile(join(root, ".agents/skills/keep-me/reference.txt"), "utf8"), "Supporting files.");
  } finally { await rm(root, { recursive: true, force: true }); }
});
