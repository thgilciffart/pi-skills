import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  getKeybindings, Input, Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi,
  type Component, type Focusable, type TuiMouseEvent, type TuiMouseEventResult,
} from "@earendil-works/pi-tui";
import { plain, skillUrl, type CatalogSkill } from "./catalog.ts";

export interface CatalogActions {
  search(query: string, signal: AbortSignal): Promise<CatalogSkill[]>;
  details(skill: CatalogSkill, signal: AbortSignal): Promise<Partial<CatalogSkill>>;
  open(skill: CatalogSkill): Promise<void>;
  install(skill: CatalogSkill, global: boolean): Promise<void>;
  uninstall(skill: CatalogSkill, global: boolean): Promise<void>;
}

export class CatalogPicker implements Component, Focusable {
  private readonly input = new Input({ prompt: "Search: ", placeholder: "Enter at least two characters, then press Enter" });
  private skills: CatalogSkill[] = [];
  private selected = 0;
  private query = "";
  private editing = true;
  private hasFocus = false;
  private searching = false;
  private busy = false;
  private closed = false;
  private status = "Enter a search to find skills on skills.sh.";
  private error = false;
  private searchRequest?: AbortController;
  private detailRequest?: AbortController;
  private readonly detailed = new Set<string>();
  private detailsQueue: CatalogSkill[] = [];
  private readonly installed = new Set<string>();
  private listStart = 5;
  private visibleStart = 0;
  private listHeight = 1;

  constructor(
    private readonly theme: Theme,
    private readonly actions: CatalogActions,
    private readonly done: () => void,
    private readonly requestRender: () => void,
    private readonly terminalRows: () => number,
  ) {}

  get focused(): boolean { return this.hasFocus; }
  set focused(value: boolean) { this.hasFocus = value; this.input.focused = value && this.editing; }

  async search(query: string): Promise<void> {
    query = query.trim();
    this.input.setValue(query);
    this.searchRequest?.abort();
    this.detailRequest?.abort();
    if (query.length < 2) { this.searching = false; this.status = "Enter at least two characters to search."; this.error = true; this.edit(true); return; }
    const request = this.searchRequest = new AbortController();
    this.query = query;
    this.skills = [];
    this.selected = 0;
    this.visibleStart = 0;
    this.searching = true;
    this.detailed.clear();
    this.detailsQueue = [];
    this.error = false;
    this.status = `Searching for ${plain(query)}...`;
    this.edit(false);
    try {
      const skills = await this.actions.search(query, request.signal);
      if (request.signal.aborted || this.closed) return;
      this.skills = skills;
      this.status = skills.length ? `${skills.length} results. Highlight a skill to read its description.` : "No results. Press Ctrl+F to search again.";
      this.searching = false;
      void this.loadDetails();
    } catch (error) {
      if (request.signal.aborted || this.closed) return;
      this.status = error instanceof Error ? plain(error.message) : "Search failed. Press Ctrl+F to try again.";
      this.error = true;
      this.searching = false;
      this.edit(true);
    }
    this.requestRender();
  }

  private edit(editing: boolean): void {
    this.editing = editing;
    this.input.focused = editing && this.hasFocus;
    this.requestRender();
  }

