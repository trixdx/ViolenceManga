export const PALETTES = [
  { id: 'violet', name: 'Фиолет', colors: ['#7c3aed', '#a855f7', '#c084fc'] },
  { id: 'rose', name: 'Роза', colors: ['#e11d48', '#f43f5e', '#fb7185'] },
  { id: 'cyan', name: 'Бирюза', colors: ['#0891b2', '#06b6d4', '#22d3ee'] },
  { id: 'emerald', name: 'Изумруд', colors: ['#059669', '#10b981', '#34d399'] },
  { id: 'amber', name: 'Янтарь', colors: ['#d97706', '#f59e0b', '#fbbf24'] },
  { id: 'crimson', name: 'Багряный', colors: ['#b91c1c', '#ef4444', '#f87171'] },
  { id: 'indigo', name: 'Индиго', colors: ['#4338ca', '#6366f1', '#818cf8'] },
];

const TRANSITION_SPEEDS = {
  fast: '0.12s cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '0.22s cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '0.38s cubic-bezier(0.4, 0, 0.2, 1)',
};

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark');
}

export function applyVisualSettings(settings = {}) {
  const root = document.documentElement;
  const palette = settings.palette || 'violet';
  const speed = settings.transitionSpeed || 'normal';
  const paletteDef = PALETTES.find(p => p.id === palette) || PALETTES[0];

  root.setAttribute('data-palette', palette);
  root.style.setProperty('--transition', TRANSITION_SPEEDS[speed] || TRANSITION_SPEEDS.normal);

  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', paletteDef.colors[1]);

  const animations = settings.animations !== false;
  const glow = settings.effectsGlow !== false;
  const blur = settings.effectsBlur !== false;
  const orbs = settings.effectsOrbs !== false;
  const cardHover = settings.effectsCardHover !== false;

  document.body.classList.toggle('fx-off', !animations);
  document.body.classList.toggle('fx-glow', animations && glow);
  document.body.classList.toggle('fx-blur', animations && blur);
  document.body.classList.toggle('fx-orbs', animations && orbs);
  document.body.classList.toggle('fx-cards', animations && cardHover);
  document.body.classList.toggle('fx-stagger', animations);
  document.body.classList.toggle('font-ios-bold', settings.iosBoldFont === true);
}

export function applyAllVisualSettings(settings) {
  applyTheme(settings.theme);
  applyVisualSettings(settings);
}

export function animatePageEnter() {
  if (document.body.classList.contains('fx-off')) return;
  const el = document.getElementById('content');
  if (!el) return;
  el.classList.remove('page-enter');
  void el.offsetWidth;
  el.classList.add('page-enter');
  window.setTimeout(() => el.classList.remove('page-enter'), 450);
}
