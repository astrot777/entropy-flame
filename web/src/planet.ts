import { animate, scroll, stagger } from 'motion';

const VIDEO = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260613_180732_a54afbf6-b30d-470e-861f-669871f09f67.mp4';
const byId = (id: string) => document.getElementById(id);
const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function video(): void {
  const clip = byId('hero-video') as HTMLVideoElement | null;
  if (!clip) return;
  clip.src = VIDEO;
  if (calm()) return;
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) clip.play().catch(() => { /* autoplay refused: the first frame stays */ });
    else clip.pause();
  }).observe(clip);
}

function menu(): void {
  const button = byId('np-burger');
  const panel = byId('np-menu');
  const backdrop = byId('np-backdrop');
  if (!button || !panel || !backdrop) return;
  const items = Array.from(panel.querySelectorAll<HTMLElement>('.np-menu-in > *'));
  let closing = 0;
  const show = (on: boolean) => {
    window.clearTimeout(closing);
    button.setAttribute('aria-expanded', String(on));
    button.setAttribute('aria-label', on ? 'Close menu' : 'Open menu');
    if (on) {
      panel.hidden = false;
      backdrop.hidden = false;
      items.forEach((item, i) => { item.style.transitionDelay = `${350 + i * 50}ms`; });
      requestAnimationFrame(() => { panel.classList.add('on'); backdrop.classList.add('on'); });
    } else {
      items.forEach((item) => { item.style.transitionDelay = '0ms'; });
      panel.classList.remove('on');
      backdrop.classList.remove('on');
      closing = window.setTimeout(() => { panel.hidden = true; backdrop.hidden = true; }, 500);
    }
  };
  button.addEventListener('click', () => show(button.getAttribute('aria-expanded') !== 'true'));
  backdrop.addEventListener('click', () => show(false));
  panel.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) show(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') show(false); });
}

function entrance(): void {
  const ease = [0.16, 1, 0.3, 1] as const;
  animate('.np-video', { opacity: [0, 1] }, { duration: 1.6, ease: 'easeOut' });
  animate('.np-nav', { opacity: [0, 1], y: [-16, 0] }, { duration: 0.7, delay: 0.2, ease });
  animate('.np-line', { opacity: [0, 1], y: [24, 0], filter: ['blur(8px)', 'blur(0px)'] }, { duration: 0.9, delay: stagger(0.12, { startDelay: 0.35 }), ease });
  animate('.np-big span', { opacity: [0, 1], y: ['55%', '0%'], filter: ['blur(14px)', 'blur(0px)'] }, { duration: 1.1, delay: stagger(0.06, { startDelay: 0.6 }), ease });
  animate('.np-return', { opacity: [0, 1], y: [16, 0] }, { duration: 0.8, delay: 1.2, ease });
  animate('.np-foot', { opacity: [0, 1] }, { duration: 0.9, delay: 1.4, ease: 'easeOut' });
}

function handOff(): void {
  const stack = byId('np-stack');
  const hero = byId('top');
  const next = byId('prism');
  if (!stack || !hero || !next) return;
  // The sheet effect needs page 1 to fit the screen; on a short or narrow screen the page scrolls normally.
  const content = hero.querySelector<HTMLElement>('.np-content');
  const fit = () => stack.classList.toggle('np-pin', (content ?? hero).scrollHeight <= window.innerHeight + 2);
  fit();
  window.addEventListener('resize', fit, { passive: true });
  const foot = hero.querySelector('.np-foot');
  if (foot && 'ResizeObserver' in window) new ResizeObserver(fit).observe(foot);
  const offset: ['start end', 'start start'] = ['start end', 'start start'];
  const span = { target: next, offset };
  scroll(animate('.np-content', { opacity: [1, 0.1], scale: [1, 0.9], filter: ['blur(0px)', 'blur(8px)'] }, { ease: 'linear' }), span);
  scroll(animate('.np-video', { scale: [1, 1.18] }, { ease: 'linear' }), span);
}

/** Page 1: the clip, the phone menu, the entrance, and the hand-off to the next page. */
export function mountPlanet(): void {
  video();
  menu();
  if (calm()) return;
  entrance();
  handOff();
}
