// Shared title split (Hero + Yard): measures the rendered title with
// Range.getBoundingClientRect() to group words into visual lines, then wraps
// each character in .char spans inside .line > .line-inner. Returns the
// .line-inner elements (one per visual line). See DESIGN.md §5/§7.

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
  const lineEls = [];
  groups.forEach((wordsInLine) => {
    const line = document.createElement("span");
    line.className = "line";
    const inner = document.createElement("span");
    inner.className = "line-inner";
    const lineText = wordsInLine.join(" ");
    for (const ch of lineText) {
      const charSpan = document.createElement("span");
      charSpan.className = "char";
      charSpan.textContent = ch;
      inner.appendChild(charSpan);
    }
    line.appendChild(inner);
    title.appendChild(line);
    lineEls.push(inner);
  });
  return lineEls;
}
