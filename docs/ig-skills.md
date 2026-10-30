# Instagram agent skills

Thirteen Claude Code skills (`/ig-reel`, `/ig-carousel`, `/ig-caption`, `/ig-viral`, `/ig-human`, `/ig-profile`, `/ig-plan`, `/ig-story`, `/ig-comment`, `/ig-reply`, `/ig-dm`, `/ig-repurpose`, `/ig-audit`) installed in `.claude/skills/` so any Claude Code session opened on this repo can use them.

- Source: https://github.com/Jakeschincariol/instagram-agent-skill (MIT, commit `d03c56bb598be770c60b201f94237e5d1a4268a6`; license kept at `.claude/skills/ig-LICENSE`).
- Reviewed before install: Python 3 standard library only, no network, no API keys, no install-time code; files are written only with an explicit `--out`/path argument.
- Voice profile: copy `docs/ig-voice-template.md` to `~/.claude/instagram/voice.md` and fill it in (per user, not committed). The skills read it.
- Tools run locally, e.g. `python3 .claude/skills/ig-reel/hookscore.py hooks.txt` and `python3 .claude/skills/ig-reel/beats.py script.txt --target 30`.
- These skills are separate from the Orbita app; they do not post anything to Instagram.

## In the app (phase 1: post review)
The Python tools were ported to TypeScript in `packages/content/src/ig/` (hooks, beats, caption, humanize/detect; data in `ig/data/`), with parity tests against the upstream outputs (`ig.test.ts`). They run locally in the server/browser; nothing is sent anywhere.

- **Quality check** card on every post (staff only, `components/posts/post-review.tsx`): opening-line score and formula, reel timing, caption as the feed shows it (125-character cut), "sounds human" panel, and a **Clean text** button (`cleanPostTextAction`: removes long dashes, curly quotes, hidden characters and stock words from caption and content; hashtags untouched; editing an approved post sends it back to draft). Suggestions only: nothing blocks approval.
- **Agent**: non-strict tools `score_hooks` and `lint_caption`, reel/caption/"write like a person" rules in the system prompt, and agent post drafts are cleaned when accepted (`proposalToOps`).
- Heuristics are tuned for English; for es/fr only format and typography checks are reliable (the card says so).
- No database changes in this phase.

## In the app (competitors: what's working)
Port of `/ig-viral` and `swipe.py` (`packages/content/src/ig/swipe.ts`): each recorded competitor post is ranked by how many times it beat that account's own median (views, else likes+comments+shares; no baseline with fewer than 3 comparable posts), and the hook formula is named from the 26 formulas.

- Table `competitor_posts` (migration `0021_competitor_posts.sql`, RLS like `competitor_analyses`: anyone with access to the client reads/adds, only staff delete).
- Data is entered by hand (one post with its numbers, or several pasted as `views | likes | opening line`); links are validated but never opened. The `source` column leaves room for Meta Business Discovery or a scraper later (not built).
- UI: "What's working" on each competitor page and a swipe file on the competitors list; **Make our version** opens the agent chat with a prepared request (same structure, our own words and approved claims, hooks scored with `score_hooks`).

## Where the humanizer runs
Automatically (server-side, on save): agent post drafts when accepted, week-plan captions and ideas when accepted, text saved from the post chat (new post or into a planned post). On demand: the **Clean text** button on the Quality check card. Not touched: text typed by hand in the post editor (only scored by the card) and chat replies that are not saved. Typography and hidden characters are cleaned in every language; the stock-word list is English only.
