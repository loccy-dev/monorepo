---
name: author-styleguide
description: Write or extend the `styleguide` in loccy.yaml, the rules every later translation is checked against. Use when the styleguide is empty or still the commented-out scaffold, when asked to write down translation or wording rules, when a project's tone or terminology should be captured, or when the user keeps correcting the same thing in generated copy.
allowed-tools: Bash(loccy-tool:*), WebFetch
---

# Author the styleguide

The half of `loccy.yaml` that makes every later message match the product.

Config schema: https://loccy.dev/schemas/config.schema.json


## Recommended volume

| Field | Volume |
| :--- | :--- |
| `product` | 1-2 sentences |
| `voice` | 1 sentence |
| `mechanics` | 1-4 sentences |
| `localeRules.<code>` | 1-3 short rules with examples do/don't |
| `doNotTranslate` | 1-5 terms |
| `glossary` | scales with the corpus: 5-10 entries around 200 keys, 20-30 around 3000 |
| `keys` | 1 sentence or if nothing special to define better to omit |

Well over that usually means rules were invented rather than observed, when creating from scratch.


## Search

When searching for existing copy, `loccy-tool search` may help.

!`loccy-tool search --help`


# Best practices

- Duplicating the information across styleguide is highly unwanted. Each section must serve its purpose exactly. No cross-referencing of other fields or locales.
- Never state what a competent translator does by default (preserve placeholders and markup, keep plural forms). The test: if deleting a rule would not change a single translation of this product, don't write it.
- If locale is partial override by design inheriting other, specify it with {extends, style} schema in `localeRules`


# Example of small demo project's styleguide

!`loccy-tool styleguide-example`
