# ai-skills

A collection of **Agent Skills**: `SKILL.md` folders that teach an AI agent a specific task. Each skill is packaged as a **Claude Code plugin**, and the folders follow the open [Agent Skills format](https://agentskills.io/specification), so other agents that read `SKILL.md` can use them too.

*Tiếng Việt: bộ sưu tập skill cho AI agent (định dạng SKILL.md). Cài vào Claude Code dưới dạng plugin, hoặc copy thư mục skill sang agent khác có hỗ trợ Agent Skills.*

## Skills

| Skill | What it does | Tested with |
|---|---|---|
| [**shopee-vn**](plugins/shopee-vn/) | Shop on **Shopee Vietnam** from your own logged-in browser: sweep listings, re-price the exact variant, flag bait/used/mislabelled listings, and find which of your vouchers really apply to get the **true checkout price**. | Claude Code + Claude in Chrome |

## Install

**Claude Code** (all skills in this repo become available to install):

```
/plugin marketplace add exfox15157/ai-skills
/plugin install shopee-vn@ai-skills
```

**Any other agent that supports Agent Skills:** copy the skill folder, e.g. `plugins/shopee-vn/skills/shopee-vn/`, into that agent's skills directory.

**Claude Code without the plugin system:** copy the same folder to `~/.claude/skills/<skill-name>/`.

## Layout

```
.claude-plugin/marketplace.json      catalogue of plugins (read by Claude Code only)
plugins/<plugin>/
  .claude-plugin/plugin.json         plugin manifest
  README.md                          docs for that skill
  skills/<skill>/SKILL.md            the skill itself (Agent Skills format)
scripts/pii-scan.js                  blocks personal data from being committed
```

## Contributing / privacy

Skills here run against real accounts, so CI runs `scripts/pii-scan.js` on every push to catch emails, phone numbers, card digits, signed URLs and local user paths. Never commit a skill's `data/` caches after using it.

## License

[MIT](LICENSE). Each skill's README states anything specific to it, such as disclaimers about third-party services.
