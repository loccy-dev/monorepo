import * as Diff from 'diff'
import { DiffReviewProps, DiffPreviewOptions, DiffEntries } from './save-with-diff-review'
import { OverrideResolution } from '@repo/types/ai-action.types'
import { cfg } from '../../global-config'

// --- UTILITIES ---

const keybindingDivider = () => (cfg.isMacOs ? '' : '<span class="keybinding-key-separator">+</span>')
const cmdBtn = () => (cfg.isMacOs ? '⌘' : 'Ctrl')
const returnBtn = () => 'Enter'

const escapeHtml = (str: string) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const renderLocaleCode = (localeCode: string) => {
  const nonBreakingHyphen = '&#8209;'
  return `<code class="locale-code">${escapeHtml(localeCode).replaceAll('-', nonBreakingHyphen)}</code>`
}

const generateDiffPart = (part: Diff.Change): string => {
  const className = part.added ? 'added' : part.removed ? 'removed' : 'common'
  return `<span class="diff-${className}">${escapeHtml(part.value)}</span>`
}

// --- HTML TEMPLATES ---

const emptyTemplate = () => `
  <div class="empty-state">No changes to review</div>
`

const unchangedTemplate = (key: string, value: string) => `
  <div class="locale-col">${renderLocaleCode(key)}</div>
  <div class="original-col unchanged-cell">${escapeHtml(value)}</div>
  <div class="changed-col unchanged-cell">${escapeHtml(value)}</div>
`

// Override left empty on purpose (inherits base at runtime) — muted note, no diff/edit.
const overrideNoteTemplate = (locale: string, base: string) => `
  <div class="locale-col">${renderLocaleCode(locale)}</div>
  <div class="original-col unchanged-cell"></div>
  <div class="changed-col unchanged-cell override-note">inherits ${renderLocaleCode(base)} — no override needed</div>
`

const changedTemplate = (
  key: string,
  keypath: string,
  originalDiffHtml: string,
  updatedDiffHtml: string,
  index: number,
) => `
  <div class="locale-col">${renderLocaleCode(key)}</div>
  <div class="original-col ${!originalDiffHtml ? 'empty' : ''}">${originalDiffHtml}</div>
  <div class="changed-col editable-cell ${!updatedDiffHtml ? 'empty' : !originalDiffHtml ? 'new' : ''}" data-key="${escapeHtml(
    key,
  )}" data-keypath="${escapeHtml(keypath)}" data-index="${index}">
    <div class="display-mode">
      <div class="content-display">${updatedDiffHtml}</div>
      <div class="edit-actions">
        <button class="edit-btn" title="Edit">Edit</button>
      </div>
    </div>
    <div class="edit-mode" style="display: none;">
      <div class="edit-input" contenteditable="true"></div>
      <div class="edit-actions">
        <button class="cancel-edit-btn" title="Cancel">Cancel</button>
        <button class="save-edit-btn" title="Save">Save</button>
      </div>
    </div>
  </div>
`

/** Locale rows for one keypath's diff table (no override notes — those render once per item). */
const generateKeypathRows = (
  keypath: string,
  originalObject: Record<string, string>,
  updatedObject: Record<string, string>,
  index: number,
): string => {
  const allKeys = [...new Set([...Object.keys(originalObject), ...Object.keys(updatedObject)])]

  return allKeys
    .map((key) => {
      const originalValue = originalObject[key] ?? ''
      const updatedValue = updatedObject[key] ?? ''

      if (originalValue === updatedValue) {
        return unchangedTemplate(key, originalValue)
      }

      const diff = Diff.diffChars(originalValue, updatedValue)

      const originalDiffHtml = diff
        .filter((part) => !part.added)
        .map((part) => (part.removed ? generateDiffPart(part) : escapeHtml(part.value)))
        .join('')

      const updatedDiffHtml = diff
        .filter((part) => !part.removed)
        .map((part) => (part.added ? generateDiffPart(part) : escapeHtml(part.value)))
        .join('')

      return changedTemplate(key, keypath, originalDiffHtml, updatedDiffHtml, index)
    })
    .join('')
}

