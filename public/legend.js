import { stateColor } from './iso.js';

const CHIPS = [
  { state: 'working', label: 'working', title: 'It is doing something right now' },
  { state: 'thinking', label: 'thinking', title: 'It is deciding what to do next' },
  { state: 'walking', label: 'walking in', title: 'It just arrived at a desk' },
  { state: 'blocked', label: 'needs you', title: 'It stopped and is waiting for an answer' },
  { state: 'done', label: 'finished', title: 'It wrote its report' },
  { state: 'idle', label: 'standing by', title: 'No news for a while — it is waiting for you to do something' },
  { state: 'error', label: 'problem', title: 'It stopped with a problem' },
];

export function renderLegend(host) {
  if (!host) return;
  const lead = document.createElement('span');
  lead.className = 'legendlead';
  lead.textContent = 'Colours:';
  const chips = CHIPS.map((c) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.setAttribute('role', 'listitem');
    chip.tabIndex = 0;
    chip.title = c.title;
    chip.setAttribute('aria-label', c.title);
    const dot = document.createElement('i');
    dot.style.background = stateColor(c.state);
    chip.append(dot, document.createTextNode(c.label));
    return chip;
  });
  host.replaceChildren(lead, ...chips);
}
