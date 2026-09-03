import { renderCodeBlockCopyMenu } from '@/components/aura/code-block-copy'

/**
 * Map a UI / preference language tag to an engine speech locale.
 *
 * @param language - UI language (`en`, `zh-TW`) or engine code (`en_US`).
 * @returns Engine `options.lang` value.
 */
function toAuraLang(language: string): AuraLang {
  const normalized = language.toLowerCase().replace('_', '-')
  if (
    normalized.startsWith('zh-tw') ||
    normalized.startsWith('zh-hk') ||
    normalized === 'zh-hant'
  ) {
    return 'zh_TW'
  }
  if (normalized.startsWith('zh')) {
    return 'zh_CN'
  }
  return 'en_US'
}

/**
 * Build Aura product options for the editor core.
 * Editor chrome theme follows Workbench Settings Theme (`html.dark`).
 *
 * @param language - UI language code (e.g. `en`, `zh-TW`) or engine locale.
 * @param markdown - Initial document value.
 * @returns Aura constructor options.
 */
export function getAuraOptions(
  language: string,
  markdown: string,
): Partial<IOptions> {
  return {
    height: '100%',
    // Off by default. When on, a half-viewport spacer follows the document.
    typewriterMode: false,
    placeholder: 'Start writing…',
    value: markdown,
    lang: toAuraLang(language),
    preview: {
      // 0 = Aura themes own the #write reading column (max-width / padding).
      maxWidth: 0,
      markdown: {
        toc: true,
        mark: true,
        footnotes: true,
        autoSpace: true,
        sanitize: false,
      },
      math: {
        engine: 'KaTeX',
        inlineDigit: true,
      },
      hljs: {
        enable: true,
        lineNumber: false,
        style: 'github',
        renderMenu: renderCodeBlockCopyMenu,
      },
    },
    counter: {
      enable: false,
      type: 'markdown',
    },
    tab: '\t',
  }
}
