// Reads a GitHub user's contribution calendar for the README's activity card:
// the last 12 months for the grid, and every year back to the first for the
// longest streak. Needs a token (any token can read public profile data):
// GITHUB_TOKEN or GH_TOKEN, or `gh auth token` when run locally.

import { execSync } from 'node:child_process';

export function githubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    return execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

async function graphql(token, query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-readme' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status} ${res.statusText}`);
  const body = await res.json();
  if (body.errors) throw new Error(`GitHub GraphQL: ${body.errors.map((e) => e.message).join('; ')}`);
  return body.data;
}

const CALENDAR = 'contributionCalendar{totalContributions weeks{contributionDays{date contributionCount contributionLevel}}}';

export async function fetchActivity(login, token) {
  const base = await graphql(token, `query($l:String!){user(login:$l){contributionsCollection{contributionYears ${CALENDAR}}}}`, { l: login });
  if (!base.user) throw new Error(`GitHub user "${login}" not found`);
  const recent = base.user.contributionsCollection;
  const weeks = recent.contributionCalendar.weeks.map((w) =>
    w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount, level: d.contributionLevel })),
  );
  const lastYear = weeks.flat();

  // Every day since the first year, for the longest streak.
  const counts = new Map();
  const now = new Date();
  for (const y of recent.contributionYears) {
    const to = y === now.getUTCFullYear() ? now.toISOString() : `${y}-12-31T23:59:59Z`;
    const data = await graphql(
      token,
      `query($l:String!,$f:DateTime!,$t:DateTime!){user(login:$l){contributionsCollection(from:$f,to:$t){${CALENDAR}}}}`,
      { l: login, f: `${y}-01-01T00:00:00Z`, t: to },
    );
    for (const w of data.user.contributionsCollection.contributionCalendar.weeks)
      for (const d of w.contributionDays) counts.set(d.date, d.contributionCount);
  }
  for (const d of lastYear) counts.set(d.date, d.count);
  const all = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));

  let longest = { length: 0, start: null, end: null };
  let run = 0, runStart = null;
  for (const [date, n] of all) {
    if (n > 0) {
      if (run === 0) runStart = date;
      run++;
      // >= so a tie goes to the more recent streak.
      if (run >= longest.length) longest = { length: run, start: runStart, end: date };
    } else run = 0;
  }

  // The current streak counts back from today. A day with nothing yet today
  // doesn't break it, since today isn't over.
  const current = { length: 0, start: null };
  for (let i = all.length - 1; i >= 0; i--) {
    const [date, n] = all[i];
    if (n > 0) {
      current.length++;
      current.start = date;
    } else if (i === all.length - 1) continue;
    else break;
  }
  const lastDay = [...all].reverse().find(([, n]) => n > 0)?.[0] ?? null;

  return {
    weeks,
    total: recent.contributionCalendar.totalContributions,
    activeDays: lastYear.filter((d) => d.count > 0).length,
    current,
    longest,
    lastDay,
  };
}

// Kept for the languages card, which isn't in the README yet: bytes of code
// per language across the user's own non-fork repos, as percentages.
export async function fetchLanguages(login, token, { ignoreRepos = [], ignoreLanguages = [], top = 5 } = {}) {
  const data = await graphql(
    token,
    `query($l:String!){user(login:$l){repositories(first:100,ownerAffiliations:OWNER,isFork:false){nodes{name languages(first:20,orderBy:{field:SIZE,direction:DESC}){edges{size node{name}}}}}}}`,
    { l: login },
  );
  const bytes = new Map();
  for (const repo of data.user.repositories.nodes) {
    if (ignoreRepos.includes(repo.name)) continue;
    for (const e of repo.languages.edges) {
      if (ignoreLanguages.includes(e.node.name)) continue;
      bytes.set(e.node.name, (bytes.get(e.node.name) || 0) + e.size);
    }
  }
  const total = [...bytes.values()].reduce((a, b) => a + b, 0) || 1;
  return [...bytes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([name, size]) => ({ name, percent: Math.round((size / total) * 1000) / 10 }));
}
