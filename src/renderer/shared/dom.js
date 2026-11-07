// Minimal DOM helpers. `h` builds elements without innerHTML (safe with external data).

export const $ = (selector, root = document) => root.querySelector(selector);

/**
 * h('button', { class: 'btn', onclick: fn }, 'Text', otherNode)
 * Props starting with "on" become listeners; `class`, `dataset` and `style` are applied directly.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style') Object.assign(el.style, value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

/** Restarts a CSS animation by re-applying its class. */
export function replayClass(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
}
