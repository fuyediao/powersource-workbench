import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import type { IDocumentData, IParagraph, IParagraphStyle, ITextRun, ITextStyle } from '@univerjs/core'
import {
  BooleanNumber,
  DocumentFlavor,
  LocaleType,
  NamedStyleType,
  PAGE_SIZE,
  PaperType,
} from '@univerjs/core'
import { randomOfficeId } from '@/office/office-ids'
import { extractLegacyOfficeText } from '@/office/legacy-office-text'

/** One node in `fast-xml-parser`'s `preserveOrder` tree: `{ [tagName]: children, ':@'?: attrs }`. */
type XmlNode = Record<string, unknown>

const ATTR_KEY = ':@'
const TEXT_KEY = '#text'

/**
 * Reads the ordered child node list of a tag that is already known to exist on `node`.
 * @param node - Node whose single tag key is `tag`.
 * @param tag - Tag name (e.g. `w:r`).
 * @returns Ordered children (empty for self-closing tags).
 */
function childrenOf(node: XmlNode, tag: string): XmlNode[] {
  const value = node[tag]
  return Array.isArray(value) ? (value as XmlNode[]) : []
}

/**
 * Reads a node's XML attributes (`fast-xml-parser` `preserveOrder` attribute bag).
 * @param node - Any parsed node.
 * @returns Attribute map (e.g. `{ '@_w:val': 'Heading1' }`), or an empty object.
 */
function attrsOf(node: XmlNode): Record<string, string> {
  const attrs = node[ATTR_KEY]
  return attrs && typeof attrs === 'object' ? (attrs as Record<string, string>) : {}
}

/**
 * Finds the first sibling carrying a given tag.
 * @param siblings - Ordered sibling node list.
 * @param tag - Tag name to look for.
 * @returns Matching node, or undefined.
 */
function findTag(siblings: XmlNode[], tag: string): XmlNode | undefined {
  return siblings.find((node) => tag in node)
}

/**
 * Finds every sibling carrying a given tag, in document order.
 * @param siblings - Ordered sibling node list.
 * @param tag - Tag name to look for.
 * @returns Matching nodes, in order.
 */
function findAllTags(siblings: XmlNode[], tag: string): XmlNode[] {
  return siblings.filter((node) => tag in node)
}

/**
 * Concatenates the `#text` runs of a tag's children (used for `w:t`).
 * @param node - Node whose single tag key is `tag`.
 * @param tag - Tag name.
 * @returns Text content, preserving whitespace.
 */
function textOf(node: XmlNode, tag: string): string {
  return childrenOf(node, tag)
    .map((child) => (typeof child[TEXT_KEY] === 'string' ? (child[TEXT_KEY] as string) : ''))
    .join('')
}

/**
 * Reads a Word on/off toggle element (`<w:b/>`, `<w:b w:val="0"/>`, `<w:b w:val="false"/>`).
 * @param siblings - Run/paragraph property children.
 * @param tag - Toggle tag name (`w:b`, `w:i`, ...).
 * @returns True when the tag is present and not explicitly disabled.
 */
function readToggle(siblings: XmlNode[], tag: string): boolean {
  const node = findTag(siblings, tag)
  if (!node) {
    return false
  }
  const val = attrsOf(node)['@_w:val']
  return val !== '0' && val !== 'false'
}

/** Word built-in heading paragraph style ids → Univer named styles. */
const HEADING_STYLE_MAP: Record<string, NamedStyleType> = {
  Title: NamedStyleType.TITLE,
  Subtitle: NamedStyleType.SUBTITLE,
  Heading1: NamedStyleType.HEADING_1,
  Heading2: NamedStyleType.HEADING_2,
  Heading3: NamedStyleType.HEADING_3,
  Heading4: NamedStyleType.HEADING_4,
  Heading5: NamedStyleType.HEADING_5,
}

interface ParsedRun {
  text: string
  bold: boolean
  italic: boolean
  underline: boolean
}

