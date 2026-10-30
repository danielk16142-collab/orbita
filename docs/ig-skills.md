# Instagram agent skills

Thirteen Claude Code skills (`/ig-reel`, `/ig-carousel`, `/ig-caption`, `/ig-viral`, `/ig-human`, `/ig-profile`, `/ig-plan`, `/ig-story`, `/ig-comment`, `/ig-reply`, `/ig-dm`, `/ig-repurpose`, `/ig-audit`) installed in `.claude/skills/` so any Claude Code session opened on this repo can use them.

- Source: https://github.com/Jakeschincariol/instagram-agent-skill (MIT, commit `d03c56bb598be770c60b201f94237e5d1a4268a6`; license kept at `.claude/skills/ig-LICENSE`).
- Reviewed before install: Python 3 standard library only, no network, no API keys, no install-time code; files are written only with an explicit `--out`/path argument.
- Voice profile: copy `docs/ig-voice-template.md` to `~/.claude/instagram/voice.md` and fill it in (per user, not committed). The skills read it.
- Tools run locally, e.g. `python3 .claude/skills/ig-reel/hookscore.py hooks.txt` and `python3 .claude/skills/ig-reel/beats.py script.txt --target 30`.
- These skills are separate from the Orbita app; they do not post anything to Instagram.
