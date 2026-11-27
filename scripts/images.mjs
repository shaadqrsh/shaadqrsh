// Draws the README's images in the site's style: the banner, the link and
// project buttons, the project icon tiles and the GitHub activity card.
//
// Everything renders through the portfolio's own next/og (the same Satori
// pipeline as its OpenGraph cards) with the fonts in src/lib/og-fonts, and the
// colors are read from the shaad-* tokens in src/app/globals.css, so the README
// follows the site when either changes. Images are drawn at 2x and the README
// shows them at half size.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const S = 2;
const u = (n) => n * S;

export async function createImages(portfolioDir) {
  const req = createRequire(path.join(portfolioDir, 'package.json'));
  const { ImageResponse } = req('next/og');
  const sharp = req('sharp');

  // ---- site tokens --------------------------------------------------------

  const css = fs.readFileSync(path.join(portfolioDir, 'src/app/globals.css'), 'utf8');
  const C = {};
  for (const [, name, hex] of css.matchAll(/--color-shaad-([\w-]+):\s*(#[0-9a-fA-F]{6,8})/g)) C[name] = hex.slice(0, 7);
  for (const k of ['100', '200', '300', '400', '500', '600', 'fill', 'ink', 'ink-2', 'ink-3', 'rose']) {
    if (!C[k]) throw new Error(`--color-shaad-${k} not found in globals.css`);
  }
  // fg drawn at `alpha` over bg, as one solid color.
  const mix = (fg, alpha, bg) => {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [a, b] = [p(fg), p(bg)];
    return '#' + a.map((v, i) => Math.round(v * alpha + b[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
  };
  // The site's tinted button is shaad-600 at 16% over a panel (shaad-200).
  const TINT = mix(C['600'], 0.16, C['200']);

  const fontDir = path.join(portfolioDir, 'src/lib/og-fonts');
  const font = (name, file, weight) => ({ name, data: fs.readFileSync(path.join(fontDir, file)), weight, style: 'normal' });
  const fonts = [
    font('Space Grotesk', 'SpaceGrotesk-700.woff', 700),
    font('IBM Plex Sans', 'IBMPlexSans-400.woff', 400),
    font('IBM Plex Sans', 'IBMPlexSans-600.woff', 600),
    font('IBM Plex Mono', 'IBMPlexMono-500.woff', 500),
  ];
  const DISPLAY = 'Space Grotesk', BODY = 'IBM Plex Sans', LABEL = 'IBM Plex Mono';

  // The site logo and the OG backdrop are stored as data URIs in TypeScript files.
  const dataUri = (file) => {
    const m = fs.readFileSync(path.join(portfolioDir, file), 'utf8').match(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/);
    if (!m) throw new Error(`no data URI in ${file}`);
    return m[0];
  };
  const LOGO = dataUri('src/lib/og-logo.ts');
  const BACKDROP = dataUri('src/lib/og-bg.ts');

  // ---- helpers ------------------------------------------------------------

  // A Satori element. Every div is a flex box, since Satori needs that for
  // more than one child.
  const h = (type, style = {}, ...children) => ({
    type,
    props: { style: type === 'div' ? { display: 'flex', ...style } : style, children: children.flat().filter((c) => c !== null && c !== false) },
  });
  const img = (src, width, height, style = {}) => ({ type: 'img', props: { src, width, height, style } });
  const svgUri = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

  const render = async (el, width, height) =>
    Buffer.from(await new ImageResponse(el, { width, height, fonts }).arrayBuffer());
  // Renders on a roomy transparent canvas, then crops to what was drawn.
  const renderTrimmed = async (el, width, height) => {
    const { data, info } = await sharp(await render(el, width, height)).trim({ threshold: 0 }).png().toBuffer({ resolveWithObject: true });
    return { png: data, width: info.width / S, height: info.height / S };
  };
  const png = (buf) => sharp(buf).png({ compressionLevel: 9 }).toBuffer();

  const label = (text) => h('div', { fontFamily: LABEL, fontSize: u(11), fontWeight: 500, letterSpacing: u(1), color: C['ink-3'], textTransform: 'uppercase' }, text);

  // ---- buttons --------------------------------------------------------------

  // Lucide icons (ISC) for actions, Simple Icons (CC0) paths for brands.
  const LUCIDE = {
    globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    resume: '<path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M15 18a3 3 0 1 0-6 0"/><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><circle cx="12" cy="13" r="2"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    live: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    more: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  };
  const BRAND = {
    linkedin: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
    x: 'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z',
  };
  const iconSvg = (name, color) =>
    BRAND[name]
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}"><path d="${BRAND[name]}"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${LUCIDE[name]}</svg>`;
  const SIZES = {
    lg: { font: 15, padY: 10, padX: 18, icon: 16, gap: 7 },
    sm: { font: 13, padY: 6, padX: 12, icon: 14, gap: 6 },
  };

  // The site's two button styles: `fill` (solid red, white text) and `tint`
  // (dim red, rose text). Returns the PNG and its 1x size.
  async function button(text, icon, kind, size) {
    if (!LUCIDE[icon] && !BRAND[icon]) throw new Error(`no button icon "${icon}"`);
    const z = SIZES[size];
    const [bg, fg] = kind === 'fill' ? [C.fill, '#ffffff'] : [TINT, C.rose];
    const el = h('div', { width: '100%', height: '100%', alignItems: 'flex-start' },
      h('div', { alignItems: 'center', gap: u(z.gap), backgroundColor: bg, color: fg, borderRadius: u(999), padding: `${u(z.padY)}px ${u(z.padX)}px`, fontFamily: BODY, fontWeight: 600, fontSize: u(z.font), lineHeight: 1 },
        img(svgUri(iconSvg(icon, fg)), u(z.icon), u(z.icon)),
        text));
    return renderTrimmed(el, u(400), u(z.font + z.padY * 2 + 12));
  }

  // ---- project tiles --------------------------------------------------------

  const TILE = 104;
  const roundMask = (n, r) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}"><rect width="${n}" height="${n}" rx="${r}" fill="#fff"/></svg>`);

  // A square, rounded tile the way the site's project cards show an icon: the
  // whole icon over a blurred, darkened copy of itself, so any shape fills it.
  // With no icon file it falls back to the site logo on a panel.
  async function projectTile(iconPath) {
    const n = u(TILE), r = Math.round(n * 0.22);
    let base;
    if (iconPath && fs.existsSync(iconPath)) {
      const back = await sharp(iconPath).resize(n, n, { fit: 'cover' }).blur(u(8)).modulate({ brightness: 0.55 }).toBuffer();
      const front = await sharp(iconPath).resize(n, n, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
      base = sharp({ create: { width: n, height: n, channels: 4, background: C['300'] } }).composite([{ input: back }, { input: front }]);
    } else {
      const logo = await sharp(Buffer.from(LOGO.split(',')[1], 'base64'), { density: 300 }).resize({ width: Math.round(n * 0.58) }).png().toBuffer();
      base = sharp({ create: { width: n, height: n, channels: 4, background: C['200'] } }).composite([{ input: logo, gravity: 'center' }]);
    }
    const flat = await base.png().toBuffer();
    return png(await sharp(flat).composite([{ input: roundMask(n, r), blend: 'dest-in' }]).toBuffer());
  }

  // An organisation logo the way the site's Logo component shows it: contained
  // on a white rounded tile, or a Lucide icon in red on a panel when there's
  // no image.
  const LOGO_SIZE = 48;
  const FALLBACK = {
    school: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    work: '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
  };
  async function logoTile(imagePath, fallback) {
    const n = u(LOGO_SIZE), r = u(10);
    let flat;
    if (imagePath && fs.existsSync(imagePath)) {
      const front = await sharp(imagePath).resize(n, n, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).flatten({ background: '#ffffff' }).toBuffer();
      flat = await sharp({ create: { width: n, height: n, channels: 4, background: '#ffffff' } }).composite([{ input: front }]).png().toBuffer();
    } else {
      const icon = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${n / 2}" height="${n / 2}" fill="none" stroke="${C['500']}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${FALLBACK[fallback]}</svg>`)).png().toBuffer();
      flat = await sharp({ create: { width: n, height: n, channels: 4, background: C['200'] } }).composite([{ input: icon, gravity: 'center' }]).png().toBuffer();
    }
    return png(await sharp(flat).composite([{ input: roundMask(n, r), blend: 'dest-in' }]).toBuffer());
  }

  // ---- banner ---------------------------------------------------------------

  // The home page's share card, wide and without the photo: the OG backdrop,
  // a shaad-200 panel with the logo and domain, the title in red, the name,
  // and the same labelled stats.
  async function banner({ name, title, domain, stats }) {
    const W = 840, H = 250;
    const el = h('div', { width: '100%', height: '100%', position: 'relative', borderRadius: u(20), overflow: 'hidden', backgroundColor: C['400'], padding: u(20) },
      img(BACKDROP, u(W), u(W * 630 / 1200), { position: 'absolute', left: 0, top: u(-60) }),
      h('div', { flexDirection: 'column', justifyContent: 'space-between', width: '100%', height: '100%', backgroundColor: C['200'], borderRadius: u(16), padding: `${u(26)}px ${u(30)}px` },
        h('div', { alignItems: 'center', gap: u(10) },
          img(LOGO, u(30), u(23)),
          h('div', { fontFamily: LABEL, fontSize: u(14), fontWeight: 500, color: C['ink-3'] }, domain)),
        h('div', { justifyContent: 'space-between', alignItems: 'flex-end' },
          h('div', { flexDirection: 'column' },
            h('div', { fontFamily: BODY, fontSize: u(19), fontWeight: 600, color: C['500'] }, title),
            h('div', { fontFamily: DISPLAY, fontSize: u(50), fontWeight: 700, color: '#ffffff', marginTop: u(4), lineHeight: 1.05 }, name)),
          h('div', { gap: u(28), paddingBottom: u(4) },
            stats.map((s) => h('div', { flexDirection: 'column', gap: u(6) },
              label(s.label),
              h('div', { fontFamily: DISPLAY, fontSize: u(22), fontWeight: 700, color: '#ffffff' }, s.value)))))));
    return png(await render(el, u(W), u(H)));
  }

  // ---- activity card --------------------------------------------------------

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDay = (iso, withYear = true) => {
    const [y, m, d] = iso.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ''}`;
  };
  const fmtRange = ([a, b]) => (a === b ? fmtDay(a) : `${fmtDay(a, a.slice(0, 4) !== b.slice(0, 4))} to ${fmtDay(b)}`);
  const days = (n) => `${n} day${n === 1 ? '' : 's'}`;
  // Empty cells are a step up from the panel, then the site's red in four steps.
  const RAMP = {
    NONE: mix(C['100'], 0.15, C['200']),
    FIRST_QUARTILE: mix(C['600'], 0.3, C['200']),
    SECOND_QUARTILE: mix(C['600'], 0.55, C['200']),
    THIRD_QUARTILE: mix(C['600'], 0.85, C['200']),
    FOURTH_QUARTILE: C['500'],
  };

  // The contribution grid for the last year, with the streaks under it.
  async function activityCard(a) {
    const W = 840, cell = 12, gap = 3, step = cell + gap, top = 18;
    const weeks = a.weeks;
    const months = [];
    weeks.forEach((w, i) => {
      const first = w[0].date;
      if (Number(first.slice(8, 10)) <= 7 && i < weeks.length - 2) months.push({ i, text: MONTHS[Number(first.slice(5, 7)) - 1] });
    });
    const gridW = weeks.length * step - gap;
    const grid = h('div', { position: 'relative', width: u(gridW), height: u(top + 7 * step - gap) },
      months.map((m) => h('div', { position: 'absolute', left: u(m.i * step), top: 0, fontFamily: LABEL, fontSize: u(11), fontWeight: 500, color: C['ink-3'] }, m.text)),
      weeks.map((w, i) => h('div', { position: 'absolute', left: u(i * step), top: u(top + (i === 0 ? (7 - w.length) * step : 0)), flexDirection: 'column', gap: u(gap) },
        w.map((d) => h('div', { width: u(cell), height: u(cell), borderRadius: u(2.5), backgroundColor: RAMP[d.level] || RAMP.NONE })))));
    const fact = (name, value, note, red) => h('div', { flexDirection: 'column', flex: 1 },
      label(name),
      h('div', { fontFamily: DISPLAY, fontSize: u(28), fontWeight: 700, color: red ? C['500'] : '#ffffff', marginTop: u(8) }, value),
      h('div', { fontFamily: BODY, fontSize: u(13), color: C['ink-3'], marginTop: u(4) }, note));
    const muted = { fontFamily: BODY, fontSize: u(13), color: C['ink-3'] };
    const el = h('div', { width: '100%', height: '100%', flexDirection: 'column', backgroundColor: C['200'], borderRadius: u(16), padding: `${u(20)}px ${u(22)}px` },
      h('div', { fontFamily: DISPLAY, fontSize: u(18), fontWeight: 700, color: '#ffffff', marginBottom: u(14) }, `${a.total} contributions in the last year`),
      grid,
      h('div', { justifyContent: 'space-between', alignItems: 'center', marginTop: u(12) },
        h('div', muted, `${a.activeDays} active days`),
        h('div', { ...muted, alignItems: 'center', gap: u(4), fontSize: u(12) },
          'Less',
          Object.values(RAMP).map((c) => h('div', { width: u(11), height: u(11), borderRadius: u(3), backgroundColor: c })),
          'More')),
      h('div', { height: u(1), backgroundColor: 'rgba(255,255,255,0.1)', margin: `${u(16)}px 0` }),
      h('div', { gap: u(10) },
        fact('Contributions', String(a.total), 'Last 12 months'),
        fact('Current streak', days(a.current.length), a.current.length ? `Since ${fmtDay(a.current.start)}` : `Last on ${fmtDay(a.lastDay)}`, true),
        fact('Longest streak', days(a.longest.length), a.longest.length ? fmtRange([a.longest.start, a.longest.end]) : 'None yet')));
    return png(await render(el, u(W), u(340)));
  }

  // Kept for later, not shown in the README: most used languages by code size.
  async function languagesCard(langs) {
    const top = langs[0]?.percent || 1;
    const el = h('div', { width: '100%', height: '100%', flexDirection: 'column', backgroundColor: C['200'], borderRadius: u(16), padding: `${u(20)}px ${u(22)}px` },
      h('div', { fontFamily: DISPLAY, fontSize: u(18), fontWeight: 700, color: '#ffffff', marginBottom: u(14) }, 'Most used languages'),
      langs.map((l) => h('div', { alignItems: 'center', gap: u(10), marginBottom: u(9), fontFamily: BODY, fontSize: u(14), fontWeight: 600, color: C.ink },
        h('div', { width: u(90) }, l.name),
        h('div', { flex: 1, height: u(8), borderRadius: u(4), backgroundColor: C['300'] },
          h('div', { width: `${(l.percent / top) * 100}%`, height: '100%', borderRadius: u(4), backgroundColor: C['600'] })),
        h('div', { width: u(48), justifyContent: 'flex-end', color: C['ink-2'] }, `${l.percent}%`))));
    return png(await render(el, u(400), u(80 + langs.length * 28)));
  }

  return { button, projectTile, logoTile, banner, activityCard, languagesCard, TILE, LOGO_SIZE };
}
