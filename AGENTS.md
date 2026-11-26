# shaadqrsh profile README

This repo is Shaad's GitHub profile (github.com/shaadqrsh). It lives inside the portfolio repo's working copy at `shaad-portfolio/portfolio_entry/`, and the portfolio repo ignores the folder. It is its own git repo with its own remote.

## Never edit README.md by hand

`README.md` is generated. Running `node scripts/build_readme.mjs` overwrites it. Edit one of these instead:

| What you're changing | Where |
| --- | --- |
| Intro, "Right now", links bar, Tools icons, section headings | `README.template.md` (hand-written; Shaad maintains it) |
| Rows that aren't in the resume data (e.g. shaadqrsh.com) | `README.template.md`, as a table row on the line straight after `{{projects}}` |
| A project's or jam's short blurb | The portfolio repo: `src/lib/resume_data.json` → `projects[].blurb` or `jams[].blurb` |
| A project's "Built with" list | The first 5 entries of its `technologies` in `projectId.ts` (`TECH_COUNT` in the script). Reorder that list to change what shows. |
| Row order in any table or list | The order of `projects`, `jams` and `publications` in `resume_data.json` |
| Titles, dates, links, technologies | The portfolio repo: `src/lib/resume_data.json` and `src/lib/projectId.ts` |

The script applies a few fixed rules, all at the top of `scripts/build_readme.mjs`:

- A title shows only the part before " - " ("HOMI - Helpful Online Mentor Interface" becomes "HOMI"). A jam title drops its trailing year, since the year follows in brackets.
- Jams with no `result` in `resume_data.json` are left out.
- GitHub links read "Code", download links are dropped, and other links read "Play" on games and "Live" on everything else. Games also get a "More" link to their page on the site.

Placeholders in the template: `{{games}}`, `{{projects}}`, `{{jams}}`, `{{publications}}`.

## Regenerating

```sh
node scripts/build_readme.mjs           # write README.md
node scripts/build_readme.mjs --check   # exit 1 if README.md is stale
```

The script reads the portfolio data from `..` by default (`--portfolio <dir>` or `PORTFOLIO_DIR` overrides it) and needs that repo's `node_modules` installed, because it loads `projectId.ts` with the portfolio's `jiti`.

Warnings mean a project or jam has no `blurb` in `resume_data.json`, so the README falls back to its `desc` or first bullet. Treat a warning as a to-do.

## Writing a blurb for a new project

When the script warns about a missing `blurb`:

1. Read the project's entry in `projectId.ts` (`desc`, `features`, `responsibilities`, `additional`) and its `resume_data.json` record.
2. Write a `blurb` of one to three short sentences in that record, right after `desc`. Say what it is, what's interesting about it, and (for team projects) what Shaad did. Match the existing blurbs. Jam blurbs are one line, after `bullets`.
3. Check that the first five `technologies` in `projectId.ts` are the stack someone would recognise. If they aren't, suggest a reorder to Shaad rather than doing it, because the site uses that order too.
4. Regenerate, then show Shaad the diff of `resume_data.json` and `README.md`.

Style: plain first person, short sentences, concrete numbers. No marketing words ("cutting-edge", "seamless", "passionate"), no em dashes, no bold inside table cells beyond the title. Don't use a colon to introduce a list or explanation ("a tracker for a course: plan workouts, log sets, ..."). Write separate sentences instead ("A tracker built for a course. You plan workouts and log sets."). Don't state anything the data files don't support. If a fact is missing or the two data files disagree, ask instead of guessing.

## Boundaries

- Don't commit or push without Shaad saying so. This README is public.
- Shaad's game design docs are private and kept outside this repo. Never add them here or copy their contents into the README.
- Leave the template's hand-written sections alone unless asked.
