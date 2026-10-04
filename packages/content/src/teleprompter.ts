import type { ReelContentT } from "./schemas";

export type PromptLine = { kind: "hook" | "scene" | "cta"; cue: string; text: string };

/**
 * The words to read, in order: the chosen hook, each scene's voiceover (with its timing and visual as a quiet cue), then the call
 * to action. Scenes with no voiceover are skipped: nothing to say there. On-screen text is a cue, not spoken.
 */
export function buildScript(c: ReelContentT, hookIndex = 0): PromptLine[] {
  const hook = c.hook_options[Math.min(Math.max(hookIndex, 0), c.hook_options.length - 1)];
  const lines: PromptLine[] = [{ kind: "hook", cue: "", text: hook }];
  for (const s of c.scenes) if (s.voiceover.trim()) lines.push({ kind: "scene", cue: [s.seconds, s.on_screen_text && `on screen: ${s.on_screen_text}`].filter(Boolean).join(" · "), text: s.voiceover.trim() });
  lines.push({ kind: "cta", cue: "", text: c.cta });
  return lines;
}

export const wordCount = (lines: PromptLine[]) => lines.reduce((n, l) => n + (l.text.trim() ? l.text.trim().split(/\s+/).length : 0), 0);
/** Reading time in seconds at a speaking pace (default 150 words per minute). */
export const readingSeconds = (lines: PromptLine[], wpm = 150) => Math.round((wordCount(lines) / wpm) * 60);
