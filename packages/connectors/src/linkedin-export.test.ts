import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { cellDate, parseLinkedInExport, readXlsx } from "./linkedin-export";

/** A tiny workbook in the shape LinkedIn exports, built in memory. */
function xlsx(sheets: Record<string, (string | number)[][]>) {
  const shared: string[] = [];
  const s = (v: string) => { let i = shared.indexOf(v); if (i < 0) { shared.push(v); i = shared.length - 1; } return i; };
  const col = (i: number) => String.fromCharCode(65 + i);
  const files: Record<string, Uint8Array> = {};
  const names = Object.keys(sheets);
  names.forEach((name, n) => {
    const rows = sheets[name].map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => v === "" ? "" : typeof v === "number" ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="s"><v>${s(v)}</v></c>`).join("")}</row>`).join("");
    files[`xl/worksheets/sheet${n + 1}.xml`] = strToU8(`<worksheet><sheetData>${rows}</sheetData></worksheet>`);
  });
  files["xl/workbook.xml"] = strToU8(`<workbook xmlns:r="r"><sheets>${names.map((nm, n) => `<sheet name="${nm}" sheetId="${n + 1}" r:id="rId${n + 1}"/>`).join("")}</sheets></workbook>`);
  files["xl/_rels/workbook.xml.rels"] = strToU8(`<Relationships>${names.map((_, n) => `<Relationship Id="rId${n + 1}" Type="x" Target="worksheets/sheet${n + 1}.xml"/>`).join("")}</Relationships>`);
  files["xl/sharedStrings.xml"] = strToU8(`<sst>${shared.map((v) => `<si><t>${v.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></si>`).join("")}</sst>`);
  return zipSync(files);
}

describe("LinkedIn analytics export", () => {
  const file = xlsx({
    DISCOVERY: [["Overall Performance", "10/9/2026 - 11/7/2026"], ["Impressions", "12,400"], ["Members reached", 5100]],
    ENGAGEMENT: [["Date", "Impressions", "Engagements"], ["11/2/2026", 1000, 40], ["11/3/2026", 2000, 60], ["11/9/2026", 500, 10]],
    "TOP POSTS": [["Maximum of 50 posts available to include in this list"], ["Post URL", "Post publish date", "Engagements", "", "Post URL", "Post publish date", "Impressions"],
      ["https://www.linkedin.com/feed/update/urn:li:activity:1?utm=x", "11/3/2026", 55, "", "https://www.linkedin.com/feed/update/urn:li:activity:1", "11/3/2026", 4200],
      ["https://evil.example.com/x", "11/4/2026", 9, "", "https://www.linkedin.com/feed/update/urn:li:activity:2", "11/5/2026", 900]],
    FOLLOWERS: [["Total followers on 11/7/2026:", 812], [], ["Date", "New followers"], ["11/2/2026", 3], ["11/9/2026", 5]],
    DEMOGRAPHICS: [["Top Demographics", "Value", "Percentage"], ["Job titles", "Founder", "12%"], ["Locations", "Montreal", 0.31]],
  });

  it("reads the sheets of an xlsx file", () => {
    const sheets = readXlsx(file);
    expect(sheets.map((s) => s.name)).toEqual(["DISCOVERY", "ENGAGEMENT", "TOP POSTS", "FOLLOWERS", "DEMOGRAPHICS"]);
    expect(sheets[0].rows[1]).toEqual(["Impressions", "12,400"]);
  });
  it("finds the numbers LinkedIn gives", () => {
    const s = parseLinkedInExport(readXlsx(file));
    expect(s.period).toEqual({ from: "2026-10-09", to: "2026-11-07" });
    expect(s).toMatchObject({ impressions: 12400, membersReached: 5100, engagements: 110, followers: 812, newFollowers: 8 });
    expect(s.engagementRate).toBeCloseTo(110 / 12400, 4);
    expect(s.weeks.map((w) => [w.start, w.impressions, w.newFollowers])).toEqual([["2026-11-02", 3000, 3], ["2026-11-09", 500, 5]]);
    expect(s.topPosts[0]).toMatchObject({ url: "https://www.linkedin.com/feed/update/urn:li:activity:1", impressions: 4200, engagements: 55 });
    expect(s.topPosts.some((p) => p.url.includes("evil"))).toBe(false);
    expect(s.demographics).toEqual([{ category: "Job titles", value: "Founder", share: 0.12 }, { category: "Locations", value: "Montreal", share: 0.31 }]);
    expect(s.found).toEqual(["discovery", "engagement", "top_posts", "followers", "demographics"]);
  });
  it("reads dates and refuses what is not a workbook", () => {
    expect(cellDate("46000")).toBe("2025-12-09");
    expect(cellDate("3/7/2026")).toBe("2026-03-07");
    expect(() => readXlsx(new Uint8Array([1, 2, 3]))).toThrow("not_xlsx");
  });
});
