import type { Memory, MemoryKind } from "./types";

/** The most relevant active memories within a character budget: heavier first, then most recent. */
export function selectMemories(memories: Memory[], opts: { max?: number; maxChars?: number } = {}): Memory[] {
  const max = opts.max ?? 30, maxChars = opts.maxChars ?? 4000;
  const sorted = [...memories].sort((a, b) => b.weight - a.weight || b.createdAt.localeCompare(a.createdAt));
  const out: Memory[] = [];
  let used = 0;
  for (const m of sorted) {
    if (out.length >= max || used + m.content.length > maxChars) continue;
    out.push(m); used += m.content.length;
  }
  return out;
}

export function groupMemories(memories: Memory[]): Record<MemoryKind, string[]> {
  const g: Record<MemoryKind, string[]> = { preference: [], rule: [], fact: [], example: [], avoid: [] };
  for (const m of memories) g[m.kind].push(m.content);
  return g;
}
