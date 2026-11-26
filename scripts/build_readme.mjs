#!/usr/bin/env node
// Builds README.md from README.template.md plus the portfolio's data files.
//
// Data comes from the portfolio repo (by default two folders up from here):
//   src/lib/resume_data.json  titles, dates, blurbs, jams, publications
//   src/lib/projectId.ts      per-project links and technologies
// Everything else comes from the rules below. Rows follow the order of the
// arrays in resume_data.json. Hand-written rows and text go in the template.
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
const template = fs.readFileSync(path.join(repoDir, 'README.template.md'), 'utf8');

const warnings = [];
const year = (date) => (date || '').split('/').pop();
const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const site = resume.websiteUrl.replace(/\/$/, '');

// How many technologies from projectId.ts go in the "Built with" column.
const TECH_COUNT = 5;

// "HOMI - Helpful Online Mentor Interface" shows as "HOMI".
const shortTitle = (title) => title.split(' - ')[0];
// "GMTK Game Jam 2026" shows as "GMTK Game Jam", since the year follows it.
const jamTitle = (title, yr) => title.replace(new RegExp(`\\s+${yr}$`), '');

// GitHub links read "Code", other links "Play" for games and "Live" for the
// rest. Download links are left out, because each game also has a page to play
// it from.
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
  // Games link to their page on the site too.
  if (detail?.game) links.push({ label: 'More', url: `${site}/projects/${slug}` });
  return links;
}

const renderLinks = (links) => links.map((l) => `[${l.label}](${l.url})`).join(' · ');

function projectTable(game) {
  const lines = [`| ${game ? 'Game' : 'Project'} | About | Built with | Links |`, '| --- | --- | --- | --- |'];
  for (const p of resume.projects.filter((p) => Boolean(projectDetails[p.url]?.game) === game)) {
    const detail = projectDetails[p.url];
    if (!detail) warnings.push(`${p.url}: no entry in projectId.ts, so no links or tech`);
    if (!p.blurb) warnings.push(`${p.url}: no "blurb" in resume_data.json, using its desc`);
    const tech = (detail?.technologies || []).slice(0, TECH_COUNT).map((t) => t.name);
    lines.push(
      `| **${cell(shortTitle(p.title))}** (${year(p.date)}) | ${cell(p.blurb || p.desc)} | ${cell(tech.join(', '))} | ${renderLinks(projectLinks(p.url, detail))} |`,
    );
  }
  return lines.join('\n');
}

// Jams with no result in resume_data.json (no placing or rating) are left out.
function jamList() {
  return resume.jams
    .filter((j) => j.result)
    .map((j) => {
      if (!j.blurb) warnings.push(`jam "${j.title}": no "blurb" in resume_data.json, using its first bullet`);
      return `- **${jamTitle(j.title, year(j.date))}** (${year(j.date)}): ${j.blurb || j.bullets[0]}`;
    })
    .join('\n');
}

function publicationList() {
  return resume.publications.map((p) => `- [${p.name}](${p.url}), ${p.publishing}, ${year(p.date)}`).join('\n');
}

const blocks = {
  games: () => projectTable(true),
  projects: () => projectTable(false),
  jams: jamList,
  publications: publicationList,
};

const body = template.replace(/\r\n/g, '\n').replace(/\{\{(\w+)\}\}/g, (match, key) => {
  if (!blocks[key]) {
    console.error(`README.template.md uses unknown placeholder ${match}`);
    process.exit(2);
  }
  return blocks[key]();
});

const header =
  '<!-- Generated by scripts/build_readme.mjs from README.template.md and the portfolio data. Edit those, not this file. -->\n\n';
const output = header + body;

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
