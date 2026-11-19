// Shared anchor factory (Hero + Yard; = Video's mkCorner, incl. the obfuscated
// mailto assembly). Each anchor carries data-anchor="brand|locale|cta" so
// persistent-anchor matching can key on role rather than text.
//
//   className  full class string (e.g. "brand", "y-anchor y-brand")
//   label      visible text, wrapped in .reveal-inner
//   opts.key   data-anchor value: "brand" | "locale" | "cta"
//   opts.link  true → <a> with the data-u/data-d mailto assembly on click
//   opts.tag   element tag when not a link (default "div")

export function mkAnchor(className, label, { key, link = false, tag = "div" } = {}) {
  const el = document.createElement(link ? "a" : tag);
  el.className = className;
  if (key) el.dataset.anchor = key;
  if (link) {
    el.href = "#";
    el.dataset.u = "hello";
    el.dataset.d = "spendolas.com";
    el.addEventListener("click", () => {
      el.href = "mailto:" + el.dataset.u + "@" + el.dataset.d;
    });
  }
  el.innerHTML = '<span class="reveal-inner">' + label + "</span>";
  return el;
}
