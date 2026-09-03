export interface Category {
  id: string
  position: number
}

export interface AppItem {
  id: string
  categoryId: string
  position: number
  url: string
  name: string
  /**
   * Icon URL for the tile: absolute http(s) URL or bundled public path
   * (e.g. `http://…/POWERSOURCE.png` or `/brand.png`).
   * Function tiles always set this; websites leave it unset and use remote favicons.
   */
  icon?: string
  /**
   * When true, the Functions rail shows a Beta badge on the tile
   * (incomplete / in-progress built-in features).
   */
  beta?: boolean
}

/**
 * Picks the display name for an app tile.
 * Function tiles store an i18n key (`functions.apps.*`) in `name`.
 * @param app - App row from the library API or built-in Function tiles.
 * @param translate - Optional i18n translator (used when `name` is a key).
 * @returns Display name.
 */
export function getAppDisplayName(
  app: AppItem,
  translate?: (key: string) => string,
): string {
  if (translate && app.name.startsWith('functions.apps.')) {
    return translate(app.name)
  }
  return app.name
}
