import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { CatalogPicker, type CatalogActions } from "../src/catalog-picker.ts";
import type { CatalogSkill } from "../src/catalog.ts";

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as Theme;
const fixtures: CatalogSkill[] = ["alpha", "beta"].map((name) => ({ id: `owner/repo/${name}`, name, slug: name, source: "owner/repo", installs: 1234 }));

function harness(overrides: Partial<CatalogActions> = {}) {
  const searches: string[] = [];
  const opened: string[] = [];
  const installs: Array<{ id: string; global: boolean }> = [];
  let closed = 0;
  let height = 30;
  const picker = new CatalogPicker(theme, {
    search: async (query) => { searches.push(query); return structuredClone(fixtures); },
    details: async (skill) => ({ description: `Only the ${skill.name} description.`, updatedAt: "2026-10-20T00:00:00Z", updatedAtSource: "GitHub" }),
    open: async (skill) => { opened.push(skill.id); },
    install: async (skill, global) => { installs.push({ id: skill.id, global }); },
    ...overrides,
  }, () => { closed++; }, () => {}, () => height);
  return { picker, searches, opened, installs, closed: () => closed, resize: (rows: number) => { height = rows; }, text: (width = 120) => picker.render(width).join("\n") };
}

test("results show only the highlighted description and fill the viewport", async () => {
  const h = harness();
  await h.picker.search("testing");
  await setImmediate();
  assert.match(h.text(), /Only the alpha description/);
  assert.doesNotMatch(h.text(), /Only the beta description/);
  assert.match(h.text(), /2026-10-20/);
  h.picker.handleInput("\x1b[B");
  assert.match(h.text(), /Only the beta description/);
  assert.doesNotMatch(h.text(), /Only the alpha description/);
  for (const [rows, width] of [[30, 120], [20, 60], [18, 35]]) {
    h.resize(rows);
    const lines = h.picker.render(width);
    assert.equal(lines.length, rows);
    assert.ok(lines.every((line) => visibleWidth(line) === width));
    assert.match(lines.join("\n"), /Esc close/);
  }
});

test("browser and both install shortcuts keep the catalog open", async () => {
  const h = harness();
  await h.picker.search("testing");
  for (const key of ["b", "p", "g", "g"]) { h.picker.handleInput(key); await setImmediate(); }
  assert.deepEqual(h.opened, [fixtures[0].id]);
  assert.deepEqual(h.installs, [{ id: fixtures[0].id, global: false }, { id: fixtures[0].id, global: true }]);
  assert.equal(h.closed(), 0);
  h.picker.handleInput("\x1b");
  assert.equal(h.closed(), 1);
});

test("search again accepts shortcut letters as query text and resets selection", async () => {
  const h = harness();
  await h.picker.search("first");
  h.picker.handleInput("\x06");
  for (const key of "pgb query") h.picker.handleInput(key);
  h.picker.handleInput("\r");
  await setImmediate();
  assert.deepEqual(h.searches, ["first", "pgb query"]);
  assert.deepEqual(h.installs, []);
  assert.deepEqual(h.opened, []);
});

test("hover changes the description without running an action", async () => {
  const h = harness();
  await h.picker.search("testing");
  await setImmediate();
  h.picker.render(120);
  h.picker.handleMouse({ type: "move", button: "none", x: 10, y: 6, screenX: 10, screenY: 6, width: 120, height: 30, shift: false, alt: false, ctrl: false });
  assert.match(h.text(), /Only the beta description/);
  assert.deepEqual(h.installs, []);
});

test("errors and empty results allow another search", async () => {
  const h = harness({ search: async (query) => { if (query === "bad") throw new Error("Service unavailable"); return []; } });
  await h.picker.search("bad");
  assert.match(h.text(), /Service unavailable/);
  await h.picker.search("none");
  assert.match(h.text(), /No results/);
  assert.equal(h.closed(), 0);
});

test("new searches abort older requests and ignore late responses", async () => {
  let finish!: (skills: CatalogSkill[]) => void;
  let firstSignal!: AbortSignal;
  const h = harness({ search: async (query, signal) => {
    if (query === "first") { firstSignal = signal; return new Promise((resolve) => { finish = resolve; }); }
    return [{ ...fixtures[1] }];
  } });
  const first = h.picker.search("first");
  await h.picker.search("second");
  assert.equal(firstSignal.aborted, true);
  finish([{ ...fixtures[0] }]);
  await first;
  assert.match(h.text(), /beta/);
  assert.doesNotMatch(h.text(), /alpha/);
});

test("metadata failures are nonfatal and closing aborts remaining work", async () => {
  let signal!: AbortSignal;
  const h = harness({ details: async (_skill, requestSignal) => { signal = requestSignal; throw new Error("Unavailable"); } });
  await h.picker.search("testing");
  await setImmediate();
  assert.match(h.text(), /Last updated unknown/);
  h.picker.handleInput("\x1b");
  assert.equal(signal.aborted, true);
});

test("installation errors stay visible and duplicate keystrokes do not start parallel installs", async () => {
  let finish!: () => void;
  let calls = 0;
  const h = harness({ install: async () => { calls++; await new Promise<void>((resolve) => { finish = resolve; }); throw new Error("Trust this project first."); } });
  await h.picker.search("testing");
  h.picker.handleInput("p");
  h.picker.handleInput("p");
  assert.equal(calls, 1);
  finish();
  await setImmediate();
  assert.match(h.text(), /Trust this project first/);
  assert.equal(h.closed(), 0);
});
