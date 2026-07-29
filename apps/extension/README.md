![Loccy](https://loccy.dev/img/cover.png)

# Loccy — modern i18n helper for React & Vue apps

Every keypath in your code shows its real translation inline. Hover it to read all locales, edit any of them in place, jump to every usage, rename globally. No more digging through JSON files.

![Loccy hover menu showing all translations for a keypath with quick actions](https://loccy.dev/extension-features/hover.png)

Works with **react-i18next**, **next-intl** and **vue-i18n**, in all VS Code based editors.

Docs → [loccy.dev/docs/extension](https://loccy.dev/docs/extension)

> **Note:** the legacy `loccy.config.json` is replaced by `loccy.yaml`. If you already have a JSON config, run **`Loccy: Migrate loccy.config.json to loccy.yaml`** from the Command Palette to convert it.

<br>

## Setup

Loccy auto-detects the i18n setup of any open project. Zero-config, covers most projects.

Still, add a `loccy.yaml` (run `Loccy: Create Config File` from the Command Palette). It's where you tune or override detection, and the only place to define the AI styleguide: rules like "de: use informal 'du' instead of 'Sie'", set once and applied to every AI translation.

<br>

## Showcase: core features

> 💡 Prefer video over GIFs? Same walkthrough in the docs: [loccy.dev/docs/extension/core-features](https://loccy.dev/docs/extension/core-features)

### 1 • Edit in place

Click the pencil button next to a translation in the hover menu to edit it directly. The change is written back to the JSON file without leaving your component. To edit every locale at once, click the three dots and choose **Edit all translations manually**.

![Editing a translation in place from the Loccy hover menu](https://loccy.dev/extension-features/gif/inline-editor.gif)

### 2 • Usage map

The hover menu always lists every place in the project where the keypath is used. Check whether a message is shared before changing its wording, and jump straight to any usage.

![Jumping from the hover menu to a keypath usage in code](https://loccy.dev/extension-features/gif/usages-navigation.gif)

A popular bonus use: find a place in code by text. Paste a string copied from the rendered page into the editor's search, then hover the matching value in the JSON file. Loccy shows every place it's used.

![Finding the code behind a rendered string by hovering its value in a JSON file](https://loccy.dev/extension-features/gif/find-place-in-code-by-text.gif)

### 3 • Global keypath rename

Click the three dots in the hover menu and choose rename. Loccy renames the keypath everywhere, in all translation files and all code usages, in one operation.

![Renaming a keypath across translation files and code usages at once](https://loccy.dev/extension-features/gif/rename-key.gif)

### 4 • Insert existing message

Reuse a translation that already exists instead of creating a duplicate. Place your cursor where the keypath should go, run `Loccy: Insert Existing Message...`, then pick the message.

![Inserting an existing message at the cursor from the Command Palette](https://loccy.dev/extension-features/gif/use-existing.gif)

### 5 • Missing-translation warnings

When a keypath has at least one empty or missing translation, the inline preview shows a warning listing the affected locales. Partial-override locales are excluded, their empty keys are intentional.

![Inline preview showing a missing-translation warning listing the affected locales](https://loccy.dev/extension-features/missing-translation-warning.png)

<br>

## Showcase: AI features

Need a paid subscription, which also helps fund the project. New accounts get free requests to start.

Every action follows your `loccy.yaml` styleguide, so results match your project's voice without repeating instructions.

> 💡 Prefer video over GIFs? Same walkthrough in the docs: [loccy.dev/docs/extension/ai-features](https://loccy.dev/docs/extension/ai-features)

### 1 • Extract and Translate

Turns static text into a message in one step: generates the keypath and translations for all project locales. Place your cursor inside the static text and run `Loccy: Extract and Translate` (also in the editor context menu).

No selection needed: other extensions make you select the full text, Loccy resolves the boundaries from a cursor sitting anywhere inside the string. A small detail, and a lot of work went into getting it right.

![Extracting static text into a keypath translated across all locales](https://loccy.dev/extension-features/gif/extract-and-translate.gif)

### 2 • Suggest Contextual Translation

Creates a message based on the surrounding code, for when you know a spot needs text but haven't drafted it yet. Place your cursor in the desired location and run `Loccy: Suggest Contextual Translation`.

![Generating a message from surrounding code context](https://loccy.dev/extension-features/gif/insert-contextual.gif)

### 3 • Edit one translation, sync the rest

When you edit a translation from the hover menu, Loccy offers to update all other locales to match. Adjust the copy once in your native language and keep every locale consistent.

![Syncing all other locales after editing a single translation](https://loccy.dev/extension-features/gif/sync-others.gif)

### 4 • Fill empty translations

Auto-fills all empty translations in a message. Click the three dots in the hover menu; the option appears when at least one translation is empty and at least one is filled.

![Auto-filling the empty translations of a message](https://loccy.dev/extension-features/gif/fill-missing.gif)

### 5 • Adjust with a prompt

Rewrite text with a free-form instruction. For all translations at once, click the three dots in the hover menu. For a single one, click the pencil button, then choose **Adjust with prompt...**.

![Rewriting translations with a free-form prompt](https://loccy.dev/extension-features/gif/prompt.gif)

<br>

## Links

[Website](https://loccy.dev) • [GitHub](https://github.com/loccy-dev/monorepo) • [Discord](https://discord.gg/btztGrejXU)