# LinkedIn agent skills

Eleven Claude Code skills (`/li-post`, `/li-comment`, `/li-reply`, `/li-profile`, `/li-plan`, `/li-human`, `/li-carousel`, `/li-repurpose`, `/li-dm`, `/li-inbox`, `/li-audit`) installed in `.claude/skills/` so any Claude Code session opened on this repo can use them.

- Source: https://github.com/Jakeschincariol/linkedin-agent-skill (MIT, commit `add2c23882fe79180737d242ff80a5da205eda6a`; license kept at `.claude/skills/li-LICENSE`).
- Reviewed before install: the two Python tools (`li-human/humanize.py`, `li-human/detect.py`) use the standard library only, no network, no API keys, no install-time code; they write a file only with an explicit `--out`.
- Voice profile: copy `docs/li-voice-template.md` to `~/.claude/linkedin/voice.md` and fill it in (per user, not committed). The skills read it.
- These skills do not post anything to LinkedIn: they write, a person posts.

## In the app
- **Hook formulas**: the 21 LinkedIn formulas (`packages/content/src/li/data/hooks.json`, unchanged) and the hook rules. The agent gets them with the `linkedin_hook_formulas` tool and picks three that fit the idea.
- **Post check**: `lintLinkedInPost` (`packages/content/src/li/post.ts`) follows the li-post rules: hook alone on line 1 within about 140 characters (mobile "see more"), 900-1,300 characters, short paragraphs, at most 3 hashtags at the bottom, no links in the body (first comment instead), no engagement bait, one close, no `{{placeholder}}` left. The Quality check card uses it for LinkedIn posts (Instagram and the others keep the Instagram caption check); the agent has it as `lint_linkedin_post`.
- **Agent rules**: a LinkedIn section in the system prompt (hooks, shape, length, close, hashtags, links, never invent a number). The post chat for text posts and articles has both LinkedIn tools.
- **Humanizer**: the LinkedIn lexicon is already contained in the Instagram one the app uses (every word, phrase, structure and invisible class), so nothing changed there.
- Not ported yet: profile scoring (`li-profile/rubric.json`), comments, replies, DMs, inbox triage and the post-mortem audit.
