import type * as Monaco from 'monaco-editor'

const svgLanguage: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenizer: {
    root: [
      [/<!--/, 'comment', '@comment'],
      [/<\?xml/, 'metatag', '@processing'],
      [/<!DOCTYPE/, 'metatag', '@doctype'],
      [/<\/?[\w:-]+/, 'tag', '@tag'],
      [/[^<]+/, ''],
    ],
    tag: [
      [/\s+/, 'white'],
      [/[\w:-]+(?=\s*=)/, 'attribute.name'],
      [/=/, 'delimiter'],
      [/"[^"]*"|'[^']*'/, 'attribute.value'],
      [/\/?>/, 'tag', '@pop'],
    ],
    comment: [
      [/[^-]+/, 'comment.content'],
      [/-->/, 'comment', '@pop'],
      [/-/, 'comment.content'],
    ],
    processing: [
      [/[^?]+/, 'metatag.content'],
      [/\?>/, 'metatag', '@pop'],
      [/\?/, 'metatag.content'],
    ],
    doctype: [
      [/[^>]+/, 'metatag.content'],
      [/>/, 'metatag', '@pop'],
    ],
  },
}

/**
 * Register SVG as an embedded Monaco language for fenced Markdown blocks.
 *
 * @param monaco - Monaco API namespace.
 */
export function registerMonacoLanguages(monaco: typeof Monaco): void {
  if (monaco.languages.getLanguages().some(({ id }) => id === 'svg')) {
    return
  }
  monaco.languages.register({
    id: 'svg',
    aliases: ['SVG', 'svg'],
    extensions: ['.svg'],
    mimetypes: ['image/svg+xml'],
  })
  monaco.languages.setMonarchTokensProvider('svg', svgLanguage)
}
