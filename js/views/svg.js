export const SVGNS = 'http://www.w3.org/2000/svg';

export function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'class') node.setAttribute('class', v);
    else node.setAttribute(k, v);
  }
  if (parent) parent.appendChild(node);
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
