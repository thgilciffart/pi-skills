import { dirname, relative, resolve, sep } from "node:path";
import {
  DefaultPackageManager, getAgentDir, loadSkills, SettingsManager,
  type ResolvedResource, type Skill,
} from "@earendil-works/pi-coding-agent";
import { installedSkills, type Installation } from "./installations.ts";

export interface SkillEntry {
  skill: Skill;
  resource?: ResolvedResource;
  active: boolean;
  installation?: Installation;
}

export async function discoverSkills(cwd: string, trusted: boolean, activeSkills: Skill[], agentDir = getAgentDir()) {
  const settings = SettingsManager.create(cwd, agentDir, { projectTrusted: trusted });
  const manager = new DefaultPackageManager({ cwd, agentDir, settingsManager: settings });
  // Discovery must not install missing packages.
  const resolved = await manager.resolve(async () => "skip");
  const active = new Set(activeSkills.map((skill) => resolve(skill.filePath)));
  const entries = new Map<string, SkillEntry>();
  for (const resource of resolved.skills) {
    const result = loadSkills({ cwd, agentDir, skillPaths: [resource.path], includeDefaults: false });
    for (const skill of result.skills) {
      const key = resolve(skill.filePath);
      if (!entries.has(key)) entries.set(key, { skill, resource, active: active.has(key) });
    }
  }
  // Include CLI skills and resources provided by other extensions.
  for (const skill of activeSkills) {
    const key = resolve(skill.filePath);
    const entry = entries.get(key);
    if (entry) entry.skill = skill;
    else entries.set(key, { skill, active: true });
  }
  const installations = [
    ...(trusted ? await installedSkills(cwd, false).catch(() => []) : []),
    ...await installedSkills(cwd, true).catch(() => []),
  ];
  for (const entry of entries.values()) {
    entry.installation = installations.find((installation) => resolve(installation.filePath) === resolve(entry.skill.filePath));
  }
  return { settings, entries: [...entries.values()].sort((a, b) => a.skill.name.localeCompare(b.skill.name)) };
}

export function replaceOverride(paths: string[], pattern: string, enabled: boolean, aliases: string[] = []): string[] {
  // Keep plain discovery paths, including a file explicitly listed in settings.
  return [...paths.filter((path) => ![pattern, ...aliases].some((value) => ["+", "-", "!"].some((prefix) => path === `${prefix}${value}`))), `${enabled ? "+" : "-"}${pattern}`];
}

export interface SkillChange {
  entry: SkillEntry;
  enabled: boolean;
  uninstall?: true;
}

export function isEnabled(entry: SkillEntry): boolean {
  return entry.resource?.enabled ?? entry.active;
}

export function canToggle(entry: SkillEntry): boolean {
  return !!entry.resource && entry.resource.metadata.scope !== "temporary";
}

type ScopeSettings = ReturnType<SettingsManager["getGlobalSettings"]>;

function applyEnabled(current: ScopeSettings, entry: SkillEntry, enabled: boolean): "packages" | "skills" {
  const resource = entry.resource;
  if (!resource || resource.metadata.scope === "temporary") {
    throw new Error("This skill comes from the CLI or another extension. Change its source configuration to toggle it.");
  }
  const { metadata } = resource;
  if (metadata.origin === "package") {
    const packages = structuredClone(current.packages ?? []);
    const index = packages.findIndex((pkg) => (typeof pkg === "string" ? pkg : pkg.source) === metadata.source);
    if (index < 0) throw new Error("The package configuration changed. Run /reload and try again.");
    const pkg = packages[index];
    const next = typeof pkg === "string" ? { source: pkg } : pkg;
    const base = metadata.packageRoot ?? metadata.baseDir;
    if (!base) throw new Error("Pi did not provide the package directory.");
    const pattern = relative(base, resource.path).split(sep).join("/");
    next.skills = replaceOverride(next.skills ?? [], pattern, enabled);
    packages[index] = next;
    current.packages = packages;
    return "packages";
  } else {
    // Absolute paths work for both .pi and .agents roots, whose bases differ.
    const base = metadata.baseDir;
    const alias = base ? relative(base, resource.path).split(sep).join("/") : resource.path;
    const paths = replaceOverride(current.skills ?? [], resource.path, enabled, [alias]);
    current.skills = paths;
    return "skills";
  }
}

export async function setEnabledMany(settings: SettingsManager, changes: SkillChange[]): Promise<void> {
  const scopes = new Map<boolean, { current: ScopeSettings; fields: Set<"packages" | "skills"> }>();
  // Validate the full selection before scheduling any writes.
  for (const { entry, enabled } of changes) {
    const project = entry.resource?.metadata.scope === "project";
    if (project && !settings.isProjectTrusted()) throw new Error("Trust this project in Pi before changing project skills.");
    let scope = scopes.get(project);
    if (!scope) {
      scope = { current: structuredClone(project ? settings.getProjectSettings() : settings.getGlobalSettings()), fields: new Set() };
      scopes.set(project, scope);
    }
    scope.fields.add(applyEnabled(scope.current, entry, enabled));
  }
  for (const [project, { current, fields }] of scopes) {
    if (fields.has("skills")) {
      if (project) settings.setProjectSkillPaths(current.skills ?? []);
      else settings.setSkillPaths(current.skills ?? []);
    }
    if (fields.has("packages")) {
      if (project) settings.setProjectPackages(current.packages ?? []);
      else settings.setPackages(current.packages ?? []);
    }
  }
  await settings.flush();
  const errors = settings.drainErrors();
  if (errors.length) throw new Error(`Could not save skill settings: ${errors.map((error) => String(error.error)).join("; ")}`);
}

export async function setEnabled(settings: SettingsManager, entry: SkillEntry, enabled: boolean): Promise<void> {
  await setEnabledMany(settings, [{ entry, enabled }]);
}

export function entryStatus(entry: SkillEntry): string {
  if (entry.active) return "enabled";
  return entry.resource?.enabled ? "inactive" : "disabled";
}

export function entryDirectory(entry: SkillEntry): string {
  return dirname(entry.skill.filePath);
}