/** All keypath sections for one review item, plus inherited-override notes shown once at the end. */
const generateItemContent = (
  originalObject: DiffEntries,
  updatedObject: DiffEntries,
  index: number,
  overrideResolutions?: OverrideResolution[],
): string => {
  const keypaths = [...new Set([...Object.keys(originalObject), ...Object.keys(updatedObject)])]
  const inherited = (overrideResolutions ?? []).filter((r) => !r.deviates)
  const multiKeypath = keypaths.length > 1

  if (keypaths.length === 0 && inherited.length === 0) {
    return `<div class="diff-table">${emptyTemplate()}</div>`
  }

  const sections = keypaths
    .map((keypath) => {
      const rows = generateKeypathRows(keypath, originalObject[keypath] ?? {}, updatedObject[keypath] ?? {}, index)
      const label = multiKeypath ? `<div class="keypath-label">${renderLocaleCode(keypath)}</div>` : ''
      return `${label}<div class="diff-table">
        <div class="diff-header">
          <div class="relaxed-uppercased">Locale</div>
          <div class="relaxed-uppercased">Original</div>
          <div class="relaxed-uppercased">Changed</div>
        </div>
        ${rows}
      </div>`
    })
    .join('')

  const overrideRows = inherited.map((r) => overrideNoteTemplate(r.locale, r.extends)).join('')
  const overrideBlock = overrideRows ? `<div class="diff-table">${overrideRows}</div>` : ''

  return sections + overrideBlock
}

// --- MAIN TEMPLATE ---

