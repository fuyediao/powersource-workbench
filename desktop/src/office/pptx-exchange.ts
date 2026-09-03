import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import PptxGenJS from 'pptxgenjs'
import { BooleanNumber, type LocaleType } from '@univerjs/core'
import type { IPageElement, ISlideData, ISlidePage } from '@univerjs/slides'
import { PageElementType, PageType } from '@univerjs/slides'
import { randomOfficeId } from '@/office/office-ids'
import { extractLegacyOfficeText } from '@/office/legacy-office-text'

/** One node in `fast-xml-parser` `preserveOrder` tree: `{ [tagName]: children, ':@'?: attrs }`. */
type XmlNode = Record<string, unknown>

/** CSS pixels per inch (matches pptxgenjs default). */
const PX_PER_INCH = 96

/** OOXML English Metric Units per inch. */
const EMU_PER_INCH = 914400

/** Widescreen 16:9 canvas in CSS px (10in × 5.625in). */
const SLIDE_WIDTH_PX = 10 * PX_PER_INCH
const SLIDE_HEIGHT_PX = 5.625 * PX_PER_INCH

/** Fallback presentation size when `p:sldSz` is missing (10in × 5.625in EMUs). */
const DEFAULT_SLIDE_EMU = {
  width: 10 * EMU_PER_INCH,
  height: 5.625 * EMU_PER_INCH,
}

const xmlParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
})

interface BoxPx {
  left: number
  top: number
  width: number
  height: number
}

interface TextStyle {
  fontSizePt: number
  color: string
  bold: boolean
}

interface PlaceholderStyle {
  type: string
  idx: string
  box?: BoxPx
  style: Partial<TextStyle>
}

interface ParsedTextShape {
  text: string
  placeholderType?: string
  placeholderIdx?: string
  box?: BoxPx
  style: Partial<TextStyle>
}

interface ParsedSlidePage {
  backgroundRgb: string
  shapes: ParsedTextShape[]
  title: string
  /**
   * Scales OOXML point sizes onto the fixed 10in canvas. Geometry already maps
   * EMUs onto that canvas; font sizes are absolute points and need the same ratio.
   */
  fontScale: number
}

/**
 * Reads ordered children of a tag known to exist on `node`.
 * @param node - Node whose single tag key is `tag`.
 * @param tag - Tag name.
 * @returns Ordered children.
 */
function childrenOf(node: XmlNode, tag: string): XmlNode[] {
  const value = node[tag]
  return Array.isArray(value) ? (value as XmlNode[]) : []
}

/**
 * Reads XML attributes from a preserveOrder node.
 * @param node - Parsed node.
 * @returns Attribute map.
 */
function attrsOf(node: XmlNode): Record<string, string> {
  const attrs = node[':@']
  return attrs && typeof attrs === 'object' ? (attrs as Record<string, string>) : {}
}

/**
 * Finds the first sibling with `tag`.
 * @param siblings - Sibling list.
 * @param tag - Tag name.
 * @returns Matching node, or undefined.
 */
function findTag(siblings: XmlNode[], tag: string): XmlNode | undefined {
  return siblings.find((node) => tag in node)
}

/**
 * Finds every sibling with `tag`, in order.
 * @param siblings - Sibling list.
 * @param tag - Tag name.
 * @returns Matching nodes.
 */
function findAllTags(siblings: XmlNode[], tag: string): XmlNode[] {
  return siblings.filter((node) => tag in node)
}

/**
 * Finds the first descendant with `tag`.
 * @param nodes - Roots to search.
 * @param tag - Tag name.
 * @returns Matching node, or undefined.
 */
function findDeep(nodes: XmlNode[], tag: string): XmlNode | undefined {
  for (const node of nodes) {
    if (tag in node) {
      return node
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === ':@' || key === '#text') {
        continue
      }
      if (Array.isArray(value)) {
        const found = findDeep(value as XmlNode[], tag)
        if (found) {
          return found
        }
      }
    }
  }
  return undefined
}

/**
 * Reads text under an `a:t` node.
 * @param textNode - Node keyed by `a:t`.
 * @returns Concatenated text.
 */
function textOf(textNode: XmlNode): string {
  return childrenOf(textNode, 'a:t')
    .map((child) => (typeof child['#text'] === 'string' ? (child['#text'] as string) : ''))
    .join('')
}

