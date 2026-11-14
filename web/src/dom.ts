/** All text reaches the page through textContent, never innerHTML, so PSI or model text cannot inject markup. */
export function setText(el: Element, s: string): void {
  el.textContent = s;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) setText(node, text);
  return node;
}
