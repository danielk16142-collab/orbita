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
