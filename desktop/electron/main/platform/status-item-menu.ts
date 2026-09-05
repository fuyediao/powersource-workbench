import { Menu, type MenuItemConstructorOptions } from 'electron'
import { APP_SHORT_NAME } from '../../shared/app-identity'
import type { ApplicationMenuLabels } from '../../shared/ipc'
import {
  QUIT_ACCELERATOR,
  SETTINGS_ACCELERATOR,
  SPOTLIGHT_ACCELERATOR,
} from '../../shared/platform'
import { toggleSpotlight } from '../spotlight'

/** Labels used by the menu-bar extra / tray. */
export type StatusItemLabels = Pick<
  ApplicationMenuLabels,
  'openApp' | 'spotlight' | 'settings' | 'signOut' | 'quit'
>

/** Fallback labels before the renderer syncs app i18n. */
export const DEFAULT_STATUS_ITEM_LABELS: StatusItemLabels = {
  openApp: `Open ${APP_SHORT_NAME}`,
  spotlight: 'Spotlight',
  settings: 'Settings…',
  signOut: 'Sign out',
  quit: `Quit ${APP_SHORT_NAME}`,
}

interface StatusItemMenuOptions {
  signedIn: boolean
  labels: StatusItemLabels
  onOpen: () => void
  onSettings: () => void
  onSignOut: () => void
  onQuit: () => void
}

/**
 * Builds the menu-bar extra / tray context menu (Open, Spotlight,
 * Settings, Sign out, Quit). Accelerators are display-only so the app menu and
 * global shortcuts stay in charge.
 * @param options - Labels, signed-in flag, and click handlers.
 * @returns Electron menu.
 */
export function buildStatusItemMenu(options: StatusItemMenuOptions): Menu {
  const { signedIn, labels, onOpen, onSettings, onSignOut, onQuit } = options
  const template: MenuItemConstructorOptions[] = [
    {
      label: labels.openApp,
      click: onOpen,
    },
    {
      label: labels.spotlight,
      accelerator: SPOTLIGHT_ACCELERATOR,
      registerAccelerator: false,
      enabled: signedIn,
      click: () => {
        void toggleSpotlight()
      },
    },
    {
      label: labels.settings,
      accelerator: SETTINGS_ACCELERATOR,
      registerAccelerator: false,
      enabled: signedIn,
      click: onSettings,
    },
    {
      label: labels.signOut,
      enabled: signedIn,
      click: onSignOut,
    },
    { type: 'separator' },
    {
      label: labels.quit,
      accelerator: QUIT_ACCELERATOR,
      registerAccelerator: false,
      click: onQuit,
    },
  ]
  return Menu.buildFromTemplate(template)
}
