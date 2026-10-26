import assert from "node:assert/strict";
import test from "node:test";
import { descriptionFromHtml, plain, searchSkills, SkillsCatalog, skillUrl, type Fetch } from "../src/catalog.ts";

test("search returns results without waiting for descriptions", async () => {
  const requests: string[] = [];
  const fetcher = (async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("/api/search")) return Response.json({ skills: [
      { id: "owner/repo/test-skill", source: "owner/repo", skillId: "test-skill", name: "Test skill", installs: 7 },
      { id: "owner/repo/second", source: "owner/repo", name: "Second", description: "Provided by the API." },
      { source: "--bad/repo", name: "Bad", skillId: "escape" },
      { source: "owner/repo", name: "Malformed", id: 42 },
    ] });
    return new Response('<script type="application/ld+json">{"@type":"SoftwareApplication","description":"Use this skill to test an app."}</script>');
  }) as Fetch;
  const result = await searchSkills("test app", fetcher);
  assert.equal(result.length, 2);
  assert.equal(result[0].description, undefined);
  assert.equal(result[1].description, "Provided by the API.");
  assert.equal(new URL(requests[0]).searchParams.get("q"), "test app");
  assert.equal(requests.length, 1);
});

test("detail failures leave search results available", async () => {
  const fetcher = (async (input) => {
    if (String(input).includes("/api/search")) return Response.json({ skills: [{ id: "a/b/skill", source: "a/b", name: "Skill" }] });
    throw new Error("offline");
  }) as Fetch;
  const catalog = new SkillsCatalog(fetcher);
  const skills = await catalog.search("ab");
  assert.equal(skills.length, 1);
  assert.deepEqual(await catalog.details(skills[0]), { description: undefined, updatedAt: undefined, updatedAtSource: undefined });
});

test("last updated uses commits to the skill directory and reuses the repository tree", async () => {
  const urls: string[] = [];
  const catalog = new SkillsCatalog((async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/git/trees/")) return Response.json({ tree: [
      { type: "blob", path: "skills/first/SKILL.md" }, { type: "blob", path: "skills/second/SKILL.md" },
    ] });
    if (url.includes("/commits?")) return Response.json([{ commit: { committer: { date: "2026-10-20T12:34:56Z" } } }]);
    return new Response('<script type="application/ld+json">{"@type":"SoftwareApplication","description":"The provided description."}</script>');
  }) as Fetch);
  const skill = { id: "owner/repo/first", source: "owner/repo", slug: "first", name: "First", installs: 1 };
  const detail = await catalog.details(skill);
  assert.equal(detail.description, "The provided description.");
  assert.equal(detail.updatedAt, "2026-10-20T12:34:56Z");
  assert.equal(detail.updatedAtSource, "GitHub");
  assert.equal(new URL(urls.find((url) => url.includes("/commits?"))!).searchParams.get("path"), "skills/first");
  await catalog.details({ ...skill, id: "owner/repo/second", slug: "second" });
  assert.equal(urls.filter((url) => url.includes("/git/trees/")).length, 1);
});

test("ambiguous skill paths and rate limits leave the update date unknown", async () => {
  for (const tree of [
    { tree: [{ type: "blob", path: "one/skill/SKILL.md" }, { type: "blob", path: "two/skill/SKILL.md" }] },
    { truncated: true, tree: [{ type: "blob", path: "skill/SKILL.md" }] },
    undefined,
  ]) {
    const catalog = new SkillsCatalog((async (input) => {
      assert.match(String(input), /\/git\/trees\//);
      return tree ? Response.json(tree) : new Response("", { status: 403 });
    }) as Fetch);
    const detail = await catalog.details({ id: "a/b/skill", source: "a/b", slug: "skill", name: "Skill", installs: 0, description: "Provided." });
    assert.equal(detail.updatedAt, undefined);
    assert.equal(detail.description, "Provided.");
  }
});

test("catalog timestamps take precedence over GitHub lookups", async () => {
  const catalog = new SkillsCatalog((async () => Response.json({ skills: [{ source: "a/b", name: "Skill", skillId: "skill", description: "Provided.", updatedAt: "2026-10-20T18:00:00-06:00" }] })) as Fetch);
  const [skill] = await catalog.search("skill");
  assert.deepEqual(await catalog.details(skill), { description: "Provided.", updatedAt: "2026-10-21T00:00:00Z", updatedAtSource: "skills.sh" });
});

test("search reports service failures and changed response formats", async () => {
  await assert.rejects(searchSkills("a"), /two characters/);
  await assert.rejects(searchSkills("test", (async () => new Response("", { status: 429 })) as Fetch), /HTTP 429/);
  await assert.rejects(searchSkills("test", (async () => Response.json({ data: [] })) as Fetch), /unexpected/);
});

test("HTML fallback decodes entities and terminal text removes controls", () => {
  assert.equal(descriptionFromHtml('<meta name="description" content="Use &#x27;skills&#39; &amp; tools.">'), "Use 'skills' & tools.");
  assert.equal(plain("\x1b[31mred\x1b[0m\ntext\x07"), "red text");
  assert.throws(() => skillUrl({ source: "../bad", slug: "bad" }));
  assert.throws(() => skillUrl({ source: "a/b", slug: "../../bad" }));
});