interface ParsedParagraph {
  runs: ParsedRun[]
  headingStyle?: NamedStyleType
}

/**
 * Reads one `w:r` run's text and character styling.
 * @param runNode - Node whose single tag key is `w:r`.
 * @returns Parsed run (may have empty text for a field/drawing-only run).
 */
function parseRun(runNode: XmlNode): ParsedRun {
  const runChildren = childrenOf(runNode, 'w:r')
  const rPr = findTag(runChildren, 'w:rPr')
  const rPrChildren = rPr ? childrenOf(rPr, 'w:rPr') : []
  const text = findAllTags(runChildren, 'w:t').map((t) => textOf(t, 'w:t')).join('')
  const tabCount = findAllTags(runChildren, 'w:tab').length
  return {
    text: text + '\t'.repeat(tabCount),
    bold: readToggle(rPrChildren, 'w:b'),
    italic: readToggle(rPrChildren, 'w:i'),
    underline: readToggle(rPrChildren, 'w:u'),
  }
}

/**
 * Reads one `w:p` paragraph's runs and heading style.
 * @param paragraphNode - Node whose single tag key is `w:p`.
 * @returns Parsed paragraph.
 */
function parseParagraph(paragraphNode: XmlNode): ParsedParagraph {
  const paragraphChildren = childrenOf(paragraphNode, 'w:p')
  const pPr = findTag(paragraphChildren, 'w:pPr')
  const pPrChildren = pPr ? childrenOf(pPr, 'w:pPr') : []
  const pStyle = findTag(pPrChildren, 'w:pStyle')
  const styleId = pStyle ? attrsOf(pStyle)['@_w:val'] : undefined
  return {
    runs: findAllTags(paragraphChildren, 'w:r').map(parseRun),
    headingStyle: styleId ? HEADING_STYLE_MAP[styleId] : undefined,
  }
}

/**
 * Flattens a `w:tbl` into one plain paragraph per row (cells joined by ` | `).
 * V1 scope: tables round-trip as readable text, not as native Univer tables.
 * @param tableNode - Node whose single tag key is `w:tbl`.
 * @returns One parsed paragraph per table row.
 */
function parseTableAsParagraphs(tableNode: XmlNode): ParsedParagraph[] {
  const tableChildren = childrenOf(tableNode, 'w:tbl')
  return findAllTags(tableChildren, 'w:tr').map((rowNode) => {
    const rowChildren = childrenOf(rowNode, 'w:tr')
    const cellTexts = findAllTags(rowChildren, 'w:tc').map((cellNode) => {
      const cellChildren = childrenOf(cellNode, 'w:tc')
      return findAllTags(cellChildren, 'w:p')
        .map((p) => parseParagraph(p).runs.map((run) => run.text).join(''))
        .join(' ')
    })
    return { runs: [{ text: cellTexts.join(' | '), bold: false, italic: false, underline: false }] }
  })
}

/**
 * Builds a Univer `ITextStyle` from parsed run flags.
 * @param run - Parsed run.
 * @returns Style object, or undefined when the run has no styling.
 */
function textStyleFromRun(run: ParsedRun): ITextStyle | undefined {
  const style: ITextStyle = {}
  if (run.bold) {
    style.bl = BooleanNumber.TRUE
  }
  if (run.italic) {
    style.it = BooleanNumber.TRUE
  }
  if (run.underline) {
    style.ul = { s: BooleanNumber.TRUE }
  }
  return Object.keys(style).length > 0 ? style : undefined
}

/**
 * Builds a Univer document snapshot from parsed paragraphs.
 * @param paragraphs - Parsed text and run styling.
 * @param title - Document title.
 * @param locale - Active Univer locale.
 * @returns Univer document snapshot.
 */
