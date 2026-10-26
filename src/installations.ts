import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { validateSlug } from "./catalog.ts";

export interface Installation {
  name: string;
  source: string;
  global: boolean;
  filePath: string;
  lockPath?: string;
}

export async function installedSkills(cwd: string, global: boolean, home = homedir(), stateHome = process.env.XDG_STATE_HOME): Promise<Installation[]> {
  const lock = global ? stateHome ? join(stateHome, "skills/.skill-lock.json") : join(home, ".agents/.skill-lock.json") : join(cwd, "skills-lock.json");
  let contents: string;
  try { contents = await readFile(lock, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const data = JSON.parse(contents);
  if (!data?.skills || typeof data.skills !== "object" || Array.isArray(data.skills)) throw new Error(`Invalid skills lock file: ${lock}`);
  const result: Installation[] = [];
  for (const [name, entry] of Object.entries(data.skills)) {
    try { validateSlug(name); } catch { continue; }
    if (!entry || typeof entry !== "object" || !("source" in entry) || typeof entry.source !== "string") continue;
    const folder = name.toLowerCase().replace(/^[.\-]+|[.\-]+$/g, "").slice(0, 255);
    result.push({ name, source: entry.source, global, filePath: join(global ? home : cwd, ".agents/skills", folder, "SKILL.md"), lockPath: lock });
  }
  return result;
}

export async function requireInstallation(name: string, global: boolean, cwd: string, source?: string, home = homedir()): Promise<Installation> {
  validateSlug(name);
  const installed = (await installedSkills(cwd, global, home)).find((entry) => entry.name === name);
  if (!installed) throw new Error(`${name} is not tracked by the skills CLI ${global ? "globally" : "in this project"}.`);
  if (source && installed.source.toLowerCase() !== source.toLowerCase()) {
    throw new Error(`${name} is installed from ${installed.source}, which differs from the selected repository. Open /skills to select the installed copy.`);
  }
  return installed;
}

export async function verifyUninstalled(installation: Installation): Promise<void> {
  const file = await lstat(dirname(installation.filePath)).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (file) throw new Error(`The skills CLI did not remove ${installation.name}. The skill still exists at ${resolve(dirname(installation.filePath))}.`);
  if (installation.lockPath) {
    const contents = await readFile(installation.lockPath, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (contents && JSON.parse(contents)?.skills?.[installation.name]) throw new Error(`The skills CLI left the lock entry for ${installation.name}.`);
  }
}
