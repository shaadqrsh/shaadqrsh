#!/usr/bin/env node
// Builds the whole README.md from the portfolio's data files. Nothing in the
// README is written by hand, so edit the data, never README.md.
//
// Data comes from the portfolio repo (by default two folders up from here):
//   src/lib/resume_data.json  name, about, links, current roles, projects,
//                             blurbs, jams, publications, skills
//   src/lib/projectId.ts      per-project links and technologies
//
// Rules:
//   - Intro: "Hi, I'm <first name>", the site's About text, then a links bar
//     (portfolio, resume, and every link in `links` except GitHub, since the
//     README is already on GitHub).
//   - Right now: every education and experience record with inProgress. An
//     experience's optional `blurb` follows after a comma.
//   - Games and Other projects: split by the `game` flag in projectId.ts, in
//     resume_data.json order, including projects marked hidden (those are
//     kept off the site only). About is the record's `blurb`, Built with is
//     the first TECH_COUNT technologies. A title shows only the part before
//     " - ".
//   - Links: GitHub reads "Code", download links are dropped, others read
//     "Play" on games and "Live" elsewhere. Games also link to their page.
//   - Jams: only those with a `result`. A trailing year in the title is
//     dropped, since the year follows in brackets.
//   - Tools: the site's skills, grouped by category. Skills with a
//     skillicons.dev icon show as icons, the rest as text.
//
// Usage:
//   node scripts/build_readme.mjs                    write README.md
//   node scripts/build_readme.mjs --check            exit 1 if README.md is out of date
//   node scripts/build_readme.mjs --portfolio <dir>  read data from another checkout
//                                                    (or set PORTFOLIO_DIR)

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

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
// the portfolio's own node_modules rather than adding dependencies here.
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

const warnings = [];
const year = (date) => (date || '').split('/').pop();
const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const site = resume.websiteUrl.replace(/\/$/, '');

const TECH_COUNT = 5;

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

// ---- intro -----------------------------------------------------------------

function intro() {
  const first = resume.name.split(' ')[0];
  const links = [
    { text: 'Portfolio', href: site },
    { text: 'Resume', href: `${site}/resume` },
    ...resume.links
      .filter((l) => !/github\.com/i.test(l.href))
      .map((l) => ({ text: l.text, href: l.href.includes('@') && !l.href.includes(':') ? `mailto:${l.href}` : l.href })),
  ];
  return [
    `# Hi, I'm ${first}`,
    resume.about,
    links.map((l) => `**[${l.text}](${l.href})**`).join(' · '),
  ].join('\n\n');
}

// ---- right now -------------------------------------------------------------

function nowList() {
  const lines = [];
  for (const e of resume.education.filter((e) => e.inProgress)) {
    const place = e.subtitle?.[0];
    lines.push(`- ${e.title}${place ? ` at ${place}` : ''}, ${year(e.startDate)} to ${year(e.endDate)}`);
  }
  for (const x of resume.experience.filter((x) => x.inProgress)) {
    const place = (x.location || '').split(', ')[0];
    lines.push(`- ${x.title}${place ? ` at ${place}` : ''}${x.blurb ? `, ${x.blurb}` : ''}`);
  }
  return lines.join('\n');
}

// ---- projects --------------------------------------------------------------

const LINK_ORDER = ['Play', 'Live', 'Code'];
const linkLabel = (label, game) => {
  if (/download/i.test(label)) return null;
  if (/github/i.test(label)) return 'Code';
  return game ? 'Play' : 'Live';
};

function projectLinks(slug, detail) {
  const links = (detail?.urls || [])
    .map((u) => ({ label: linkLabel(u.label, detail.game), url: u.url }))
    .filter((l) => l.label)
    .sort((a, b) => LINK_ORDER.indexOf(a.label) - LINK_ORDER.indexOf(b.label));
  if (detail?.game) links.push({ label: 'More', url: `${site}/projects/${slug}` });
  return links.map((l) => `[${l.label}](${l.url})`).join(' · ');
}

function projectTable(game) {
  const lines = [`| ${game ? 'Game' : 'Project'} | About | Built with | Links |`, '| --- | --- | --- | --- |'];
  for (const p of resume.projects.filter((p) => Boolean(projectDetails[p.url]?.game) === game)) {
    const detail = projectDetails[p.url];
    if (!detail) warnings.push(`${p.url}: no entry in projectId.ts, so no links or tech`);
    if (!p.blurb) warnings.push(`${p.url}: no "blurb" in resume_data.json, using its desc`);
    const title = p.title.split(' - ')[0];
    const tech = (detail?.technologies || []).slice(0, TECH_COUNT).map((t) => t.name);
    lines.push(
      `| **${cell(title)}** (${year(p.date)}) | ${cell(p.blurb || p.desc)} | ${cell(tech.join(', '))} | ${projectLinks(p.url, detail)} |`,
    );
  }
  return lines.join('\n');
}

// ---- jams, publications ----------------------------------------------------

function jamList() {
  return resume.jams
    .filter((j) => j.result)
    .map((j) => {
      if (!j.blurb) warnings.push(`jam "${j.title}": no "blurb" in resume_data.json, using its first bullet`);
      const yr = year(j.date);
      const title = j.title.replace(new RegExp(`\\s+${yr}$`), '');
      return `- **${title}** (${yr}): ${j.blurb || j.bullets[0]}`;
    })
    .join('\n');
}

function publicationList() {
  return resume.publications.map((p) => `- [${p.name}](${p.url}), ${p.publishing}, ${year(p.date)}`).join('\n');
}

// ---- tools -----------------------------------------------------------------

function toolList() {
  const skills = [...(resume.skills.top3 || []), ...(resume.skills.main || []), ...(resume.skills.other || [])];
  const groups = new Map();
  for (const s of skills) {
    if (!groups.has(s.category)) groups.set(s.category, []);
    groups.get(s.category).push({ name: s.name || s.title, icon: SKILL_ICONS[s.icon] });
  }
  const blocks = [];
  for (const [category, list] of groups) {
    const withIcon = list.filter((s) => s.icon);
    const plain = list.filter((s) => !s.icon).map((s) => s.name);
    const parts = [`**${category}**`];
    if (withIcon.length) {
      parts.push(`![${withIcon.map((s) => s.name).join(', ')}](https://skillicons.dev/icons?i=${withIcon.map((s) => s.icon).join(',')})`);
    }
    if (plain.length) parts.push(plain.join(', '));
    blocks.push(parts.join('\n\n'));
  }
  return blocks.join('\n\n');
}

// ---- page ------------------------------------------------------------------

const sections = [
  intro(),
  `## Right now\n\n${nowList()}`,
  `## Games\n\n${projectTable(true)}`,
  `## Other projects\n\n${projectTable(false)}`,
  `## Jams and challenges\n\n${jamList()}`,
  `## Publications\n\n${publicationList()}`,
  `## Tools\n\n${toolList()}`,
];

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
} else if (current === output) {
  console.log('README.md already up to date.');
} else {
  fs.writeFileSync(readmePath, output);
  console.log('Wrote README.md');
}
