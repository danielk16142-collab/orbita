import { describe, expect, it } from "vitest";
import { carouselMarkdown, slideSize } from "./design-md";

const content = { slides: [
  { title: "3 señales de que tu web pierde clientes", body: "Si tarda más de 3 segundos,\nla gente se va.", visual: "Phone with a loading spinner" },
  { title: "# No dice qué haces", body: "", visual: "" },
  { title: "Reserva tu auditoría", body: "Link en la bio", visual: "Logo on brand orange" },
], cta: "Escríbenos AUDITORÍA" };
const meta = { title: "Señales de una web lenta", network: "Instagram", language: "es", date: "2026-12-01", caption: "¿Tu web hace esto?", hashtags: ["diseñoweb", "#montreal"] };

describe("carousel markdown for a design agent", () => {
  it("lists specs, brand, every slide in order, the call to action and the caption", () => {
    const md = carouselMarkdown(content, meta, { name: "Dany Designs", primary: "#ff4e1b", accent: "#111111", palette: [{ name: "Cream", hex: "#f4efe6", role: "background" }, { name: "Bad", hex: "red" }], headingFont: "Originals", bodyFont: "Inter" });
    expect(md).toContain("# Carousel: Señales de una web lenta");
    expect(md).toContain("- Language: Spanish (all text on the slides stays in Spanish)");
    expect(md).toContain("- Size: 1080 × 1350 px (4:5, portrait)");
    expect(md).toContain("- Colours: Primary: #ff4e1b, Accent: #111111, Cream (background): #f4efe6");
    expect(md).not.toContain("Bad");
    expect(md).toContain("- Heading font: Originals");
    expect(md).toContain("### Slide 1 of 3 (cover: it must make people swipe)");
    expect(md).toContain("Si tarda más de 3 segundos,\nla gente se va.");
    expect(md).toContain("**Headline:** \\# No dice qué haces"); // a slide cannot start a new heading
    expect(md.indexOf("Slide 2 of 3")).toBeLessThan(md.indexOf("Slide 3 of 3 (last slide)"));
    expect(md).toContain("## Call to action\n\nEscríbenos AUDITORÍA");
    expect(md).toContain("#diseñoweb #montreal");
  });
  it("leaves out the brand section when nothing is saved, and sizes TikTok slides vertically", () => {
    const md = carouselMarkdown(content, { ...meta, network: "TikTok", caption: null, hashtags: [] }, null);
    expect(md).not.toContain("## Brand");
    expect(md).not.toContain("## Post caption");
    expect(slideSize("TikTok")).toContain("9:16");
  });
});
