// "From the launch pad to Mars": NASA milestones that play one after another beside the Apollo 11 liftoff.
// These are NASA's own milestones, not a full history of spaceflight, and the section says so.
import { el } from './dom';

export interface Milestone { year: string; name: string; text: string; fire?: boolean }

export const MILESTONES: Milestone[] = [
  { year: '1967', name: 'Apollo 1', text: 'A cabin fire during a launch-pad test kills the crew of Apollo 1. NASA redesigns the cabin and its materials.', fire: true },
  { year: '1969', name: 'Apollo 11', text: 'Astronauts walk on the Moon. The liftoff is the photo behind this text.' },
  { year: '1973', name: 'Skylab', text: 'The first U.S. space station.' },
  { year: '1981', name: 'Space Shuttle', text: 'The first reusable crewed spacecraft flies.' },
  { year: '2000', name: 'International Space Station', text: 'Crews have lived aboard without a break since November 2000.' },
  { year: '2016', name: 'Saffire-I', text: 'NASA lights its largest fire experiment in space, inside an empty cargo ship. It is PSI-98 in this catalogue.', fire: true },
  { year: '2022', name: 'Artemis I', text: 'The Moon rocket for the next crews flies its first mission, without a crew.' },
  { year: 'Next', name: 'Mars', text: 'Longer trips, farther from help. That is why fire is studied now.' },
];

const STEP_MS = 2600;

export function mountJourney(box: HTMLElement): void {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const list = el('ol', `journey${calm ? ' still' : ''}`);
  const items = MILESTONES.map((m, i) => {
    const li = el('li', m.fire ? 'fire' : '');
    li.tabIndex = 0;
    const head = el('div', 'j-head');
    head.append(el('span', 'j-year', m.year), el('span', 'j-name', m.name));
    li.append(head, el('p', 'j-text', m.text));
    const pick = () => { hold = true; show(i); };
    li.addEventListener('mouseenter', pick);
    li.addEventListener('focus', pick);
    li.addEventListener('mouseleave', () => { hold = false; });
    li.addEventListener('blur', () => { hold = false; });
    list.append(li);
    return li;
  });
  box.append(list);

  let at = 0;
  let hold = false;
  function show(i: number) {
    at = i;
    items.forEach((li, k) => { li.classList.toggle('on', k === i); li.classList.toggle('past', k < i); });
    list.style.setProperty('--progress', String(MILESTONES.length > 1 ? i / (MILESTONES.length - 1) : 1));
  }
  show(0);
  if (calm) return;
  let visible = false;
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: 0.25 }).observe(box);
  window.setInterval(() => { if (visible && !hold && !document.hidden) show((at + 1) % MILESTONES.length); }, STEP_MS);
}
