export interface CatalogSkill {
  id: string;
  name: string;
  slug: string;
  source: string;
  installs: number;
  description?: string;
}

export type Fetch = typeof globalThis.fetch;

// Catalog text appears in a terminal. Remove terminal controls before display.
export function plain(value: string): string {
  return value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
}

export function validateSource(source: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\/[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(source)) {
    throw new Error("Use a GitHub source in owner/repo format.");
  }
  return source;
}

export function validateSlug(slug: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(slug)) throw new Error("Invalid skill name.");
  return slug;
}

export function skillUrl(skill: Pick<CatalogSkill, "source" | "slug">): string {
  return `https://skills.sh/${validateSource(skill.source)}/${encodeURIComponent(validateSlug(skill.slug))}`;
}

export function descriptionFromHtml(html: string): string | undefined {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data, ...(data["@graph"] ?? [])];
      const item = items.find((item) => item?.["@type"] === "SoftwareApplication" && typeof item.description === "string");
      if (item) return plain(item.description);
    } catch { /* Fall back to the page's description. */ }
  }
  const value = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1];
  if (!value) return undefined;
  return plain(value.replace(/&#(?:x([\da-f]+)|(\d+));|&(amp|quot|apos|lt|gt);/gi, (match, hex, dec, name) => {
    if (hex || dec) {
      const code = parseInt(hex ?? dec, hex ? 16 : 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ({ amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" } as Record<string, string>)[name.toLowerCase()] ?? match;
  }));
}

export async function searchSkills(query: string, fetcher: Fetch = fetch): Promise<CatalogSkill[]> {
  if (query.trim().length < 2) throw new Error("Enter at least two characters to search.");
  const url = new URL("https://skills.sh/api/search");
  url.search = new URLSearchParams({ q: query.trim(), limit: "10" }).toString();
  const response = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`skills.sh search failed with HTTP ${response.status}. Try again later.`);
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("skills" in body) || !Array.isArray(body.skills)) {
    throw new Error("skills.sh returned an unexpected search response.");
  }
  const skills: CatalogSkill[] = [];
  for (const item of body.skills.slice(0, 10)) {
    if (!item || typeof item.source !== "string" || typeof item.name !== "string") continue;
    const slug = item.skillId ?? (typeof item.id === "string" ? item.id.split("/").at(-1) : undefined);
    if (typeof slug !== "string") continue;
    try {
      validateSource(item.source);
      validateSlug(slug);
    } catch { continue; }
    skills.push({
      id: `${item.source}/${slug}`, source: item.source, slug, name: plain(item.name),
      installs: typeof item.installs === "number" ? item.installs : 0,
      description: typeof item.description === "string" ? plain(item.description) : undefined,
    });
  }
  // Keep description requests bounded and preserve results when a detail page fails.
  for (let start = 0; start < skills.length; start += 3) {
    await Promise.all(skills.slice(start, start + 3).map(async (skill) => {
      if (skill.description) return;
      try {
        const page = await fetcher(skillUrl(skill), { signal: AbortSignal.timeout(5_000) });
        if (page.ok) skill.description = descriptionFromHtml(await page.text());
      } catch { /* A missing description does not prevent installation. */ }
    }));
  }
  return skills;
}
