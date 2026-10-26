import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { browserCommand, installArgs, skillsCliPath, updateArgs } from "../src/cli.ts";

test("the installed CLI resolves without npx or a shell", () => {
  assert.equal(existsSync(skillsCliPath()), true);
  assert.deepEqual(installArgs("owner/repo", "test-skill", false), ["add", "owner/repo", "--skill", "test-skill", "--agent", "pi", "--yes"]);
  assert.equal(installArgs("owner/repo", "test-skill", true).at(-1), "--global");
  assert.throws(() => installArgs("--bad/repo", "skill", false));
  assert.throws(() => installArgs("a/b", "--all", false));
});

test("updates always select an explicit scope", () => {
  assert.deepEqual(updateArgs(undefined, false), ["update", "--project", "--yes"]);
  assert.deepEqual(updateArgs("test-skill", true), ["update", "test-skill", "--global", "--yes"]);
});

test("browser links stay on skills.sh on supported platforms", () => {
  const url = "https://skills.sh/a/b/c";
  assert.deepEqual(browserCommand(url, "linux"), { command: "xdg-open", args: [url] });
  assert.equal(browserCommand(url, "darwin").command, "open");
  assert.equal(browserCommand(url, "win32").command, "rundll32.exe");
  for (const bad of ["file:///tmp/a", "https://evil.com/", "https://skills.sh.evil.com", "https://user@skills.sh/"]) {
    assert.throws(() => browserCommand(bad));
  }
});
