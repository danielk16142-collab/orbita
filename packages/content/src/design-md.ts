/**
 * A carousel as a Markdown brief for a design agent (or any other design tool): the specs, the brand, then each slide with
 * its exact text and visual direction. Headings are in English so any agent can follow them; the post's own text stays in
 * the post's language.
 */
export type DesignBrand = {
  name: string;
  primary?: string | null; accent?: string | null;
  palette?: { name?: string | null; hex: string; role?: string | null }[];
  headingFont?: string | null; bodyFont?: string | null;
};
export type DesignMeta = { title: string; network: string; language: string; date: string | null; caption: string | null; hashtags: string[] };
type Carousel = { slides: { title: string; body: string; visual: string }[]; cta: string };

const LANGUAGE: Record<string, string> = { en: "English", fr: "French", es: "Spanish" };
/** Slide size per network: TikTok photo posts are vertical 9:16, the others 4:5 portrait. */
export function slideSize(network: string): string {
  return /tiktok/i.test(network) ? "1080 × 1920 px (9:16, vertical)" : "1080 × 1350 px (4:5, portrait)";
}
/** One line of text from the post: line breaks kept for paragraphs, nothing that would start a new Markdown heading. */
const text = (s: string | null | undefined) => (s ?? "").replace(/\r\n?/g, "\n").replace(/^(\s*)#/gm, "$1\\#").trim();
const HEX = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i;

export function carouselMarkdown(content: unknown, m: DesignMeta, brand?: DesignBrand | null): string {
  const c = content as Carousel;
  const slides = Array.isArray(c?.slides) ? c.slides : [];
  const n = slides.length;
  const lang = LANGUAGE[m.language] ?? m.language.toUpperCase();
  const out: string[] = [
    `# Carousel: ${text(m.title).replace(/\n+/g, " ")}`, "",
    `> Design brief. Make each slide as its own image, in order. Use the slide text exactly as written: do not rewrite, translate, shorten or add claims, numbers or logos that are not here.`, "",
    "## Specs", "",
    ...(brand?.name ? [`- Brand: ${text(brand.name)}`] : []),
    `- Network: ${m.network}`,
    `- Language: ${lang} (all text on the slides stays in ${lang})`,
    `- Slides: ${n}`,
    `- Size: ${slideSize(m.network)}, one image per slide`,
    ...(m.date ? [`- Planned for: ${m.date}`] : []),
    "- Keep the text large and readable on a phone, with clear margins; the same layout family on every slide so they read as one set.",
  ];
  if (brand) {
    const colours = [
      ...(brand.primary && HEX.test(brand.primary) ? [`Primary: ${brand.primary}`] : []),
      ...(brand.accent && HEX.test(brand.accent) ? [`Accent: ${brand.accent}`] : []),
      ...(brand.palette ?? []).filter((p) => HEX.test(p.hex)).map((p) => `${[p.name, p.role && p.role !== p.name ? `(${p.role})` : ""].filter(Boolean).join(" ") || "Colour"}: ${p.hex}`),
    ].filter((x, i, a) => a.indexOf(x) === i);
    const fonts = [brand.headingFont && `Heading font: ${text(brand.headingFont)}`, brand.bodyFont && `Body font: ${text(brand.bodyFont)}`].filter(Boolean) as string[];
    if (colours.length || fonts.length) {
      out.push("", "## Brand", "");
      if (colours.length) out.push(`- Colours: ${colours.join(", ")}`);
      fonts.forEach((f) => out.push(`- ${f}`));
    }
  }
  out.push("", "## Slides");
  slides.forEach((s, i) => {
    const role = i === 0 ? " (cover: it must make people swipe)" : i === n - 1 ? " (last slide)" : "";
    out.push("", `### Slide ${i + 1} of ${n}${role}`, "", `**Headline:** ${text(s.title)}`);
    if (text(s.body)) out.push("", `**Text:**`, "", text(s.body));
    if (text(s.visual)) out.push("", `**Visual:** ${text(s.visual)}`);
  });
  if (text(c?.cta)) out.push("", "## Call to action", "", `${text(c.cta)}`, "", "Show it on the last slide if that slide does not already say it.");
  if (text(m.caption) || m.hashtags.length) {
    out.push("", "## Post caption (goes with the post, not on the slides)", "");
    if (text(m.caption)) out.push(text(m.caption));
    if (m.hashtags.length) out.push("", m.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" "));
  }
  return out.join("\n") + "\n";
}