function createDocumentSnapshot(
  paragraphs: ParsedParagraph[],
  title: string,
  locale: LocaleType,
): IDocumentData {
  let dataStream = ''
  const textRuns: ITextRun[] = []
  const univerParagraphs: IParagraph[] = []
  for (const paragraph of paragraphs) {
    for (const run of paragraph.runs) {
      if (!run.text) {
        continue
      }
      const st = dataStream.length
      dataStream += run.text
      const ts = textStyleFromRun(run)
      if (ts) {
        textRuns.push({ st, ed: dataStream.length, ts })
      }
    }
    const paragraphStyle: IParagraphStyle | undefined = paragraph.headingStyle
      ? { namedStyleType: paragraph.headingStyle }
      : undefined
    univerParagraphs.push({ startIndex: dataStream.length, paragraphStyle })
    dataStream += '\r'
  }
  const sectionBreakIndex = dataStream.length
  dataStream += '\n'

  return {
    id: randomOfficeId('doc'),
    locale,
    title,
    tableSource: {},
    drawings: {},
    drawingsOrder: [],
    headers: {},
    footers: {},
    body: {
      dataStream,
      textRuns,
      paragraphs: univerParagraphs,
      customBlocks: [],
      tables: [],
      sectionBreaks: [{ startIndex: sectionBreakIndex }],
    },
    documentStyle: {
      pageSize: { ...PAGE_SIZE[PaperType.A4] },
      documentFlavor: DocumentFlavor.TRADITIONAL,
      marginTop: 96,
      marginBottom: 96,
      marginRight: 96,
      marginLeft: 96,
    },
    settings: {},
  }
}

/**
 * Parses a `.docx` file into a Univer `IDocumentData` snapshot.
 * V1 scope: paragraphs, headings, bold/italic/underline runs, and simple tables
 * (flattened to text rows). Headers, footers, footnotes, and TOC are not imported.
 * @param buffer - Raw `.docx` file bytes.
 * @param title - Display title for the document (usually the file name without extension).
 * @param locale - Active Univer locale for the new document.
 * @returns Univer document snapshot.
 */
export async function importDocx(
  buffer: ArrayBuffer,
  title: string,
  locale: LocaleType,
): Promise<IDocumentData> {
  const zip = await JSZip.loadAsync(buffer)
  const documentXmlFile = zip.file('word/document.xml')
  if (!documentXmlFile) {
    throw new Error('word/document.xml not found in .docx archive')
  }
  const documentXml = await documentXmlFile.async('text')

  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: false,
  })
  const root = parser.parse(documentXml) as XmlNode[]
  const documentNode = findTag(root, 'w:document')
  const documentChildren = documentNode ? childrenOf(documentNode, 'w:document') : []
  const bodyNode = findTag(documentChildren, 'w:body')
  const bodyChildren = bodyNode ? childrenOf(bodyNode, 'w:body') : []

  const paragraphs: ParsedParagraph[] = []
  for (const node of bodyChildren) {
    if ('w:p' in node) {
      paragraphs.push(parseParagraph(node))
    } else if ('w:tbl' in node) {
      paragraphs.push(...parseTableAsParagraphs(node))
    }
  }
  if (paragraphs.length === 0) {
    paragraphs.push({ runs: [] })
  }

  return createDocumentSnapshot(paragraphs, title, locale)
}

/**
 * Imports a legacy `.doc` payload. Some historical CRM documents use the
 * extension for plain text; binary OLE Word files use a readable-text fallback.
 * @param buffer - Raw `.doc` file bytes.
 * @param title - Display title for the document.
 * @param locale - Active Univer locale for the new document.
 * @returns Editable Univer document snapshot.
 */
