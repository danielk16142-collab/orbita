/**
 * Anything that did not come from the signed-in user or from us (fetched web pages, pasted
 * third-party text) is wrapped so the model can tell data from instructions. The wrapper
 * tag itself is neutralized inside the content so a page can't close it early.
 */
export function wrapUntrusted(source: string, text: string, maxChars = 12000): string {
  const clean = text.replace(/<\s*\/?\s*untrusted/gi, "[untrusted").slice(0, maxChars);
  const safeSource = source.replace(/[^\w.:/#?=&%@+\-]/g, "").slice(0, 200);
  return `<untrusted source="${safeSource}">\n${clean}\n</untrusted>`;
}
