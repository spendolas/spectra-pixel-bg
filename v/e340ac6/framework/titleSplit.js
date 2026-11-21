// Shared title split (Hero + Yard): measures the rendered title with
// Range.getBoundingClientRect() to group words into visual lines, then wraps
// each grapheme in .char spans inside .line > .line-inner. Returns the
// .line-inner elements (one per visual line). See DESIGN.md §5/§7.

// Grapheme-aware iteration (emoji, combining marks); falls back to code points.
const segmenter =
  typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
const graphemes = (str) => (segmenter ? Array.from(segmenter.segment(str), (g) => g.segment) : Array.from(str));

export function splitTitleIntoLines(title) {
  if (!title) return [];
  const text = title.dataset.text || title.textContent;
  title.dataset.text = text;

  title.textContent = text;
  const textNode = title.firstChild;
  const words = text.split(/\s+/).filter(Boolean);
  const groups = [];
  let currentTop = null;
  let currentGroup = [];
  let cursor = 0;

  words.forEach((word) => {
    const start = text.indexOf(word, cursor);
    const end = start + word.length;
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const top = range.getBoundingClientRect().top;
    if (currentTop === null) currentTop = top;
    if (Math.abs(top - currentTop) > 1) {
      groups.push(currentGroup);
      currentGroup = [];
      currentTop = top;
    }
    currentGroup.push(word);
    cursor = end;
  });
  if (currentGroup.length) groups.push(currentGroup);

  title.textContent = "";
  // A11y: one accessible name for the heading; the per-char wrappers are decorative.
  title.setAttribute("aria-label", text.replace(/\s+/g, " ").trim());
  title.setAttribute("translate", "no"); // split spans must not be mangled by auto-translate
  const lineEls = [];
  let charIndex = 0;
  groups.forEach((wordsInLine, lineIdx) => {
    const line = document.createElement("span");
    line.className = "line";
    line.setAttribute("aria-hidden", "true");
    line.style.setProperty("--line", lineIdx);
    const inner = document.createElement("span");
    inner.className = "line-inner";
    const lineText = wordsInLine.join(" ");
    for (const ch of graphemes(lineText)) {
      const charSpan = document.createElement("span");
      charSpan.className = "char";
      charSpan.style.setProperty("--char", charIndex++);
      charSpan.textContent = ch;
      inner.appendChild(charSpan);
    }
    line.appendChild(inner);
    title.appendChild(line);
    lineEls.push(inner);
  });
  return lineEls;
}
