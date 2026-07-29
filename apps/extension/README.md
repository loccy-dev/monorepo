![Hero](https://loccy.dev/readme/cover.png)

# Loccy — AI i18n helper for React & Vue apps

> **Upgrading?** The legacy `loccy.config.json` is replaced by `loccy.yaml`. If you already have a JSON config, run **`Loccy: Migrate loccy.config.json to loccy.yaml`** from the Command Palette to convert it.

Loccy combines essential i18n functionality (like inline previews and in-place editing) with fine-tuned AI workflows, available right where and when you need them.

## **Supported frameworks**
- react-i18next
- next-intl
- vue-i18n

## **Setup**

- Once installed, Loccy will auto-detect the i18n setup for any open project.
- For advanced configuration, run `Loccy: Create Config File` from the Command Palette. This creates `loccy.yaml`, with IntelliSense for every setting.
- AI answers follow the `styleguide` section of your config: global project rules, per-locale rules (e.g., "de: use informal 'du' instead of 'Sie'"), and key-naming rules (e.g., "use snake_case"). See the [styleguide docs ↗](https://loccy.dev/docs/config#styleguide).

## **Features**

| **Basics** | |
| :--- | :--- |
| Inline translation preview | Always visible. |
| Quick in-place editing | Click 'pencil' button in the hover menu. |
| Edit all translations at once | Click the 3 dots in the hover menu and choose 'Edit all translations manually'. |
| Message's usages map | Always displayed in the hover menu. |
| Global keypath renaming | Click the 3 dots in the hover menu. |
| Quick existing message insertion | Place your cursor in the desired location and run `Loccy: Insert Existing Message...` |
| Missing-translation warnings | The inline preview flags any locales with empty or missing translations. |

[See in action ↗](https://loccy.dev/docs/extension/core-features)

<br>

| **Translate/Adjust with AI** | |
| :--- | :--- |
| Extract static text to message | Generates the keypath and all its translations. Place your cursor in the text and run `Loccy: Extract and Translate` from the Command Palette. |
| Create a message based on surrounding code | Place your cursor in the desired location and run `Loccy: Suggest Contextual Translation` |
| Edit a single translation and sync all others | This action appears when you edit a translation from the hover menu. |
| Auto-fill all empty translations in a message | Click the 3 dots in the hover menu. This option is available if at least one translation is empty and at least one is filled. |
| Adjust text with a prompt | For all translations at once, click the 3 dots in the hover menu. For a single translation, click 'pencil' then choose 'Adjust with prompt...'. |

[See in action ↗](https://loccy.dev/docs/extension/ai-features)

## **Pricing**

- All basic features are free.
- AI assistance needs paid subscription. See [Loccy.dev](https://loccy.dev) for current pricing.

## **Links**
- [Loccy.dev](https://loccy.dev): Official website. Trial, and subscription management.
- [Documentation](https://loccy.dev/docs): Setup, configuration, and styleguide guides.
- [GitHub](https://github.com/loccy-dev/monorepo): Source code, issues, and feature requests.
- [Discord](https://discord.gg/btztGrejXU): News, bug reports, feature requests, and random conversations.
- [hello@loccy.dev](mailto:hello@loccy.dev): Main email. Every message is valued and is answered as soon as possible.
