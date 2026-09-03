import { translate } from './translator/translate'
import { enUS } from './locales/en-US'
import { zhCN } from './locales/zh-CN'
import { zhTW } from './locales/zh-TW'

/** Locale packs Workbench actually ships (Settings languages only). */
const translations = {
  enUS,
  zhCN,
  zhTW,
}

export { mergeLocales } from './utils/merge-locales'
export { translate, translations, enUS, zhCN, zhTW }