export const diffPreviewTemplate = (props: DiffReviewProps[], options: DiffPreviewOptions) => {
  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Loccy: Review and confirm</title>
    <style>
      :root {
        --border-color: var(--vscode-editorGroup-border);
        --body-bg: var(--vscode-sideBar-background);
        --surface-bg: var(--vscode-editor-background);
        --text-color: var(--vscode-foreground);
        --highlight-text-color: var(--vscode-textPreformat-foreground);
        --highlight-text-background-color: var(--vscode-textPreformat-background);
        --text-secondary-color: var(--vscode-descriptionForeground);
        --font-family: var(--vscode-font-family);
        --font-size: var(--vscode-font-size);
        --editor-font-size: var(--vscode-editor-font-size);
        --editor-font-family: var(--vscode-editor-font-family);
        --gap: 30px;
      }
      * {
        box-sizing: border-box;
      }
      body {
        font-family: var(--font-family);
        font-size: var(--font-size);
        color: var(--text-color);
        background-color: var(--body-bg);
        margin: 0;
        padding: 0;
        line-height: 1.4;
      }
      .container {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        padding: 12px;
        gap: var(--gap);
      }
      .main-content {
        display: flex;
        flex-direction: column;
        flex: 1;
        gap: var(--gap);
      }
      .review-list {
        display: flex;
        flex-direction: column;
        gap: var(--gap);
      }
      .review-item {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .relaxed-uppercased {
        font-weight: 400;
        font-size: calc(var(--editor-font-size) * 0.8);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .locale-code {
        font-weight: 400;
        padding-top: .1em;
        padding-bottom: .1em;
        background-color: var(--vscode-toolbar-hoverBackground);
        color: var(--text-color);
        font-family: var(--editor-font-family) !important;
        font-size: calc(var(--font-size) * 0.9);
      }
      .override-note {
        color: var(--text-secondary-color);
        font-style: italic;
        font-family: var(--font-family);
      }
      .keypath-label {
        padding: 8px 12px;
        font-family: var(--editor-font-family);
        font-size: calc(var(--editor-font-size) * 0.9);
        color: var(--text-secondary-color);
        border-bottom: 1px solid var(--border-color);
        background-color: var(--surface-bg);
      }
      .keypath-label:not(:first-child) {
        border-top: 1px solid var(--border-color);
      }
      .header {
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
      }
      .title {
        font-weight: 600;
        font-size: var(--editor-font-size);
        margin: 0;
      }
      .description {
        margin-top: 2px;
        margin-bottom: 0;
        font-size: var(--editor-font-size);
        opacity: 0.7;
        max-width: 40em;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 14px;
        font-size: var(--editor-font-size, 14px);
        font-weight: 500;
        border: 1px solid var(--vscode-button-border, transparent);
        border-radius: 2px;
        cursor: pointer;
        color: var(--vscode-button-foreground);
        background-color: var(--vscode-button-background);
      }
      .btn:hover {
        background-color: var(--vscode-button-hoverBackground);
      }
      .btn:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }
      .btn:disabled:hover {
        background-color: var(--vscode-button-background);
      }
      .content,
      .info-section {
        border: 1px solid var(--border-color);
        border-radius: 2px;
      }
      .info-wrapper {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .info-section {
        background-color: var(--surface-bg);
        font-family: var(--font-family);
        font-size: var(--editor-font-size);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: -4px;
      }
      .info-section:last-child {
        margin-bottom: 0;
      }
      .info-header {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .info-description {
        font-weight: 400;
        font-size: var(--editor-font-size);
        color: var(--text-secondary-color);
        margin: 0;
      }
      .info-section .divider {
        width: 100%;
        height: 1px;
        background-color: var(--border-color);
      }
      .translations {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .translations .locale-code {
        display: inline-block;
        margin-right: 2px;
      }
       .translations .highlight {
        font-weight: 500;
        background-color: var(--highlight-text-background-color);
        color: var(--highlight-text-color);
        border-radius: 2px;
        padding: 0 2px;
      }
      .diff-table {
        display: grid;
        grid-template-columns: min-content 1fr 1fr;
        width: 100%;
      }
      .diff-header {
        display: contents;
      }
      .diff-header > div {
        padding: 8px 12px;
        border-bottom: 1px solid var(--border-color);
        border-right: 1px solid var(--border-color);
        color: var(--text-secondary-color);
        background-color: var(--surface-bg);
      }
      .diff-header > div:last-child {
        border-right: none;
      }
      .locale-col,
      .original-col,
      .changed-col {
        padding: 8px 12px;
        border-bottom: 1px solid var(--border-color);
        font-family: var(--editor-font-family);
        font-size: var(--editor-font-size);
        word-break: break-word;
        white-space: pre-wrap;
      }
      .locale-col {
        border-right: 1px solid var(--border-color);
        display: inline-grid;
        place-content: center;
        white-space: nowrap;
        word-break: normal;
      }
      .original-col {
        border-right: 1px solid var(--border-color);
        background-color: var(--vscode-diffEditor-removedTextBackground);
      }
      .changed-col {
        background-color: var(--vscode-diffEditor-insertedTextBackground);
      }
      .diff-added {
        background-color: var(--vscode-diffEditor-insertedTextBackground, rgba(155, 185, 85, 0.3));
      }
      .diff-removed {
        background-color: var(--vscode-diffEditor-removedTextBackground, rgba(255, 0, 0, 0.3));
      }
      .unchanged-cell {
        background-color: var(--body-bg) !important;
      }
      .original-col.empty,
      .changed-col.empty {
        background-color: transparent;
      }
      .changed-col.new {
        background-color: var(--vscode-diffEditor-insertedTextBackground, rgba(155, 185, 85, 0.3));
      }
      .changed-col.new .diff-added {
        background-color: transparent;
      }
      .editable-cell {
        padding: 0;
        display: flex;
      }
      .display-mode,
      .edit-mode {
        width: 100%;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .content-display,
      .edit-input {
        flex: 1;
        padding: 8px 12px;
        border: none;
        outline: none;
      }
      .edit-input {
        background-color: transparent;
        color: var(--text-color);
      }
      .edit-actions {
        display: flex;
        align-items: center;
        padding-right: 6px;
      }
      .edit-btn,
      .save-edit-btn,
      .cancel-edit-btn {
        background: transparent;
        color: var(--text-color);
        border: 1px solid transparent;
        border-radius: 2px;
        cursor: pointer;
        padding: 0.2rem 0.4rem;
        font-size: calc(var(--editor-font-size) * 0.8);
        font-weight: 500;
      }
      .edit-btn:hover,
      .save-edit-btn:hover,
      .cancel-edit-btn:hover {
        background-color: var(--vscode-toolbar-hoverBackground);
      }
      .diff-table > *:nth-last-child(-n + 3) {
        border-bottom: none;
      }
      .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 200px;
        color: var(--text-secondary-color);
        grid-column: 1 / -1;
      }

      .keybinding {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        vertical-align: middle;
        line-height: 10px;
      }
      .keybinding-key {
        display: inline-flex;
        align-items: center;
        border: 1px solid transparent;
        border-bottom-color: var(--vscode-keybindingLabel-bottomBorder);
        border-radius: 3px;
        font-size: 11px;
        padding: 3px 5px;
        background-color: var(--vscode-keybindingLabel-background);
        box-shadow: inset 0 -1px 0 var(--vscode-widget-shadow);
        color: var(--vscode-keybindingLabel-foreground);
      }
      .keybinding-key-separator {
        display: inline-block;
        color: var(--vscode-keybindingLabel-foreground);
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="main-content">
        <div class="review-list">
          ${props
            .map((data, index) => {
              const itemContent = generateItemContent(
                data.originalObject,
                data.updatedObject,
                index,
                data.overrideResolutions,
              )
              const options = data.options ?? {}
              const isPrimary = index === 0
              const isSecondary = index === 1

              return `
                <div class="review-item">
                  <div class="header">
                    <h1 class="title">${escapeHtml(options.title ?? 'Review changes')}</h1>
                    ${options.description ? `<p class="description">${escapeHtml(options.description)}</p>` : ''}
                  </div>
                  <div class="content">
                    ${itemContent}
                  </div>
                  <div class="actions">
                    <button class="btn" data-btn="save-btn" data-index="${index}">
                      <span>${escapeHtml(options.saveBtn ?? 'Save')}</span>
                    </button>
                    ${
                      isPrimary
                        ? `<span class="keybinding">
                              <span class="keybinding-key">${returnBtn()}</span>
                            </span>`
                        : ''
                    }
                    ${
                      isSecondary
                        ? `<span class="keybinding">
                              <span class="keybinding-key">${cmdBtn()}</span>
                              ${keybindingDivider()}
                              <span class="keybinding-key">${returnBtn()}</span>
                            </span>`
                        : ''
                    }
                  </div>
                </div>
            `.trim()
            })
            .join('')}
        </div>

        ${options.usageContext ? '<div class="info-wrapper">' : ''}
        ${
          options.usageContext
            ? `
              <div class="info-section">
                <div class="info-header">
                  <div class="relaxed-uppercased">Text usage context</div>
                  <div class="info-description">Created from the source code to ensure translations stay contextually accurate.</div>
                </div>
                <div class="divider"></div>
                <div>${escapeHtml(options.usageContext)}</div>
              </div>
            `
            : ''
        }
        ${options.usageContext ? '</div>' : ''}
      </div>

    </div>

    <script>
      (function () {
        const vscode = acquireVsCodeApi();

        const getTextContent = (element) => element?.textContent ?? '';

        function setupEditHandlers() {
          document.querySelectorAll('.editable-cell').forEach(cell => {
            const displayMode = cell.querySelector('.display-mode');
            const contentDisplay = cell.querySelector('.content-display');
            const editMode = cell.querySelector('.edit-mode');
            const editInput = cell.querySelector('.edit-input');
            const editBtn = cell.querySelector('.edit-btn');
            const saveBtn = cell.querySelector('.save-edit-btn');
            const cancelBtn = cell.querySelector('.cancel-edit-btn');

            if (!editBtn || !saveBtn || !cancelBtn || !displayMode || !editMode || !editInput || !contentDisplay) return;
            
            let originalValue = '';

            editBtn.addEventListener('click', () => {
              originalValue = getTextContent(contentDisplay);
              editInput.textContent = originalValue;
              displayMode.style.display = 'none';
              editMode.style.display = 'flex';
              
              editInput.focus();
              const selection = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(editInput);
              selection?.removeAllRanges();
              selection?.addRange(range);
            });

            const exitEditMode = () => {
              displayMode.style.display = 'flex';
              editMode.style.display = 'none';
            };

            cancelBtn.addEventListener('click', exitEditMode);

            saveBtn.addEventListener('click', () => {
              const newValue = getTextContent(editInput);
              if (newValue === originalValue) {
                exitEditMode();
                return;
              }
              
              vscode.postMessage({
                command: 'editValue',
                key: cell.dataset.key,
                keypath: cell.dataset.keypath,
                index: cell.dataset.index,
                value: newValue,
              });
            });

            editInput.addEventListener('keydown', (e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                saveBtn.click();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                cancelBtn.click();
              }
            });
          });
        }

        document.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            const primarySaveBtn = document.querySelector('[data-btn="save-btn"][data-index="0"]');
            primarySaveBtn?.click();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            const secondarySaveBtn = document.querySelector('[data-btn="save-btn"][data-index="1"]');
            secondarySaveBtn?.click();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            vscode.postMessage({ command: 'cancel' });
          }
        });

        document.querySelectorAll('[data-btn="save-btn"]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const target = e.currentTarget;
            vscode.postMessage({ command: 'save', index: target.dataset.index });
          });
        });

        setupEditHandlers();
      })();
    </script>
  </body>
</html>

`.trim()
}
