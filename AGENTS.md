# shaadqrsh profile README

This repo is Shaad's GitHub profile (github.com/shaadqrsh). It lives inside the portfolio repo's working copy at `shaad-portfolio/portfolio_entry/`, and the portfolio repo ignores the folder. It is its own git repo with its own remote.

## Never edit README.md by hand

`README.md` is generated. Running `node scripts/build_readme.mjs` overwrites it. Edit one of these instead:

| What you're changing | Where |
| --- | --- |
| Intro, "Right now", links bar, Tools icons, section headings | `README.template.md` (hand-written; Shaad maintains it) |
| A project's short blurb, trimmed tech list, display name, or hiding it | `readme.config.json` → `projects.<slug>` |
| Row order in a table | `readme.config.json` → `sections.<games\|projects>.order` |
| A jam's one-line summary, display name, hiding it, order | `readme.config.json` → `jams`, `jamOrder` |
| Rows that aren't in the resume data (e.g. shaadqrsh.com) | `readme.config.json` → `sections.projects.extra` |
| How link labels map to Play / Live / Code | `readme.config.json` → `linkLabels` (null drops the link) |
| Titles, dates, categories, links, technologies | The portfolio repo: `src/lib/resume_data.json` and `src/lib/projectId.ts`. Don't edit those from here unless asked. |

Placeholders in the template: `{{games}}`, `{{projects}}`, `{{jams}}`, `{{publications}}`.

## Regenerating

```sh
node scripts/build_readme.mjs           # write README.md
node scripts/build_readme.mjs --check   # exit 1 if README.md is stale
```

The script reads the portfolio data from `..` by default (`--portfolio <dir>` or `PORTFOLIO_DIR` overrides it) and needs that repo's `node_modules` installed, because it loads `projectId.ts` with the portfolio's `jiti`.

Warnings mean a project or jam has no hand-written entry in `readme.config.json`, so the README falls back to the resume description or first bullet. Treat a warning as a to-do.

## Writing a blurb for a new project

When the script warns about a missing `about`:

1. Read the project's entry in `projectId.ts` (`desc`, `features`, `responsibilities`, `additional`) and its `resume_data.json` record.
2. Write an `about` of one to three short sentences. Say what it is, what's interesting about it, and (for team projects) what Shaad did. Match the existing blurbs in `readme.config.json`.
3. Pick a `tech` list of 2 to 6 items: the stack someone would recognise, not every tool.
4. Add the slug to the right `order` list.
5. Regenerate, then show Shaad the diff of `readme.config.json` and `README.md`.

Style: plain first person, short sentences, concrete numbers. No marketing words ("cutting-edge", "seamless", "passionate"), no em dashes, no bold inside table cells beyond the title. Don't state anything the data files don't support. If a fact is missing or the two data files disagree, ask instead of guessing.

## Boundaries

- Don't commit or push without Shaad saying so. This README is public.
- `Project GDDs/` holds private design docs and is gitignored here. Never copy its contents into tracked files or the README.
- Leave the template's hand-written sections alone unless asked.
