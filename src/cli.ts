import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { validateSlug, validateSource } from "./catalog.ts";

export function skillsCliPath(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("skills/package.json")), "bin", "cli.mjs");
}

export function nodeCommand(): string {
  // A compiled Bun Pi executable cannot act as the Node.js CLI.
  return process.versions.bun ? "node" : process.execPath;
}

export function installArgs(source: string, name: string, global: boolean): string[] {
  return ["add", validateSource(source), "--skill", validateSlug(name), "--agent", "pi", "--yes", ...(global ? ["--global"] : [])];
}

export function updateArgs(name: string | undefined, global: boolean): string[] {
  return ["update", ...(name ? [validateSlug(name)] : []), global ? "--global" : "--project", "--yes"];
}

export function uninstallArgs(name: string, global: boolean): string[] {
  return ["remove", validateSlug(name), "--yes", ...(global ? ["--global"] : [])];
}

export function browserCommand(url: string, platform = process.platform): { command: string; args: string[] } {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "skills.sh" || parsed.username || parsed.password || parsed.port) {
    throw new Error("Only HTTPS links on skills.sh can be opened.");
  }
  if (platform === "darwin") return { command: "open", args: [parsed.href] };
  // Invoke an executable directly. Do not pass catalog text through a shell.
  if (platform === "win32") return { command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", parsed.href] };
  return { command: "xdg-open", args: [parsed.href] };
}
