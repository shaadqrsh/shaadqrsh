#!/usr/bin/env node
// Builds README.md from README.template.md plus the portfolio's data files.
//
// Data comes from the portfolio repo (by default two folders up from here):
//   src/lib/resume_data.json  titles, dates, descriptions, jams, publications
//   src/lib/projectId.ts      per-project links and technologies
// Hand-tuned wording (short blurbs, trimmed tech lists, hidden rows) lives in
// readme.config.json next to the template.
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
const config = JSON.parse(fs.readFileSync(path.join(repoDir, 'readme.config.json'), 'utf8'));
const template = fs.readFileSync(path.join(repoDir, 'README.template.md'), 'utf8');

const warnings = [];
const year = (date) => (date || '').split('/').pop();
const cell = (text) => String(text).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
const site = resume.websiteUrl.replace(/\/$/, '');

function projectLinks(slug, detail, showMore) {
  const order = config.linkOrder;
  const links = (detail?.urls || [])
    .map((u) => ({ label: config.linkLabels[u.label], url: u.url, original: u.label }))
    .filter((l) => {
      if (l.label === undefined) warnings.push(`${slug}: unknown link label "${l.original}", add it to linkLabels`);
      return l.label; // null in linkLabels means "leave this link out"
    })
    .sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  if (showMore) links.push({ label: 'More', url: `${site}/projects/${slug}` });
  return links;
}

const renderLinks = (links) => links.map((l) => `[${l.label}](${l.url})`).join(' · ');

// Items named in `order` come first, in that order. Anything not listed (a
// newly added project, say) follows in its resume_data.json order, so new
// entries still show up before you've placed them.
function applyOrder(items, order, keyOf) {
  if (!order) return items;
  const rank = (item) => {
    const i = order.indexOf(keyOf(item));
    return i < 0 ? order.length : i;
  };
  return items.map((item, i) => ({ item, i })).sort((a, b) => rank(a.item) - rank(b.item) || a.i - b.i).map((x) => x.item);
}

function projectTable(sectionKey) {
  const section = config.sections[sectionKey];
  const inSection = resume.projects
    .filter((p) => Boolean(projectDetails[p.url]?.game) === section.game)
    .filter((p) => !config.projects[p.url]?.hide);
  const rows = applyOrder(inSection, section.order, (p) => p.url)
    .map((p) => {
      const o = config.projects[p.url] || {};
      const detail = projectDetails[p.url];
      if (!detail) warnings.push(`${p.url}: no entry in projectId.ts, so no links or tech`);
      if (!o.about) warnings.push(`${p.url}: no "about" in readme.config.json, using the resume description`);
      const tech = o.tech || (detail?.technologies || []).slice(0, config.defaultTechCount).map((t) => t.name);
      return {
        title: o.name || p.title,
        year: year(p.date),
        about: o.about || p.desc,
        tech,
        links: projectLinks(p.url, detail, section.moreLink),
      };
    });
  rows.push(...(section.extra || []));

  const lines = ['| Game | About | Built with | Links |'.replace('Game', section.firstColumn), '| --- | --- | --- | --- |'];
  for (const r of rows) {
    lines.push(`| **${cell(r.title)}** (${r.year}) | ${cell(r.about)} | ${cell(r.tech.join(', '))} | ${renderLinks(r.links)} |`);
  }
  return lines.join('\n');
}

function jamList() {
  const visible = resume.jams.filter((j) => !config.jams[j.title]?.hide);
  return applyOrder(visible, config.jamOrder, (j) => j.title)
    .map((j) => {
      const o = config.jams[j.title] || {};
      if (!o.line) warnings.push(`jam "${j.title}": no "line" in readme.config.json, using its first bullet`);
      return `- **${o.name || j.title}** (${year(j.date)}): ${o.line || j.bullets[0]}`;
    })
    .join('\n');
}

function publicationList() {
  return applyOrder(resume.publications, config.publicationOrder, (p) => p.url)
    .map((p) => {
      const o = config.publications?.[p.url] || {};
      return `- [${o.name || p.name}](${p.url}), ${p.publishing}, ${year(p.date)}`;
    })
    .join('\n');
}

const blocks = {
  games: () => projectTable('games'),
  projects: () => projectTable('projects'),
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
  '<!-- Generated by scripts/build_readme.mjs from README.template.md, readme.config.json and the portfolio data. Edit those, not this file. -->\n\n';
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
