#!/usr/bin/env node
// Builds the whole README.md, and the images it shows, from the portfolio's
// data. Nothing in the README is written by hand, so edit the data, never
// README.md or anything in assets/ except assets/skills/.
//
// Data comes from the portfolio repo (by default one folder up from here):
//   src/lib/resume_data.json  name, title, about, stats, links, current roles,
//                             projects, blurbs, jams, publications, skills
//   src/lib/projectId.ts      per-project links and the game flag
//   public/project_<key>/icon.png, the logos in `image` fields, the fonts,
//   logo and backdrop of the OG cards, and the colors in globals.css
//
// Images (scripts/images.mjs draws them in the site's style, at 2x):
//   assets/banner.png      the home share card, wide and without the photo
//   assets/buttons/        link and project buttons in the site's two styles
//   assets/projects/       each project's icon as a square rounded tile
//   assets/now/            school and employer logos on white tiles
//   assets/activity.png    contribution grid and streaks, from the GitHub API
//   assets/skills/         hand-made tiles for skills skillicons.dev lacks
// The generated folders are cleared of files the README no longer uses.
//
// Rules:
//   - Top: the banner (linking to the site), the About text, then a button
//     for the portfolio, the resume, and every link in `links` except GitHub,
//     since the README is already on GitHub.
//   - Right now: every education and experience record with inProgress, with
//     its logo. An experience's optional `blurb` follows its place.
//   - Games (a grid of two) and Other projects (a list): split by the `game`
//     flag in projectId.ts, in resume_data.json order, including projects
//     marked hidden (those are kept off the site only, so they get no page
//     link). Each shows its icon, title, year, `blurb` and buttons. A title
//     shows only the part before " - ".
//   - Buttons: GitHub reads "Code", download links are dropped, others read
//     "Play" on games and "Live" elsewhere. Games also get "More", to their
//     page. The first button is solid red, the rest tinted.
//   - Jams: only those with a `result`. A trailing year in the title is
//     dropped, since the year follows in brackets.
//   - GitHub activity: the card, refreshed on every run that has a token.
//     Without one, the last card is kept.
//   - Tools: the site's skills, grouped by category. Skills with a
//     skillicons.dev icon, or a tile in assets/skills/, show as icons, the
//     rest as text.
//
// Usage:
//   node scripts/build_readme.mjs                    write README.md and assets/
//   node scripts/build_readme.mjs --check            exit 1 if README.md is out of date
//   node scripts/build_readme.mjs --portfolio <dir>  read data from another checkout
//                                                    (or set PORTFOLIO_DIR)

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createImages } from './images.mjs';
import { fetchActivity, githubToken } from './activity.mjs';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const portfolioArg = args.indexOf('--portfolio');
const portfolioDir = path.resolve(
  portfolioArg >= 0 ? args[portfolioArg + 1] : process.env.PORTFOLIO_DIR || path.join(repoDir, '..'),
);

const resumePath = path.join(portfolioDir, 'src/lib/resume_data.json');
const projectIdPath = path.join(portfolioDir, 'src/lib/projectId.ts');
if (!fs.existsSync(resumePath) || !fs.existsSync(projectIdPath)) {
  console.error(`Portfolio data not found under ${portfolioDir}. Pass --portfolio <dir> or set PORTFOLIO_DIR.`);
  process.exit(2);
}

// projectId.ts is TypeScript that imports the JSON, so load it with jiti from
// the portfolio's own node_modules rather than adding dependencies here. The
// images use its next/og and sharp the same way.
const portfolioRequire = createRequire(path.join(portfolioDir, 'package.json'));
let createJiti;
try {
  ({ createJiti } = portfolioRequire('jiti'));
} catch {
  console.error(`jiti not found in ${portfolioDir}/node_modules. Run npm install there first.`);
  process.exit(2);
}
const jiti = createJiti(projectIdPath);
const { data: projectDetails } = await jiti.import(projectIdPath);

const resume = JSON.parse(fs.readFileSync(resumePath, 'utf8'));
const images = await createImages(portfolioDir);

const warnings = [];
const year = (date) => (date || '').split('/').pop();
const site = resume.websiteUrl.replace(/\/$/, '');
const attr = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const html = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Blurbs must fit in two lines. The portfolio-entry skill uses the same limits.
const BLURB_MAX = 110;
const JAM_BLURB_MAX = 80;

