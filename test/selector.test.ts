import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { SkillSelector } from "../src/selector.ts";
import type { SkillChange, SkillEntry } from "../src/discovery.ts";

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as Theme;

function entry(name: string, enabled: boolean, directory = name): SkillEntry {
  const path = join("/fixtures", directory, "SKILL.md");
  return {
    active: enabled,
    skill: { name, description: "Skill instructions.", filePath: path, baseDir: join("/fixtures", directory), disableModelInvocation: false, sourceInfo: { path, source: "auto", scope: "project", origin: "top-level" } },
    resource: { path, enabled, metadata: { source: "auto", scope: "project", origin: "top-level" } },
  };
}

function harness(entries = [entry("alpha", true), entry("beta", false), entry("gamma", true)]) {
  const results: Array<SkillChange[] | undefined> = [];
  const selector = new SkillSelector(entries, theme, (changes) => results.push(changes), () => {});
  return { selector, entries, results, text: (width = 120) => selector.render(width).join("\n"), key: (key: string) => selector.handleInput(key) };
}

test("multiple toggles stay in the picker and only Ctrl+S returns changes", () => {
  const h = harness();
  assert.match(h.text(), /\[x\] alpha/);
  assert.match(h.text(), /\[ \] beta/);
  h.key("\r");
  h.key("\x1b[B");
  h.key("\r");
  assert.equal(h.results.length, 0);
  assert.match(h.text(), /\[ \] alpha/);
  assert.match(h.text(), /\[x\] beta/);
  assert.match(h.text(), /2 unsaved changes/);
  assert.equal(h.entries[0].resource!.enabled, true);
  assert.equal(h.entries[1].resource!.enabled, false);
  h.key("\x13");
  assert.deepEqual(h.results, [[{ entry: h.entries[0], enabled: false }, { entry: h.entries[1], enabled: true }]]);
});

test("Esc cancels drafts and toggling twice clears the pending change", () => {
  const h = harness();
  h.key("\r");
  h.key("\r");
  assert.match(h.text(), /No unsaved changes/);
  h.key("\r");
  h.key("\x1b");
  assert.deepEqual(h.results, [undefined]);
  assert.equal(h.entries[0].resource!.enabled, true);
});

test("filters follow draft selections and preserve changes across views", () => {
  const h = harness();
  h.key("\t");
  assert.match(h.text(), /\[Active\]/);
  assert.doesNotMatch(h.text(), /\[ \] beta/);
  h.key("\r");
  assert.doesNotMatch(h.text(), /\[ \] alpha/);
  h.key("\t");
  assert.match(h.text(), /\[Inactive\]/);
  assert.match(h.text(), /\[ \] alpha/);
  assert.match(h.text(), /\[ \] beta/);
  h.key("\t");
  assert.match(h.text(), /\[Changed\]/);
  assert.match(h.text(), /\[ \] alpha/);
  assert.doesNotMatch(h.text(), /\[ \] beta/);
  h.key("\x1b[Z");
  assert.match(h.text(), /\[Inactive\]/);
  h.key("\x13");
  assert.deepEqual(h.results[0], [{ entry: h.entries[0], enabled: false }]);
});

test("bulk controls change only matching skills and skip read-only sources", () => {
  const external = entry("external", true);
  external.resource = undefined;
  const h = harness([entry("alpha", true, "group/alpha"), entry("beta", true, "group/beta"), entry("gamma", true), external]);
  for (const char of "group") h.key(char);
  h.key("\x04");
  assert.match(h.text(), /2 unsaved changes/);
  h.key("\x03");
  assert.match(h.text(), /\[x\] gamma/);
  assert.match(h.text(), /\[x\] external.*read-only/);
  h.key("\x04");
  h.key("\x13");
  assert.deepEqual(h.results[0]?.map(({ entry }) => entry.skill.name).sort(), ["alpha", "beta", "gamma"]);
});

test("read-only skill selection does not change its checkbox", () => {
  const external = entry("external", true);
  external.resource = undefined;
  const h = harness([external]);
  h.key("\r");
  assert.match(h.text(), /controlled by the CLI/);
  assert.match(h.text(), /\[x\] external/);
  h.key("\x13");
  assert.deepEqual(h.results, [[]]);
});

test("search ranks identical names by directory and accepts spaces", () => {
  const h = harness([entry("same", true, "first project"), entry("same", false, "second project")]);
  for (const char of "second project") h.key(char);
  assert.match(h.text(), /second project/);
  assert.ok(h.text().indexOf("second project") < h.text().indexOf("first project"));
  h.key("\r");
  h.key("\x13");
  assert.equal(h.results[0]?.[0].entry, h.entries[1]);
});

test("rendering fits narrow terminals and empty views remain usable", () => {
  const h = harness([entry("长目录-skill", true, "a".repeat(200))]);
  for (const width of [20, 40, 80]) {
    assert.ok(h.selector.render(width).every((line) => visibleWidth(line) <= width));
  }
  for (const char of "no-match") h.key(char);
  assert.match(h.text(), /No matching skills/);
  h.key("\r");
  h.key("\x1b[B");
  h.key("\x13");
  assert.deepEqual(h.results, [[]]);
});
