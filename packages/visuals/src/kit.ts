import { CarouselContent, ReelContent, StaticContent } from "@orbita/content";
import { brandSummary, clean, type BrandInfo } from "./prompt";

/**
 * Prompts and briefs to make a post's images and videos OUTSIDE Orbita (Midjourney, ChatGPT/gpt-image, a video tool, or
 * Canva/Figma). Built instantly from the post and the brand: nothing is sent anywhere. Post text is quoted as content.
 */
export type KitTool = "midjourney" | "gpt-image" | "video" | "layout";
export const KIT_TOOLS: KitTool[] = ["midjourney", "gpt-image", "video", "layout"];
export type KitBlock = { id: string; title: string; text: string };
export type PromptKit = Record<KitTool, KitBlock[]>;
export type KitReference = { kind: string; caption: string | null };
export type KitPost = { type: string; content: unknown };
export type KitResult = { ok: true; kit: PromptKit } | { ok: false; error: "unsupported" | "no_content" | "invalid_content" };

const LANG = { en: "English", fr: "French", es: "Spanish" } as const;
const NO_EXTRAS = "No logos, no watermarks, no extra text, no invented claims, numbers or prices.";

/** "0-3s" -> 3, "3-8s" -> 5, "5s" -> 5. Unknown labels get 5. Always between 2 and 10 seconds (what video tools accept per clip). */
export function sceneSeconds(label: string): number {
  const m = /^\s*(\d{1,3}(?:\.\d+)?)\s*(?:-|–|to)\s*(\d{1,3}(?:\.\d+)?)\s*s?/i.exec(label);
  const n = m ? Number(m[2]) - Number(m[1]) : Number(/^\s*(\d{1,3}(?:\.\d+)?)\s*s?\s*$/i.exec(label)?.[1] ?? NaN);
  return Math.min(10, Math.max(2, Math.round(Number.isFinite(n) && n > 0 ? n : 5)));
}

function notes(refs: KitReference[], extra: string) {
  const line = (r: KitReference) => `${clean(r.caption, 200)}`.trim();
  const style = refs.filter((r) => r.kind !== "avoid" && r.caption).slice(0, 6).map((r) => `${r.kind}: ${line(r)}`);
  const avoid = refs.filter((r) => r.kind === "avoid" && r.caption).slice(0, 6).map(line);
  const e = clean(extra, 600);
  return {
    style: [...style, ...(e ? [`this post: ${e}`] : [])].join("; "),
    avoid: avoid.join("; "),
  };
}