  private async loadDetails(): Promise<void> {
    const request = this.detailRequest = new AbortController();
    const queue = this.detailsQueue = [...this.skills];
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
      while (queue.length && !request.signal.aborted && !this.closed) {
        const skill = queue.shift()!;
        try {
          const details = await this.actions.details(skill, request.signal);
          if (request.signal.aborted || this.closed) return;
          Object.assign(skill, details);
        } catch { /* Keep the result available when metadata is unavailable. */ }
        if (request.signal.aborted || this.closed) return;
        this.detailed.add(skill.id);
        this.requestRender();
      }
    }));
  }

  private select(index: number): void {
    if (index === this.selected) return;
    this.selected = index;
    const queued = this.detailsQueue.indexOf(this.skills[index]);
    if (queued >= 0) this.detailsQueue.unshift(...this.detailsQueue.splice(queued, 1));
    this.requestRender();
  }

  private async action(kind: "browser" | "project" | "global" | "uninstall-project" | "uninstall-global"): Promise<void> {
    const skill = this.skills[this.selected];
    if (!skill || this.busy || this.searching) return;
    const key = `${skill.id}:${kind}`;
    const uninstall = kind.startsWith("uninstall-");
    const global = kind === "global" || kind === "uninstall-global";
    if (this.installed.has(key)) { this.status = `Already installed ${kind === "global" ? "globally" : "in this project"} during this search.`; this.requestRender(); return; }
    this.busy = true;
    this.error = false;
    this.status = kind === "browser" ? "Opening the skill in your browser..." : `${uninstall ? "Uninstalling" : "Installing"} ${skill.name} ${global ? "globally" : "in this project"}...`;
    this.requestRender();
    try {
      if (kind === "browser") await this.actions.open(skill);
      else if (uninstall) { await this.actions.uninstall(skill, global); this.installed.delete(`${skill.id}:${global ? "global" : "project"}`); }
      else { await this.actions.install(skill, global); this.installed.add(key); }
      this.status = kind === "browser" ? "Opened in your browser." : `${uninstall ? "Uninstalled" : "Installed"} ${skill.name}. Keep browsing, or press Esc to close and reload Pi.`;
    } catch (error) {
      this.status = error instanceof Error ? plain(error.message) : "The action failed. Try again.";
      this.error = true;
    }
    this.busy = false;
    if (!this.closed) this.requestRender();
  }

  handleInput(data: string): void {
    if (this.closed || this.busy) return;
    if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) { this.dispose(); this.done(); return; }
    if (matchesKey(data, Key.ctrl("f")) || (!this.editing && matchesKey(data, "/"))) {
      this.input.setValue(""); this.edit(true); return;
    }
    if (this.editing) {
      if (getKeybindings().matches(data, "tui.select.confirm")) void this.search(this.input.getValue());
      else if (matchesKey(data, Key.tab) && this.skills.length) this.edit(false);
      else { this.input.handleInput(data); this.requestRender(); }
      return;
    }
    if (getKeybindings().matches(data, "tui.select.up")) this.select(this.skills.length ? (this.selected + this.skills.length - 1) % this.skills.length : 0);
    else if (getKeybindings().matches(data, "tui.select.down")) this.select(this.skills.length ? (this.selected + 1) % this.skills.length : 0);
    else if (matchesKey(data, "b")) void this.action("browser");
    else if (matchesKey(data, "p")) void this.action("project");
    else if (matchesKey(data, "g")) void this.action("global");
    else if (matchesKey(data, Key.shift("u"))) void this.action("uninstall-global");
    else if (matchesKey(data, "u")) void this.action("uninstall-project");
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (this.busy || this.searching || this.closed) return;
    if (event.type === "wheel") {
      if (this.skills.length) this.select(Math.max(0, Math.min(this.skills.length - 1, this.selected + (event.wheelDelta ?? 0))));
      return { handled: true };
    }
    const index = this.visibleStart + event.y - this.listStart;
    if (event.y >= this.listStart && event.y < this.listStart + this.listHeight && index < this.skills.length && ["move", "click", "press"].includes(event.type)) {
      this.edit(false); this.select(index); return { handled: true };
    }
  }

  invalidate(): void { this.input.invalidate(); }
  dispose(): void { this.closed = true; this.searchRequest?.abort(); this.detailRequest?.abort(); }

  render(width: number): string[] {
    const height = Math.max(1, this.terminalRows());
    width = Math.max(1, width);
    const { theme } = this;
    const pad = (text: string, size: number) => {
      const value = truncateToWidth(text, Math.max(1, size));
      return value + " ".repeat(Math.max(0, size - visibleWidth(value)));
    };
    const columns = width >= 85;
    const footer = [
      ...wrapTextWithAnsi("↑/↓ move · Ctrl+F or / search again · b browser", width),
      ...wrapTextWithAnsi(this.busy ? "Wait for the current action to finish." : "p install project · g install global · u uninstall project · U uninstall global · Esc close", width),
    ];
    const previewLines = Math.max(1, Math.min(3, height - 12 - footer.length));
    const nameWidth = Math.floor(width * 0.35);
    const sourceWidth = width - nameWidth - 27;
    const row = (name: string, source: string, installs: string, updated: string) => columns
      ? `${pad(name, nameWidth)} ${pad(source, sourceWidth)} ${pad(installs, 10)} ${pad(updated, 12)}`
      : `${name}  ${source}`;
    const lines = [
      theme.fg("accent", theme.bold("Find skills")) + theme.fg("muted", "  skills.sh"),
      theme.fg("muted", this.editing ? "Enter searches. Tab returns to existing results." : `Results for ${plain(this.query)}. Ctrl+F starts another search.`),
      ...this.input.render(width),
      "",
      theme.fg("muted", row("  Skill", "Repository", "Installs", "Last updated")),
    ];
    this.listStart = lines.length;
    this.listHeight = Math.max(1, height - 10 - previewLines - footer.length);
    this.visibleStart = Math.max(0, Math.min(this.visibleStart, this.skills.length - this.listHeight));
    if (this.selected < this.visibleStart) this.visibleStart = this.selected;
    if (this.selected >= this.visibleStart + this.listHeight) this.visibleStart = this.selected - this.listHeight + 1;
    for (let i = 0; i < this.listHeight; i++) {
      const index = this.visibleStart + i;
      const skill = this.skills[index];
      if (!skill) { lines.push(i === 0 ? theme.fg("muted", this.searching ? "  Searching..." : "  No results.") : ""); continue; }
      const selected = index === this.selected;
      const date = skill.updatedAt ? skill.updatedAt.slice(0, 10) : !this.detailed.has(skill.id) ? "Loading..." : "Unknown";
      const installed = this.installed.has(`${skill.id}:project`) || this.installed.has(`${skill.id}:global`);
      const text = row(`${selected ? ">" : " "} ${plain(skill.name)}${installed ? " [installed]" : ""}`, skill.source, skill.installs.toLocaleString(), date);
      lines.push(selected ? theme.fg("accent", text) : text);
    }
    const skill = this.skills[this.selected];
    const loadingDetails = !!skill && !this.detailed.has(skill.id);
    lines.push(theme.fg("border", "─".repeat(width)));
    lines.push(skill ? theme.fg("accent", theme.bold(plain(skill.name))) : "");
    lines.push(skill ? theme.fg("muted", `${skill.source} · ${skill.installs.toLocaleString()} installs · Last updated ${skill.updatedAt ? skill.updatedAt.slice(0, 10) + ` via ${skill.updatedAtSource ?? "source"}` : loadingDetails ? "loading..." : "unknown"}`) : "");
    const description = skill?.description ?? (loadingDetails ? "Loading description..." : skill ? "No description provided." : "Highlight a result to read its description.");
    const wrapped = wrapTextWithAnsi(plain(description), width);
    for (let i = 0; i < previewLines; i++) lines.push(wrapped[i] ?? "");
    lines.push(skill ? theme.fg("muted", skillUrl(skill)) : "");
    lines.push(theme.fg(this.error ? "error" : "muted", this.status));
    lines.push(...footer.map((line) => theme.fg("dim", line)));
    while (lines.length < height) lines.push("");
    return lines.slice(0, height).map((line) => pad(line, width));
  }
}