/**
 * Reads visible text under `p:txBody` (one `a:p` per line).
 * @param txBody - Node keyed by `p:txBody`.
 * @returns Plain text.
 */
function textFromTxBody(txBody: XmlNode): string {
  return findAllTags(childrenOf(txBody, 'p:txBody'), 'a:p')
    .map((paragraph) =>
      findAllTags(childrenOf(paragraph, 'a:p'), 'a:r')
        .map((run) => {
          const textNode = findTag(childrenOf(run, 'a:r'), 'a:t')
          return textNode ? textOf(textNode) : ''
        })
        .join(''),
    )
    .join('\n')
}

/**
 * Resolves a package-relative Target against a part path.
 * @param fromPath - Owning part path.
 * @param target - Relationship Target.
 * @returns Normalized zip path.
 */
function resolvePackagePath(fromPath: string, target: string): string {
  const baseDir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : ''
  const parts: string[] = []
  for (const part of `${baseDir}/${target}`.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') {
      continue
    }
    if (part === '..') {
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

/**
 * Lists relationship targets whose Type ends with `typeSuffix`.
 * @param zip - Open PPTX zip.
 * @param partPath - Part that owns `_rels/*.rels`.
 * @param typeSuffix - Relationship type suffix (e.g. `/relationships/slideLayout`).
 * @returns Resolved package paths.
 */
async function relationshipTargets(
  zip: JSZip,
  partPath: string,
  typeSuffix: string,
): Promise<string[]> {
  const slash = partPath.lastIndexOf('/')
  const dir = slash >= 0 ? partPath.slice(0, slash) : ''
  const file = slash >= 0 ? partPath.slice(slash + 1) : partPath
  const relsFile = zip.file(`${dir}/_rels/${file}.rels`)
  if (!relsFile) {
    return []
  }
  const root = xmlParser.parse(await relsFile.async('text')) as XmlNode[]
  const relationships = findTag(root, 'Relationships')
  const children = relationships ? childrenOf(relationships, 'Relationships') : []
  const out: string[] = []
  for (const node of findAllTags(children, 'Relationship')) {
    const attrs = attrsOf(node)
    const type = attrs['@_Type'] ?? ''
    if (!type.endsWith(typeSuffix)) {
      continue
    }
    const target = attrs['@_Target']
    if (!target || attrs['@_TargetMode'] === 'External') {
      continue
    }
    out.push(resolvePackagePath(partPath, target))
  }
  return out
}

/**
 * Maps EMUs onto the fixed CSS-pixel canvas using the presentation slide size.
 * @param emu - Length in EMUs.
 * @param slideEmu - Full-slide length in EMUs on that axis.
 * @param slidePx - Canvas length in CSS px on that axis.
 * @returns CSS pixels.
 */
function emuToPx(emu: number, slideEmu: number, slidePx: number): number {
  if (slideEmu <= 0) {
    return 0
  }
  return (emu / slideEmu) * slidePx
}

/**
 * Returns how much to scale OOXML point sizes when mapping a presentation onto
 * the fixed 10in-wide canvas (same ratio as EMU → px geometry).
 * @param slideSizeEmu - Presentation `p:sldSz` in EMUs.
 * @returns Scale factor (1 when the source is already 10in wide).
 */
function fontScaleForSlide(slideSizeEmu: { width: number }): number {
  const sourceWidthIn = slideSizeEmu.width / EMU_PER_INCH
  const canvasWidthIn = SLIDE_WIDTH_PX / PX_PER_INCH
  if (sourceWidthIn <= 0) {
    return 1
  }
  return canvasWidthIn / sourceWidthIn
}

/**
 * Reads `a:xfrm` into a CSS-pixel box.
 * @param parentChildren - Children that may contain `a:xfrm`.
 * @param slideSizeEmu - Presentation `p:sldSz`.
 * @returns Box, or undefined.
 */
function boxFromXfrm(
  parentChildren: XmlNode[],
  slideSizeEmu: { width: number; height: number },
): BoxPx | undefined {
  const xfrm = findTag(parentChildren, 'a:xfrm')
  if (!xfrm) {
    return undefined
  }
  const xfrmChildren = childrenOf(xfrm, 'a:xfrm')
  const off = findTag(xfrmChildren, 'a:off')
  const ext = findTag(xfrmChildren, 'a:ext')
  if (!off || !ext) {
    return undefined
  }
  const offAttrs = attrsOf(off)
  const extAttrs = attrsOf(ext)
  return {
    left: emuToPx(Number(offAttrs['@_x'] ?? 0), slideSizeEmu.width, SLIDE_WIDTH_PX),
    top: emuToPx(Number(offAttrs['@_y'] ?? 0), slideSizeEmu.height, SLIDE_HEIGHT_PX),
    width: emuToPx(Number(extAttrs['@_cx'] ?? 0), slideSizeEmu.width, SLIDE_WIDTH_PX),
    height: emuToPx(Number(extAttrs['@_cy'] ?? 0), slideSizeEmu.height, SLIDE_HEIGHT_PX),
  }
}

/**
 * Reads `#RRGGBB` from an `a:solidFill` → `a:srgbClr` subtree.
 * @param nodes - Nodes that may contain `a:solidFill`.
 * @returns Hex color, or undefined.
 */
function srgbFromSolidFill(nodes: XmlNode[]): string | undefined {
  const solid = findDeep(nodes, 'a:solidFill')
  if (!solid) {
    return undefined
  }
  const srgb = findTag(childrenOf(solid, 'a:solidFill'), 'a:srgbClr')
  if (!srgb) {
    return undefined
  }
  const val = attrsOf(srgb)['@_val']
  if (!val || !/^[0-9A-Fa-f]{6}$/.test(val)) {
    return undefined
  }
  return `#${val.toUpperCase()}`
}

/**
 * Reads a solid page background from `p:bg` (directly on the page or under `p:cSld`).
 * @param pageChildren - Children of `p:sld` / layout / master.
 * @returns Hex color, or undefined.
 */
function backgroundFromPage(pageChildren: XmlNode[]): string | undefined {
  const directBg = findTag(pageChildren, 'p:bg')
  if (directBg) {
    return srgbFromSolidFill(childrenOf(directBg, 'p:bg'))
  }
  const cSld = findTag(pageChildren, 'p:cSld')
  if (!cSld) {
    return undefined
  }
  const nestedBg = findTag(childrenOf(cSld, 'p:cSld'), 'p:bg')
  return nestedBg ? srgbFromSolidFill(childrenOf(nestedBg, 'p:bg')) : undefined
}

/**
 * Reads font size / color / bold from `a:defRPr` or `a:rPr` attributes + fill.
 * @param prNode - Node keyed by `a:defRPr` or `a:rPr`.
 * @param tag - Tag key on `prNode`.
 * @returns Partial text style.
 */
function styleFromRunProperties(prNode: XmlNode, tag: string): Partial<TextStyle> {
  const attrs = attrsOf(prNode)
  const style: Partial<TextStyle> = {}
  const sz = Number(attrs['@_sz'])
  if (Number.isFinite(sz) && sz > 0) {
    style.fontSizePt = sz / 100
  }
  if (attrs['@_b'] === '1' || attrs['@_b'] === 'true') {
    style.bold = true
  }
  const color = srgbFromSolidFill(childrenOf(prNode, tag))
  if (color) {
    style.color = color
  }
  return style
}

/**
 * Reads text style from a `p:txBody` (run props first, then list defaults).
 * @param txBody - Node keyed by `p:txBody`.
 * @returns Partial text style.
 */
function styleFromTxBody(txBody: XmlNode): Partial<TextStyle> {
  const txBodyChildren = childrenOf(txBody, 'p:txBody')
  for (const paragraph of findAllTags(txBodyChildren, 'a:p')) {
    for (const run of findAllTags(childrenOf(paragraph, 'a:p'), 'a:r')) {
      const rPr = findTag(childrenOf(run, 'a:r'), 'a:rPr')
      if (!rPr) {
        continue
      }
      const style = styleFromRunProperties(rPr, 'a:rPr')
      if (style.fontSizePt != null || style.color || style.bold) {
        return style
      }
    }
  }
  const lstStyle = findTag(txBodyChildren, 'a:lstStyle')
  if (!lstStyle) {
    return {}
  }
  for (const levelTag of ['a:lvl1pPr', 'a:lvl2pPr', 'a:lvl3pPr', 'a:defPPr']) {
    const level = findTag(childrenOf(lstStyle, 'a:lstStyle'), levelTag)
    if (!level) {
      continue
    }
    const defRPr = findTag(childrenOf(level, levelTag), 'a:defRPr')
    if (!defRPr) {
      continue
    }
    const style = styleFromRunProperties(defRPr, 'a:defRPr')
    if (style.fontSizePt != null || style.color || style.bold) {
      return style
    }
  }
  return {}
}

/**
 * Reads `p:ph` type/idx from a shape.
 * @param shapeChildren - Children of `p:sp`.
 * @returns Placeholder identity, or undefined.
 */
function placeholderOf(shapeChildren: XmlNode[]): { type: string; idx: string } | undefined {
  const nvSpPr = findTag(shapeChildren, 'p:nvSpPr')
  const nvPr = findTag(nvSpPr ? childrenOf(nvSpPr, 'p:nvSpPr') : [], 'p:nvPr')
  const ph = findTag(nvPr ? childrenOf(nvPr, 'p:nvPr') : [], 'p:ph')
  if (!ph) {
    return undefined
  }
  const attrs = attrsOf(ph)
  return { type: attrs['@_type'] ?? 'body', idx: attrs['@_idx'] ?? '0' }
}

/**
 * Returns whether a placeholder type is title-like.
 * @param type - OOXML `p:ph/@type`.
 * @returns True for title / center title.
 */
function isTitleType(type: string | undefined): boolean {
  return type === 'title' || type === 'ctrTitle'
}

/**
 * Matches a slide placeholder to a layout placeholder (`ctrTitle` falls back to `title`).
 * @param placeholders - Layout placeholders.
 * @param type - Slide placeholder type.
 * @param idx - Slide placeholder idx.
 * @returns Matching layout placeholder, or undefined.
 */
function findPlaceholder(
  placeholders: PlaceholderStyle[],
  type: string,
  idx: string,
): PlaceholderStyle | undefined {
  const exact = placeholders.find((item) => item.type === type && item.idx === idx)
  if (exact) {
    return exact
  }
  if (type === 'ctrTitle') {
    return (
      placeholders.find((item) => item.type === 'title' && item.idx === idx) ??
      placeholders.find((item) => item.type === 'title') ??
      placeholders.find((item) => item.type === 'ctrTitle')
    )
  }
  if (type === 'title') {
    return (
      placeholders.find((item) => item.type === 'title') ??
      placeholders.find((item) => item.type === 'ctrTitle')
    )
  }
  return placeholders.find((item) => item.type === type)
}

/**
 * Parses text shapes under a `p:spTree`.
 * @param spTreeChildren - Children of `p:spTree`.
 * @param slideSizeEmu - Presentation slide size in EMUs.
 * @returns Text shapes.
 */
function parseTextShapes(
  spTreeChildren: XmlNode[],
  slideSizeEmu: { width: number; height: number },
): ParsedTextShape[] {
  const shapes: ParsedTextShape[] = []
  for (const shapeNode of findAllTags(spTreeChildren, 'p:sp')) {
    const shapeChildren = childrenOf(shapeNode, 'p:sp')
    const txBody = findTag(shapeChildren, 'p:txBody')
    if (!txBody) {
      continue
    }
    const spPr = findTag(shapeChildren, 'p:spPr')
    const placeholder = placeholderOf(shapeChildren)
    shapes.push({
      text: textFromTxBody(txBody),
      placeholderType: placeholder?.type,
      placeholderIdx: placeholder?.idx,
      box: boxFromXfrm(spPr ? childrenOf(spPr, 'p:spPr') : [], slideSizeEmu),
      style: styleFromTxBody(txBody),
    })
  }
  return shapes
}

/**
 * Parses layout/master background + placeholder styles.
 * @param pageXml - Raw layout or master XML.
 * @param slideSizeEmu - Presentation slide size in EMUs.
 * @returns Background and placeholders.
 */
function parseLayoutOrMaster(
  pageXml: string,
  slideSizeEmu: { width: number; height: number },
): { backgroundRgb?: string; placeholders: PlaceholderStyle[] } {
  const root = xmlParser.parse(pageXml) as XmlNode[]
  const pageNode =
    findTag(root, 'p:sldLayout') ?? findTag(root, 'p:sldMaster') ?? findTag(root, 'p:sld')
  if (!pageNode) {
    return { placeholders: [] }
  }
  const pageTag =
    'p:sldLayout' in pageNode ? 'p:sldLayout' : 'p:sldMaster' in pageNode ? 'p:sldMaster' : 'p:sld'
  const pageChildren = childrenOf(pageNode, pageTag)
  const cSld = findTag(pageChildren, 'p:cSld')
  const spTree = findTag(cSld ? childrenOf(cSld, 'p:cSld') : [], 'p:spTree')
  const placeholders: PlaceholderStyle[] = []
  for (const shape of parseTextShapes(
    spTree ? childrenOf(spTree, 'p:spTree') : [],
    slideSizeEmu,
  )) {
    if (!shape.placeholderType) {
      continue
    }
    placeholders.push({
      type: shape.placeholderType,
      idx: shape.placeholderIdx ?? '0',
      box: shape.box,
      style: shape.style,
    })
  }
  return { backgroundRgb: backgroundFromPage(pageChildren), placeholders }
}

/**
 * Reads `p:sldSz` from `ppt/presentation.xml`.
 * @param zip - Open PPTX zip.
 * @returns Slide size in EMUs.
 */
async function readSlideSizeEmu(zip: JSZip): Promise<{ width: number; height: number }> {
  const file = zip.file('ppt/presentation.xml')
  if (!file) {
    return { ...DEFAULT_SLIDE_EMU }
  }
  const root = xmlParser.parse(await file.async('text')) as XmlNode[]
  const presentation = findTag(root, 'p:presentation')
  const sldSz = findTag(
    presentation ? childrenOf(presentation, 'p:presentation') : [],
    'p:sldSz',
  )
  if (!sldSz) {
    return { ...DEFAULT_SLIDE_EMU }
  }
  const attrs = attrsOf(sldSz)
  const width = Number(attrs['@_cx'] ?? 0)
  const height = Number(attrs['@_cy'] ?? 0)
  return width > 0 && height > 0 ? { width, height } : { ...DEFAULT_SLIDE_EMU }
}

/**
 * Merges partial text styles; later fragments override earlier ones.
 * @param parts - Style fragments.
 * @returns Concrete style.
 */
function mergeTextStyle(...parts: Array<Partial<TextStyle> | undefined>): TextStyle {
  const merged: TextStyle = { fontSizePt: 18, color: '#000000', bold: false }
  for (const part of parts) {
    if (!part) {
      continue
    }
    if (part.fontSizePt != null) {
      merged.fontSizePt = part.fontSizePt
    }
    if (part.color) {
      merged.color = part.color
    }
    if (part.bold != null) {
      merged.bold = part.bold
    }
  }
  return merged
}

/**
 * Default title/body box when OOXML has no usable transform.
 * @param kind - Title or body.
 * @returns CSS-pixel box.
 */
function fallbackBox(kind: 'title' | 'body'): BoxPx {
  if (kind === 'title') {
    return { left: 48, top: 100, width: SLIDE_WIDTH_PX - 96, height: 180 }
  }
  return { left: 48, top: 300, width: SLIDE_WIDTH_PX - 96, height: SLIDE_HEIGHT_PX - 340 }
}

/**
 * Builds Univer text elements from a parsed slide.
 * @param slide - Parsed slide page.
 * @returns Page elements keyed by id.
 */
function pageElementsFromSlide(slide: ParsedSlidePage): Record<string, IPageElement> {
  const elements: Record<string, IPageElement> = {}
  let zIndex = 0
  for (const shape of slide.shapes) {
    if (!shape.text.trim()) {
      continue
    }
    const kind = isTitleType(shape.placeholderType) ? 'title' : 'body'
    const box = shape.box ?? fallbackBox(kind)
    const style = mergeTextStyle(
      kind === 'title'
        ? { fontSizePt: 40, color: '#000000', bold: true }
        : { fontSizePt: 18, color: '#000000', bold: false },
      shape.style,
    )
    const id = randomOfficeId('el')
    elements[id] = {
      id,
      zIndex: zIndex++,
      left: box.left,
      top: box.top,
      width: Math.max(8, box.width),
      height: Math.max(8, box.height),
      title: kind === 'title' ? 'Title' : 'Body',
      description: '',
      type: PageElementType.TEXT,
      richText: {
        text: shape.text,
        fs: Math.max(1, style.fontSizePt * slide.fontScale),
        cl: { rgb: style.color },
        bl: style.bold ? BooleanNumber.TRUE : BooleanNumber.FALSE,
      },
    }
  }
  return elements
}

/**
 * Parses one slide part and resolves layout/master background + placeholder styles.
 * @param zip - Open PPTX zip.
 * @param slidePath - e.g. `ppt/slides/slide1.xml`.
 * @param slideSizeEmu - Presentation slide size in EMUs.
 * @returns Parsed slide page.
 */
async function parseSlidePart(
  zip: JSZip,
  slidePath: string,
  slideSizeEmu: { width: number; height: number },
): Promise<ParsedSlidePage> {
  const slideFile = zip.file(slidePath)
  if (!slideFile) {
    return { backgroundRgb: '#FFFFFF', shapes: [], title: '', fontScale: fontScaleForSlide(slideSizeEmu) }
  }
  const root = xmlParser.parse(await slideFile.async('text')) as XmlNode[]
  const sldNode = findTag(root, 'p:sld')
  const sldChildren = sldNode ? childrenOf(sldNode, 'p:sld') : []
  let backgroundRgb = backgroundFromPage(sldChildren)
  const cSld = findTag(sldChildren, 'p:cSld')
  const spTree = findTag(cSld ? childrenOf(cSld, 'p:cSld') : [], 'p:spTree')
  let shapes = parseTextShapes(spTree ? childrenOf(spTree, 'p:spTree') : [], slideSizeEmu)

  let placeholders: PlaceholderStyle[] = []
  for (const layoutPath of await relationshipTargets(zip, slidePath, '/relationships/slideLayout')) {
    const layoutFile = zip.file(layoutPath)
    if (!layoutFile) {
      continue
    }
    const layout = parseLayoutOrMaster(await layoutFile.async('text'), slideSizeEmu)
    backgroundRgb = backgroundRgb ?? layout.backgroundRgb
    placeholders = layout.placeholders
    for (const masterPath of await relationshipTargets(
      zip,
      layoutPath,
      '/relationships/slideMaster',
    )) {
      const masterFile = zip.file(masterPath)
      if (!masterFile) {
        continue
      }
      const master = parseLayoutOrMaster(await masterFile.async('text'), slideSizeEmu)
      backgroundRgb = backgroundRgb ?? master.backgroundRgb
    }
  }

  shapes = shapes.map((shape) => {
    if (!shape.placeholderType) {
      return shape
    }
    const placeholder = findPlaceholder(
      placeholders,
      shape.placeholderType,
      shape.placeholderIdx ?? '0',
    )
    if (!placeholder) {
      return shape
    }
    return {
      ...shape,
      box: shape.box ?? placeholder.box,
      style: mergeTextStyle(placeholder.style, shape.style),
    }
  })

  const titleShape = shapes.find(
    (shape) => shape.text.trim() && isTitleType(shape.placeholderType),
  )
  const title =
    titleShape?.text.trim() ||
    shapes.find((shape) => shape.text.trim())?.text.trim() ||
    ''

  return {
    backgroundRgb: backgroundRgb ?? '#FFFFFF',
    shapes,
    title,
    fontScale: fontScaleForSlide(slideSizeEmu),
  }
}

/**
 * Builds a Univer slide snapshot from parsed pages.
 * @param pagesIn - Parsed slide pages.
 * @param title - Presentation title.
 * @param locale - Active Univer locale.
 * @returns Univer slide snapshot.
 */
function createSlideSnapshot(
  pagesIn: ParsedSlidePage[],
  title: string,
  locale: LocaleType,
): ISlideData {
  const pages: Record<string, ISlidePage> = {}
  const pageOrder: string[] = []
  const source =
    pagesIn.length > 0
      ? pagesIn
      : [{ backgroundRgb: '#FFFFFF', shapes: [], title: '', fontScale: 1 }]
  for (const slide of source) {
    const pageId = randomOfficeId('page')
    pageOrder.push(pageId)
    pages[pageId] = {
      id: pageId,
      pageType: PageType.SLIDE,
      zIndex: pageOrder.length - 1,
      title: slide.title,
      description: '',
      pageBackgroundFill: { rgb: slide.backgroundRgb },
      pageElements: pageElementsFromSlide(slide),
    }
  }
  return {
    id: randomOfficeId('slide'),
    locale,
    title,
    pageSize: { width: SLIDE_WIDTH_PX, height: SLIDE_HEIGHT_PX },
    body: { pages, pageOrder },
  }
}

/**
 * Parses a `.pptx` file into a Univer `ISlideData` snapshot.
 * Imports solid slide/layout/master backgrounds, text positions, font size, and
 * sRGB text color. Images, charts, animations, and theme-scheme colors remain
 * out of scope.
 * @param buffer - Raw `.pptx` bytes.
 * @param title - Display title (usually file name without extension).
 * @param locale - Active Univer locale.
 * @returns Univer slide deck snapshot.
 */
export async function importPptx(
  buffer: ArrayBuffer,
  title: string,
  locale: LocaleType,
): Promise<ISlideData> {
  const zip = await JSZip.loadAsync(buffer)
  const slideSizeEmu = await readSlideSizeEmu(zip)
  const slideFiles = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => {
      const numberOf = (path: string) => Number(path.match(/slide(\d+)\.xml$/)?.[1] ?? 0)
      return numberOf(a) - numberOf(b)
    })

  const slides: ParsedSlidePage[] = []
  for (const path of slideFiles) {
    slides.push(await parseSlidePart(zip, path, slideSizeEmu))
  }
  return createSlideSnapshot(slides, title, locale)
}

/**
 * Imports a legacy binary `.ppt` file as an editable text-first presentation.
 * @param buffer - Raw `.ppt` bytes.
 * @param title - Display title.
 * @param locale - Active Univer locale.
 * @returns Editable Univer slide snapshot.
 */
export async function importPpt(
  buffer: ArrayBuffer,
  title: string,
  locale: LocaleType,
): Promise<ISlideData> {
  const lines = extractLegacyOfficeText(buffer)
  const first = lines[0] ?? title
  return createSlideSnapshot(
    [
      {
        backgroundRgb: '#FFFFFF',
        title: first,
        fontScale: 1,
        shapes: [
          {
            text: first,
            placeholderType: 'title',
            style: { fontSizePt: 40, bold: true, color: '#000000' },
            box: fallbackBox('title'),
          },
          {
            text: lines.slice(1).join('\n'),
            placeholderType: 'body',
            style: { fontSizePt: 18, color: '#000000' },
            box: fallbackBox('body'),
          },
        ],
      },
    ],
    title,
    locale,
  )
}

/**
 * Serializes a Univer `ISlideData` snapshot into `.pptx` bytes.
 * Writes each text element with position/size/font/color plus the page background.
 * @param slideData - Univer slide deck snapshot.
 * @returns `.pptx` file blob.
 */
export async function exportPptx(slideData: ISlideData): Promise<Blob> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({
    name: 'GEOCRM_16x9',
    width: SLIDE_WIDTH_PX / PX_PER_INCH,
    height: SLIDE_HEIGHT_PX / PX_PER_INCH,
  })
  pptx.layout = 'GEOCRM_16x9'

  const pageOrder = slideData.body?.pageOrder ?? []
  const pages = slideData.body?.pages ?? {}
  for (const pageId of pageOrder) {
    const page = pages[pageId]
    if (!page) {
      continue
    }
    const background = page.pageBackgroundFill?.rgb ?? '#FFFFFF'
    const slide = pptx.addSlide()
    slide.background = { color: background.replace(/^#/, '') }

    const elements = Object.values(page.pageElements)
      .filter((element) => element.type === PageElementType.TEXT && element.richText?.text)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))

    for (const element of elements) {
      const text = element.richText?.text ?? ''
      if (!text.trim()) {
        continue
      }
      slide.addText(text, {
        x: (element.left ?? 0) / PX_PER_INCH,
        y: (element.top ?? 0) / PX_PER_INCH,
        w: Math.max(0.2, (element.width ?? 100) / PX_PER_INCH),
        h: Math.max(0.2, (element.height ?? 40) / PX_PER_INCH),
        fontSize: element.richText?.fs ?? 18,
        color: (element.richText?.cl?.rgb ?? '#000000').replace(/^#/, ''),
        bold: element.richText?.bl === BooleanNumber.TRUE,
        valign: 'top',
      })
    }
  }
  if (pageOrder.length === 0) {
    pptx.addSlide()
  }

  const output = await pptx.write({ outputType: 'blob' })
  return output as Blob
}