// The site's skill icon files mapped to skillicons.dev icon ids. A skill whose
// icon isn't listed here shows as text instead.
const SKILL_ICONS = {
  'icon_android.svg': 'androidstudio',
  'icon_blender.svg': 'blender',
  'icon_cmake.svg': 'cmake',
  'icon_cpp.svg': 'cpp',
  'icon_cs.svg': 'cs',
  'icon_csharp.svg': 'cs',
  'icon_django.svg': 'django',
  'icon_docker.svg': 'docker',
  'icon_firebase.svg': 'firebase',
  'icon_flask.svg': 'flask',
  'icon_git.svg': 'git',
  'icon_godot.svg': 'godot',
  'icon_java.svg': 'java',
  'icon_javascript.svg': 'js',
  'icon_lua.svg': 'lua',
  'icon_nextjs.svg': 'nextjs',
  'icon_photoshop.svg': 'ps',
  'icon_postgresql.svg': 'postgres',
  'icon_premiere.svg': 'pr',
  'icon_python.svg': 'py',
  'icon_react.svg': 'react',
  'icon_ruby.svg': 'ruby',
  'icon_supabase.svg': 'supabase',
  'icon_tailwind.svg': 'tailwind',
  'icon_typescript.svg': 'ts',
  'icon_unity.svg': 'unity',
  'icon_unreal.svg': 'unreal',
  'icon_vercel.svg': 'vercel',
  'icon_vite.svg': 'vite',
};

// Skills skillicons.dev doesn't have. These tiles live in assets/skills/ and
// copy skillicons' dark tile so they sit in the same row.
const LOCAL_SKILL_ICONS = {
  'icon_claude.svg': 'assets/skills/claude.svg',
  'icon_microsoft.svg': 'assets/skills/microsoftoffice.svg',
};

// Button icons for the top links, keyed by the link's `label` in resume_data.json.
const LINK_ICONS = { portfolio: 'globe', resume: 'resume', linkedin: 'linkedin', twitter: 'x', mail: 'mail' };
const ACTION_ICONS = { Play: 'play', Live: 'live', Code: 'code', More: 'more' };

// ---- generated files -------------------------------------------------------

// Every image this run makes, by its path in this repo. Written at the end,
// and only when the bytes changed.
const outputs = new Map();
const MANAGED_DIRS = ['assets/buttons', 'assets/projects', 'assets/now'];

const img = (src, w, h, alt, extra = '') =>
  `<img src="${src}"${w ? ` width="${w}"` : ''}${h ? ` height="${h}"` : ''} alt="${attr(alt)}"${extra}>`;
const link = (href, inner) => `<a href="${attr(href)}">${inner}</a>`;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const buttons = new Map();
async function button(text, icon, kind, size) {
  const file = `assets/buttons/${size}-${slug(text)}-${kind}.png`;
  if (!buttons.has(file)) {
    const b = await images.button(text, icon, kind, size);
    outputs.set(file, b.png);
    buttons.set(file, b);
  }
  const b = buttons.get(file);
  return img(file, Math.round(b.width), Math.round(b.height), text);
}

// ---- top -------------------------------------------------------------------

async function top() {
  const stats = (resume.testimonials || []).map((t) => ({
    label: t.label,
    // The site counts jams from the data rather than the typed number.
    value: t.label === 'Jams' ? String(resume.jams.length) : t.count,
  }));
  outputs.set('assets/banner.png', await images.banner({
    name: resume.name,
    title: resume.title,
    domain: new URL(site).hostname.replace(/^www\./, ''),
    stats,
  }));

  const links = [
    { label: 'portfolio', text: 'Portfolio', href: site },
    { label: 'resume', text: 'Resume', href: `${site}/resume` },
    ...resume.links
      .filter((l) => !/github\.com/i.test(l.href))
      .map((l) => ({
        label: l.label.toLowerCase(),
        text: l.text,
        href: l.href.includes('@') && !l.href.includes(':') ? `mailto:${l.href}` : l.href,
      })),
  ];
  const linkHtml = [];
  for (const [i, l] of links.entries()) {
    const icon = LINK_ICONS[l.label];
    if (!icon) warnings.push(`link "${l.text}": no icon in LINK_ICONS, using the external link icon`);
    linkHtml.push(link(l.href, await button(l.text, icon || 'live', i === 0 ? 'fill' : 'tint', 'lg')));
  }
  return [
    link(site, img('assets/banner.png', '100%', null, `${resume.name}, ${resume.title}`)),
    resume.about,
    `<p>\n${linkHtml.join('\n&nbsp;')}\n</p>`,
  ].join('\n\n');
}

// ---- right now -------------------------------------------------------------

async function logo(image, alt, fallback) {
  const source = image ? path.join(portfolioDir, 'public', image) : null;
  if (source && !fs.existsSync(source)) warnings.push(`logo ${image} not found in public/, using the ${fallback} icon`);
  const file = `assets/now/${source && fs.existsSync(source) ? path.basename(image, path.extname(image)) : fallback}.png`;
  if (!outputs.has(file)) outputs.set(file, await images.logoTile(source, fallback));
  return img(file, images.LOGO_SIZE, images.LOGO_SIZE, alt, ' align="left"');
}

