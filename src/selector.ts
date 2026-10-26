import type { Theme } from "@earendil-works/pi-coding-agent";
import { fuzzyFilter, getKeybindings, Input, Key, matchesKey, truncateToWidth, type Component, type Focusable } from "@earendil-works/pi-tui";
import { plain } from "./catalog.ts";
import { canToggle, entryDirectory, isEnabled, type SkillChange, type SkillEntry } from "./discovery.ts";

const filters = ["All", "Active", "Inactive", "Changed"] as const;
type Filter = typeof filters[number];

export class SkillSelector implements Component, Focusable {
  private readonly search = new Input({ prompt: "Search: ", placeholder: "Filter by name, description, or directory" });
  private readonly pending = new Map<SkillEntry, boolean>();
  private filter: Filter = "All";
  private selected = 0;
  private notice = "";

  constructor(
    private readonly entries: SkillEntry[],
    private readonly theme: Theme,
    private readonly done: (changes: SkillChange[] | undefined) => void,
    private readonly requestRender: () => void,
    private readonly terminalRows: () => number = () => 24,
  ) {}

  get focused(): boolean { return this.search.focused; }
  set focused(value: boolean) { this.search.focused = value; }

  private enabled(entry: SkillEntry): boolean {
    return this.pending.get(entry) ?? isEnabled(entry);
  }

  private visible(): SkillEntry[] {
    const entries = this.entries.filter((entry) =>
      this.filter === "All" ||
      (this.filter === "Active" && this.enabled(entry)) ||
      (this.filter === "Inactive" && !this.enabled(entry)) ||
      (this.filter === "Changed" && this.pending.has(entry)),
    );
    const query = this.search.getValue();
    return query ? fuzzyFilter(entries, query, ({ skill }) => `${plain(skill.name)} ${plain(skill.description)} ${plain(skill.filePath)}`) : entries;
  }

  private stage(entry: SkillEntry, enabled: boolean): void {
    if (!canToggle(entry)) {
      this.notice = "This skill is controlled by the CLI or another extension.";
      return;
    }
    if (enabled === isEnabled(entry)) this.pending.delete(entry);
    else this.pending.set(entry, enabled);
  }

  handleInput(data: string): void {
    const kb = getKeybindings();
    const visible = this.visible();
    const previous = visible[this.selected];
    this.notice = "";
    if (matchesKey(data, Key.ctrl("s"))) {
      this.done([...this.pending].map(([entry, enabled]) => ({ entry, enabled })));
      return;
    }
    if (matchesKey(data, Key.escape)) { this.done(undefined); return; }
    if (matchesKey(data, Key.ctrl("c"))) {
      if (this.search.getValue()) { this.search.setValue(""); this.selected = 0; }
      else { this.done(undefined); return; }
    } else if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) {
      const delta = matchesKey(data, Key.shift("tab")) ? -1 : 1;
      this.filter = filters[(filters.indexOf(this.filter) + delta + filters.length) % filters.length];
      this.selected = 0;
    } else if (kb.matches(data, "tui.select.up")) {
      this.selected = visible.length ? (this.selected + visible.length - 1) % visible.length : 0;
    } else if (kb.matches(data, "tui.select.down")) {
      this.selected = visible.length ? (this.selected + 1) % visible.length : 0;
    } else if (kb.matches(data, "tui.select.confirm")) {
      if (previous) this.stage(previous, !this.enabled(previous));
    } else if (matchesKey(data, Key.ctrl("a")) || matchesKey(data, Key.ctrl("d"))) {
      const enabled = matchesKey(data, Key.ctrl("a"));
      for (const entry of visible) if (canToggle(entry)) this.stage(entry, enabled);
    } else {
      this.search.handleInput(data);
      this.selected = 0;
    }
    const next = this.visible();
    const index = previous ? next.indexOf(previous) : -1;
    // Keep the current skill selected when toggles change a filtered list.
    if (index >= 0 && (kb.matches(data, "tui.select.confirm") || matchesKey(data, Key.ctrl("a")) || matchesKey(data, Key.ctrl("d")))) this.selected = index;
    this.selected = Math.min(this.selected, Math.max(0, next.length - 1));
    this.requestRender();
  }

  invalidate(): void { this.search.invalidate(); }

  render(width: number): string[] {
    const { theme } = this;
    const visible = this.visible();
    const maxVisible = Math.max(1, Math.min(8, Math.floor((this.terminalRows() - 15) / 2)));
    const start = Math.max(0, Math.min(this.selected - Math.floor(maxVisible / 2), visible.length - maxVisible));
    const rows = [
      theme.fg("border", "─".repeat(Math.max(0, width))),
      theme.fg("accent", theme.bold("Skills")),
      theme.fg("muted", "Changes apply only when you press Ctrl+S. Esc discards them."),
      filters.map((filter) => filter === this.filter ? theme.fg("accent", `[${filter}]`) : theme.fg("muted", filter)).join("  "),
      "",
      ...this.search.render(width),
      "",
    ];
    if (!visible.length) rows.push(theme.fg("muted", this.entries.length ? "No matching skills." : "No skills found."));
    for (let i = start; i < Math.min(start + maxVisible, visible.length); i++) {
      const entry = visible[i];
      const selected = i === this.selected;
      const checked = this.enabled(entry);
      const changed = this.pending.has(entry);
      const tags = [
        entry.resource?.metadata.scope ?? "external",
        ...(!canToggle(entry) ? ["read-only"] : []),
        ...(checked && !entry.active && !changed ? ["not loaded"] : []),
        ...(changed ? ["changed"] : []),
      ];
      const label = `${selected ? ">" : " "} [${checked ? "x" : " "}] ${plain(entry.skill.name)}`;
      rows.push((selected ? theme.fg("accent", label) : label) + theme.fg("muted", `  ${tags.join(" · ")}`));
      rows.push(theme.fg("muted", `      ${plain(entryDirectory(entry))}`));
    }
    rows.push("", theme.fg("muted", `${visible.length ? this.selected + 1 : 0}/${visible.length} shown · ${this.entries.filter((entry) => this.enabled(entry)).length}/${this.entries.length} active`));
    const selected = visible[this.selected];
    if (selected) rows.push(theme.fg("muted", plain(selected.skill.description)));
    rows.push(
      this.pending.size ? theme.fg("warning", `${this.pending.size} unsaved change${this.pending.size === 1 ? "" : "s"}`) : theme.fg("muted", "No unsaved changes"),
      theme.fg("dim", "↑/↓ move · Enter toggle · Tab filter · type to search"),
      theme.fg("dim", "Ctrl+A enable shown · Ctrl+D disable shown · Ctrl+S save · Esc cancel"),
    );
    if (this.notice) rows.push(theme.fg("warning", this.notice));
    rows.push(theme.fg("border", "─".repeat(Math.max(0, width))));
    return rows.map((row) => truncateToWidth(row, Math.max(1, width)));
  }
}
