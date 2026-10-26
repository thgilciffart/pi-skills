export interface CatalogSkill {
  id: string;
  name: string;
  slug: string;
  source: string;
  installs: number;
  description?: string;
  updatedAt?: string;
  updatedAtSource?: "skills.sh" | "GitHub";
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

function requestSignal(signal: AbortSignal | undefined, timeout: number): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
}

function validDate(value: unknown): string | undefined {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString().replace(".000Z", "Z") : undefined;
}

export async function searchSkills(query: string, fetcher: Fetch = fetch, signal?: AbortSignal): Promise<CatalogSkill[]> {
  if (query.trim().length < 2) throw new Error("Enter at least two characters to search.");
  const url = new URL("https://skills.sh/api/search");
  url.search = new URLSearchParams({ q: query.trim(), limit: "10" }).toString();
  const response = await fetcher(url, { signal: requestSignal(signal, 15_000) });
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
      updatedAt: validDate(item.updatedAt ?? item.updated_at ?? item.lastUpdated),
      updatedAtSource: validDate(item.updatedAt ?? item.updated_at ?? item.lastUpdated) ? "skills.sh" : undefined,
    });
  }
  return skills;
}

/** Read catalog details and cache repository trees for the picker. */
export class SkillsCatalog {
  private readonly trees = new Map<string, string[] | undefined>();

  constructor(private readonly fetcher: Fetch = fetch) {}

  search(query: string, signal?: AbortSignal): Promise<CatalogSkill[]> {
    return searchSkills(query, this.fetcher, signal);
  }

  private async updatedAt(skill: CatalogSkill, signal?: AbortSignal): Promise<string | undefined> {
    validateSource(skill.source);
    validateSlug(skill.slug);
    try {
      if (!this.trees.has(skill.source)) {
        const response = await this.fetcher(`https://api.github.com/repos/${skill.source}/git/trees/HEAD?recursive=1`, { signal: requestSignal(signal, 5_000) });
        const data = response.ok ? await response.json() : undefined;
        const paths = data && !data.truncated && Array.isArray(data.tree)
          ? data.tree.filter((item: { path?: unknown; type?: unknown }) => item.type === "blob" && typeof item.path === "string" && /(^|\/)SKILL\.md$/.test(item.path)).map((item: { path: string }) => item.path)
          : undefined;
        if (!signal?.aborted) this.trees.set(skill.source, paths);
      }
      const paths = this.trees.get(skill.source) ?? [];
      let matches = paths.filter((path) => path.split("/").at(-2)?.toLowerCase() === skill.slug.toLowerCase());
      if (!matches.length && paths.length === 1 && paths[0] === "SKILL.md") matches = paths;
      if (matches.length !== 1 || signal?.aborted) return undefined;
      // The directory includes supporting files, so their updates count too.
      const path = matches[0] === "SKILL.md" ? "" : matches[0].slice(0, -"/SKILL.md".length);
      const url = new URL(`https://api.github.com/repos/${skill.source}/commits`);
      url.search = new URLSearchParams({ path, per_page: "1" }).toString();
      const response = await this.fetcher(url, { signal: requestSignal(signal, 5_000) });
      if (!response.ok) return undefined;
      const commits = await response.json();
      return Array.isArray(commits) ? validDate(commits[0]?.commit?.committer?.date) : undefined;
    } catch { return undefined; }
  }

  async details(skill: CatalogSkill, signal?: AbortSignal): Promise<Partial<CatalogSkill>> {
    const [description, updatedAt] = await Promise.all([
      (async () => {
        if (skill.description) return skill.description;
        try {
          const page = await this.fetcher(skillUrl(skill), { signal: requestSignal(signal, 5_000) });
          return page.ok ? descriptionFromHtml(await page.text()) : undefined;
        } catch { return undefined; }
      })(),
      skill.updatedAt ? Promise.resolve(skill.updatedAt) : this.updatedAt(skill, signal),
    ]);
    return { description, updatedAt, updatedAtSource: updatedAt ? skill.updatedAtSource ?? "GitHub" : undefined };
  }
}