async function nowList() {
  const rows = [];
  for (const e of resume.education.filter((e) => e.inProgress)) {
    const place = e.subtitle?.[0] || '';
    const school = place.split(', ').pop();
    rows.push([await logo(e.image, school, 'school'), e.title, `${place ? `${place}, ` : ''}${year(e.startDate)} to ${year(e.endDate)}`]);
  }
  for (const x of resume.experience.filter((x) => x.inProgress)) {
    const place = (x.location || '').split(', ')[0];
    rows.push([await logo(x.image, place || x.title, 'work'), x.title, [place, x.blurb].filter(Boolean).join(', ')]);
  }
  return rows.map(([logoImg, title, line]) => `<p>${logoImg}<b>${html(title)}</b><br>\n${html(line)}</p>\n<br clear="left">`).join('\n\n');
}

// ---- projects --------------------------------------------------------------

const LINK_ORDER = ['Play', 'Live', 'Code'];
const linkLabel = (label, game) => {
  if (/download/i.test(label)) return null;
  if (/github/i.test(label)) return 'Code';
  return game ? 'Play' : 'Live';
};

async function project(p) {
  const detail = projectDetails[p.url];
  if (!detail) warnings.push(`${p.url}: no entry in projectId.ts, so no links`);
  if (!p.blurb) warnings.push(`${p.url}: no "blurb" in resume_data.json, using its desc`);
  else if (p.blurb.length > BLURB_MAX) warnings.push(`${p.url}: blurb is ${p.blurb.length} characters, over ${BLURB_MAX}, so it runs past two lines`);

  const page = p.hidden ? null : `${site}/projects/${p.url}`;
  const iconPath = path.join(portfolioDir, 'public', `project_${p.url}`, 'icon.png');
  if (!fs.existsSync(iconPath)) warnings.push(`${p.url}: no public/project_${p.url}/icon.png, using the logo tile`);
  const tileFile = `assets/projects/${p.url}.png`;
  outputs.set(tileFile, await images.projectTile(iconPath));

  const actions = (detail?.urls || [])
    .map((u) => ({ label: linkLabel(u.label, detail.game), url: u.url }))
    .filter((l) => l.label)
    .sort((a, b) => LINK_ORDER.indexOf(a.label) - LINK_ORDER.indexOf(b.label));
  if (detail?.game && page) actions.push({ label: 'More', url: page });
  const btns = [];
  for (const [i, a] of actions.entries()) {
    btns.push(link(a.url, await button(a.label, ACTION_ICONS[a.label], i === 0 && a.label !== 'More' ? 'fill' : 'tint', 'sm')));
  }

  return {
    title: html(p.title.split(' - ')[0]),
    titleAttr: p.title.split(' - ')[0],
    year: year(p.date),
    blurb: html(p.blurb || p.desc),
    page,
    tileFile,
    buttons: btns.join('\n&nbsp;'),
  };
}

async function gameGrid(list) {
  const cells = [];
  for (const p of list) {
    const x = await project(p);
    const tile = img(x.tileFile, images.TILE, images.TILE, x.titleAttr);
    cells.push([
      '<td width="50%" valign="top">',
      `<p align="center">${x.page ? link(x.page, tile) : tile}</p>`,
      `<b>${x.title}</b> (${x.year})<br>`,
      x.blurb,
      `<p>\n${x.buttons}\n</p>`,
      '</td>',
    ].join('\n'));
  }
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) {
    const row = cells.slice(i, i + 2);
    if (row.length < 2) row.push('<td width="50%"></td>');
    rows.push(`<tr>\n${row.join('\n')}\n</tr>`);
  }
  return `<table>\n${rows.join('\n')}\n</table>`;
}

const LIST_ICON = 96;
async function projectList(list) {
  const rows = [];
  for (const p of list) {
    const x = await project(p);
    const tile = img(x.tileFile, LIST_ICON, LIST_ICON, x.titleAttr, ' align="left"');
    rows.push(`<p>${x.page ? link(x.page, tile) : tile}<b>${x.title}</b> (${x.year})<br>\n${x.blurb}<br>\n${x.buttons}\n</p>\n<br clear="left">`);
  }
  return rows.join('\n\n');
}

// ---- jams, publications ----------------------------------------------------

function jamList() {
  return resume.jams
    .filter((j) => j.result)
    .map((j) => {
      if (!j.blurb) warnings.push(`jam "${j.title}": no "blurb" in resume_data.json, using its first bullet`);
      else if (j.blurb.length > JAM_BLURB_MAX) warnings.push(`jam "${j.title}": blurb is ${j.blurb.length} characters, over ${JAM_BLURB_MAX}`);
      const yr = year(j.date);
      const title = j.title.replace(new RegExp(`\\s+${yr}$`), '');
      return `- **${title}** (${yr}): ${j.blurb || j.bullets[0]}`;
    })
    .join('\n');
}