export async function importDoc(
  buffer: ArrayBuffer,
  title: string,
  locale: LocaleType,
): Promise<IDocumentData> {
  const bytes = new Uint8Array(buffer)
  const isOle =
    bytes.length >= 8 &&
    [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].every(
      (value, index) => bytes[index] === value,
    )
  const lines = isOle
    ? extractLegacyOfficeText(buffer)
    : new TextDecoder('utf-8')
        .decode(bytes)
        .replace(/^\uFEFF/, '')
        .replace(/\0/g, '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
  const paragraphs = lines.map<ParsedParagraph>((line) => ({
    runs: [{ text: line, bold: false, italic: false, underline: false }],
  }))
  return createDocumentSnapshot(
    paragraphs.length > 0 ? paragraphs : [{ runs: [] }],
    title,
    locale,
  )
}

/** Univer named styles that map onto a Word/`docx` heading level. */
const NAMED_STYLE_TO_HEADING: Partial<Record<NamedStyleType, (typeof HeadingLevel)[keyof typeof HeadingLevel]>> = {
  [NamedStyleType.TITLE]: HeadingLevel.TITLE,
  [NamedStyleType.HEADING_1]: HeadingLevel.HEADING_1,
  [NamedStyleType.HEADING_2]: HeadingLevel.HEADING_2,
  [NamedStyleType.HEADING_3]: HeadingLevel.HEADING_3,
  [NamedStyleType.HEADING_4]: HeadingLevel.HEADING_4,
  [NamedStyleType.HEADING_5]: HeadingLevel.HEADING_5,
}

/**
 * Splits a Univer document body into per-paragraph plain text + text runs, using the
 * `\r` paragraph markers recorded in `paragraphs[].startIndex`.
 * @param dataStream - Full document text stream.
 * @param textRuns - Styled sub-ranges of `dataStream`.
 * @param paragraphs - Paragraph markers (in `dataStream` order).
 * @returns One entry per paragraph: its plain text plus the text runs inside it.
 */
function splitParagraphs(
  dataStream: string,
  textRuns: ITextRun[],
  paragraphs: IParagraph[],
): Array<{ text: string; paragraphStyle?: IParagraphStyle; runs: ITextRun[] }> {
  let cursor = 0
  return paragraphs.map((paragraph) => {
    const text = dataStream.slice(cursor, paragraph.startIndex)
    const runs = textRuns.filter((run) => run.st >= cursor && run.ed <= paragraph.startIndex)
    cursor = paragraph.startIndex + 1
    return { text, paragraphStyle: paragraph.paragraphStyle, runs }
  })
}

/**
 * Serializes a Univer `IDocumentData` snapshot into `.docx` bytes (inverse of
 * {@link importDocx}, same v1 scope — no headers/footers/TOC).
 * @param documentData - Univer document snapshot.
 * @returns `.docx` file blob.
 */
export async function exportDocx(documentData: IDocumentData): Promise<Blob> {
  const dataStream = documentData.body?.dataStream ?? '\r\n'
  const textRuns = documentData.body?.textRuns ?? []
  const paragraphs = documentData.body?.paragraphs ?? [{ startIndex: dataStream.length - 1 }]

  const children = splitParagraphs(dataStream, textRuns, paragraphs).map(({ text, paragraphStyle, runs }) => {
    const heading = paragraphStyle?.namedStyleType ? NAMED_STYLE_TO_HEADING[paragraphStyle.namedStyleType] : undefined
    if (runs.length === 0) {
      return new Paragraph({ heading, children: [new TextRun(text)] })
    }
    let cursor = 0
    const textRunElements = runs
      .sort((a, b) => a.st - b.st)
      .map((run) => {
        const before = text.slice(cursor, run.st)
        cursor = run.ed
        const runText = text.slice(run.st, run.ed)
        const styled = new TextRun({
          text: runText,
          bold: run.ts?.bl === BooleanNumber.TRUE,
          italics: run.ts?.it === BooleanNumber.TRUE,
          underline: run.ts?.ul?.s === BooleanNumber.TRUE ? {} : undefined,
        })
        return before ? [new TextRun(before), styled] : [styled]
      })
      .flat()
    const tail = text.slice(cursor)
    if (tail) {
      textRunElements.push(new TextRun(tail))
    }
    return new Paragraph({ heading, children: textRunElements })
  })

  const document = new Document({
    sections: [{ children }],
  })
  return Packer.toBlob(document)
}
