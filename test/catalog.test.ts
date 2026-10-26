import assert from "node:assert/strict";
import test from "node:test";
import { descriptionFromHtml, plain, searchSkills, skillUrl, type Fetch } from "../src/catalog.ts";

test("search uses the public endpoint and loads the site's own descriptions", async () => {
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
  assert.equal(result[0].description, "Use this skill to test an app.");
  assert.equal(result[1].description, "Provided by the API.");
  assert.equal(new URL(requests[0]).searchParams.get("q"), "test app");
  assert.equal(requests.length, 2);
});

test("search preserves results when a description page fails", async () => {
  const fetcher = (async (input) => {
    if (String(input).includes("/api/search")) return Response.json({ skills: [{ id: "a/b/skill", source: "a/b", name: "Skill" }] });
    throw new Error("offline");
  }) as Fetch;
  assert.equal((await searchSkills("ab", fetcher))[0].description, undefined);
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