function publicationList() {
  return resume.publications.map((p) => `- [${p.name}](${p.url}), ${p.publishing}, ${year(p.date)}`).join('\n');
}

// ---- activity --------------------------------------------------------------

async function activity() {
  const file = 'assets/activity.png';
  const gh = resume.links.find((l) => /github\.com\//i.test(l.href));
  const login = gh && new URL(gh.href).pathname.split('/').filter(Boolean)[0];
  const token = checkOnly ? null : githubToken();
  if (login && token) {
    try {
      outputs.set(file, await images.activityCard(await fetchActivity(login, token)));
    } catch (e) {
      warnings.push(`GitHub activity not refreshed: ${e.message}`);
    }
  } else if (!checkOnly) {
    warnings.push(login ? 'no GitHub token (GITHUB_TOKEN, GH_TOKEN or gh auth), so the activity card was not refreshed' : 'no GitHub link in `links`, so no activity card');
  }
  if (!outputs.has(file) && !fs.existsSync(path.join(repoDir, file))) return null;
  return img(file, '100%', null, 'GitHub contribution grid for the last 12 months, with the current and longest streaks');
}

// ---- tools -----------------------------------------------------------------

function toolList() {
  const skills = [...(resume.skills.top3 || []), ...(resume.skills.main || []), ...(resume.skills.other || [])];
  const groups = new Map();
  for (const s of skills) {
    if (!groups.has(s.category)) groups.set(s.category, []);
    const icon = SKILL_ICONS[s.icon] ? `https://skillicons.dev/icons?i=${SKILL_ICONS[s.icon]}` : LOCAL_SKILL_ICONS[s.icon];
    groups.get(s.category).push({ name: s.name || s.title, icon });
  }
  const blocks = [];
  for (const [category, list] of groups) {
    const withIcon = list.filter((s) => s.icon);
    const plain = list.filter((s) => !s.icon).map((s) => s.name);
    const parts = [`**${category}**`];
    // One image per skill, so each gets its own alt text and hover title.
    if (withIcon.length) {
      const imgs = withIcon.map((s) => `  <img src="${s.icon}" width="48" height="48" alt="${attr(s.name)}" title="${attr(s.name)}">`);
      parts.push(`<p>\n${imgs.join('\n')}\n</p>`);
    }
    if (plain.length) parts.push(plain.join(', '));
    blocks.push(parts.join('\n\n'));
  }
  return blocks.join('\n\n');
}

// ---- page ------------------------------------------------------------------

const isGame = (p) => Boolean(projectDetails[p.url]?.game);
const activityImg = await activity();
const sections = [
  await top(),
  `## Right now\n\n${await nowList()}`,
  `## Games\n\n${await gameGrid(resume.projects.filter(isGame))}`,
  `## Other projects\n\n${await projectList(resume.projects.filter((p) => !isGame(p)))}`,
  `## Jams and challenges\n\n${jamList()}`,
  `## Publications\n\n${publicationList()}`,
  activityImg && `## GitHub activity\n\n${activityImg}`,
  `## Tools\n\n${toolList()}`,
].filter(Boolean);

const header =
  '<!-- Generated by scripts/build_readme.mjs from the portfolio data (shaadqrsh/shaad-portfolio). Edit that, not this file. -->\n\n';
const output = header + sections.join('\n\n') + '\n';

// In GitHub Actions, print warnings as annotations so they show on the run summary.
const warnPrefix = process.env.GITHUB_ACTIONS ? '::warning::' : 'warning: ';
for (const w of warnings) console.warn(warnPrefix + w);

const readmePath = path.join(repoDir, 'README.md');
const current = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8').replace(/\r\n/g, '\n') : '';

if (checkOnly) {
  if (current === output) {
    console.log('README.md is up to date.');
  } else {
    console.error('README.md is out of date. Run node scripts/build_readme.mjs');
    process.exit(1);
  }
} else {
  let changed = 0;
  for (const [rel, buf] of outputs) {
    const file = path.join(repoDir, rel);
    if (fs.existsSync(file) && fs.readFileSync(file).equals(buf)) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    changed++;
  }
  for (const dir of MANAGED_DIRS) {
    const abs = path.join(repoDir, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs)) {
      if (!outputs.has(`${dir}/${f}`)) {
        fs.rmSync(path.join(abs, f));
        changed++;
      }
    }
  }
  if (current !== output) fs.writeFileSync(readmePath, output);
  console.log(`${current === output ? 'README.md already up to date' : 'Wrote README.md'}, ${changed} image file(s) changed.`);
}