/** Build the kit. Supported: carousels, static posts and reels. */
export function buildPromptKit(post: KitPost, brand: BrandInfo, refs: KitReference[] = [], extraNotes = ""): KitResult {
  if (!["carousel", "static", "reel"].includes(post.type)) return { ok: false, error: "unsupported" };
  if (post.content == null) return { ok: false, error: "no_content" };
  const { colors, fonts } = brandSummary(brand);
  const n = notes(refs, extraNotes);
  const palette = colors.length ? `Palette: ${colors.join(", ")}.` : "";
  const lang = LANG[brand.language];
  const styleLine = n.style ? `Reference notes: ${n.style}.` : "";
  const avoidLine = n.avoid ? `Avoid: ${n.avoid}.` : "";
  const attach = "Attach your reference image(s) to the tool.";
  const kit: PromptKit = { midjourney: [], "gpt-image": [], video: [], layout: [] };
  const push = (tool: KitTool, id: string, title: string, parts: (string | false | undefined)[]) => kit[tool].push({ id, title, text: parts.filter(Boolean).join("\n") });

  if (post.type === "static") {
    const c = StaticContent.safeParse(post.content);
    if (!c.success) return { ok: false, error: "invalid_content" };
    const { headline, visual_brief: vb, cta } = c.data;
    push("midjourney", "static", "Image", [
      `${clean(vb, 400)}, premium social media photograph, clean composition with empty space for the headline, soft natural light, brand colors ${colors.slice(0, 3).join(", ") || "of the brand"} --ar 4:5${n.avoid ? ` --no ${n.avoid.replace(/[;,]/g, " ").slice(0, 120)}` : ""}`,
      `Notes: add your reference with --sref [image URL or code]. Put the headline "${clean(headline, 160)}" on in Canva/Figma afterwards; image models rarely spell text correctly.`,
    ]);
    push("gpt-image", "static", "Image", [
      `Create a portrait 4:5 Instagram image for ${clean(brand.name, 80)}. Use the attached reference image for style, composition, lighting and mood. Scene: ${clean(vb, 500)}.`,
      `Text on the image, written in ${lang} exactly as given: headline "${clean(headline, 160)}"; small call to action "${clean(cta, 120)}". ${palette} ${fonts ? `Fonts: ${fonts}.` : ""} ${styleLine} ${avoidLine}`.replace(/\s+/g, " ").trim(),
      NO_EXTRAS, attach,
    ]);
    push("video", "animate", "Animate the finished image (optional)", [
      `Vertical 9:16 loop of 5 seconds from the attached image: slow push-in, subtle natural motion, the layout and any text stay stable and sharp. ${styleLine}`.trim(), NO_EXTRAS,
    ]);
    push("layout", "static", "Layout brief", [
      "Canvas 1080x1350 px (4:5), 80 px safe margins.", `Headline (largest, 1-3 lines): "${clean(headline, 160)}".`, `Call to action (small, bottom): "${clean(cta, 120)}".`,
      `Image direction: ${clean(vb, 500)}.`, palette, fonts && `Fonts: ${fonts}.`, styleLine, avoidLine, `Text language: ${lang}.`,
    ]);
  } else if (post.type === "carousel") {
    const c = CarouselContent.safeParse(post.content);
    if (!c.success) return { ok: false, error: "invalid_content" };
    const total = c.data.slides.length;
    const anchor = `Consistent visual system across all ${total} slides: same lighting, color grading, composition grid and mood. ${palette} ${styleLine} ${avoidLine}`.replace(/\s+/g, " ").trim();
    push("midjourney", "style", "Style anchor (reuse in every slide)", [anchor, "Notes: add your reference with --sref [image URL or code] to every slide so they match."]);
    push("gpt-image", "style", "Style anchor (paste first)", [`We will make ${total} portrait 4:5 Instagram slides for ${clean(brand.name, 80)}. Use the attached reference image for style, composition, lighting and mood. ${anchor}`, NO_EXTRAS, attach]);
    push("layout", "style", "Carousel rules", [`${total} slides, canvas 1080x1350 px (4:5), 80 px safe margins. Same grid, fonts and colors on every slide. Slide 1 is the hook, slide ${total} is the call to action: "${clean(c.data.cta, 200)}".`, palette, fonts && `Fonts: ${fonts}.`, `Text language: ${lang}.`]);
    c.data.slides.forEach((s, i) => {
      const k = i + 1, label = `Slide ${k} of ${total}`;
      push("midjourney", `s${k}`, label, [`${clean(s.visual, 300)}, ${clean(s.title, 100)}, clean composition with empty space for text, soft natural light, consistent style --ar 4:5${n.avoid ? ` --no ${n.avoid.replace(/[;,]/g, " ").slice(0, 120)}` : ""}`]);
      push("gpt-image", `s${k}`, label, [`Slide ${k} of ${total}, portrait 4:5, same visual system as the previous slides. Scene: ${clean(s.visual, 300)}.`, `Text on the image, written in ${lang} exactly as given: title "${clean(s.title, 120)}"${s.body ? `; text "${clean(s.body, 300)}"` : ""}.`, NO_EXTRAS]);
      push("layout", `s${k}`, label, [`Title: "${clean(s.title, 120)}"`, s.body && `Text: "${clean(s.body, 300)}"`, `Image direction: ${clean(s.visual, 300)}.`, k === total ? `Call to action: "${clean(c.data.cta, 200)}"` : k === 1 ? "Hook slide: the title is the biggest element." : "Keep the hierarchy: title first, then text."]);
    });
    push("video", "animate", "Animate a slide (optional)", [`Vertical 9:16 loop of 5 seconds from the attached slide: slow push-in, subtle motion, text stays stable and sharp. ${styleLine}`.trim(), NO_EXTRAS]);
  } else {
    const c = ReelContent.safeParse(post.content);
    if (!c.success) return { ok: false, error: "invalid_content" };
    const total = c.data.scenes.length;
    const master = `Vertical 9:16 video for ${clean(brand.name, 80)}, ${palette} Consistent look across every clip: same lighting, color grading, camera language and subject. ${styleLine} ${avoidLine}`.replace(/\s+/g, " ").trim();
    push("video", "master", "Master style (paste into every clip)", [master, "Notes: start every clip from your reference image (image-to-video) so the subject and look stay the same."]);
    c.data.scenes.forEach((s, i) => {
      const k = i + 1;
      push("video", `c${k}`, `Clip ${k} of ${total} (${sceneSeconds(s.seconds)} s)`, [
        `${sceneSeconds(s.seconds)} seconds, vertical 9:16. ${clean(s.visual, 300)}. Natural camera movement, realistic motion, shallow depth of field.`,
        NO_EXTRAS,
      ]);
    });
    push("video", "edit", "For the edit (add after, not in the clips)", [
      `Hook options: ${c.data.hook_options.map((h) => `"${clean(h, 200)}"`).join(" / ")}`,
      ...c.data.scenes.map((s, i) => `Scene ${i + 1} (${clean(s.seconds, 20)}): voiceover "${clean(s.voiceover, 400)}"${s.on_screen_text ? `; on-screen text "${clean(s.on_screen_text, 160)}"` : ""}`),
      `Call to action: "${clean(c.data.cta, 200)}"`, c.data.audio_note && `Audio: ${clean(c.data.audio_note, 200)}`,
    ]);
    const cover = `${clean(c.data.scenes[0].visual, 300)}, cover frame with empty space for the title, soft natural light`;
    push("midjourney", "cover", "Cover image", [`${cover}, brand colors ${colors.slice(0, 3).join(", ") || "of the brand"} --ar 9:16`, "Notes: add your reference with --sref [image URL or code]. Add the title in Canva/Figma."]);
    push("gpt-image", "cover", "Cover image", [`Create a vertical 9:16 cover image for a reel by ${clean(brand.name, 80)}. Use the attached reference image for style, lighting and mood. Scene: ${clean(c.data.scenes[0].visual, 300)}. Text on the image, written in ${lang} exactly as given: "${clean(c.data.hook_options[0], 160)}".`, NO_EXTRAS, attach]);
    push("layout", "cover", "Cover frame", ["Canvas 1080x1920 px (9:16), keep titles inside the middle safe area (no text in the top 250 px or bottom 400 px).", `Title: "${clean(c.data.hook_options[0], 160)}"`, palette, fonts && `Fonts: ${fonts}.`, `Text language: ${lang}.`]);
    push("layout", "timeline", "On-screen text timeline", c.data.scenes.map((s, i) => `${clean(s.seconds, 20)}: ${s.on_screen_text ? `"${clean(s.on_screen_text, 160)}"` : "(no text)"}`).concat([`End card: "${clean(c.data.cta, 200)}"`]));
  }
  return { ok: true, kit };
}

/** Plain text of every block of one tool, for "Copy all". */
export const kitText = (blocks: KitBlock[]) => blocks.map((b) => `# ${b.title}\n${b.text}`).join("\n\n");
