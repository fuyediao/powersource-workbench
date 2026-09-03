import { Menu, type MenuItemConstructorOptions } from 'electron'
import { APP_DISPLAY_NAME } from '../../shared/app-identity'
import type { ApplicationMenuLabels } from '../../shared/ipc'
import {
  AGENT_OVERLAY_ACCELERATOR,
  QUIT_ACCELERATOR,
  SETTINGS_ACCELERATOR,
  SPOTLIGHT_ACCELERATOR,
} from '../../shared/platform'
import { toggleAgentOverlay } from '../agent-overlay'
import { toggleSpotlight } from '../spotlight'

/** Labels used by the menu-bar extra / tray. */
export type StatusItemLabels = Pick<
  ApplicationMenuLabels,
  'openApp' | 'agentOverlay' | 'spotlight' | 'settings' | 'signOut' | 'quit'
>

/** Fallback labels before the renderer syncs app i18n. */
export const DEFAULT_STATUS_ITEM_LABELS: StatusItemLabels = {
  openApp: `Open ${APP_DISPLAY_NAME}`,
  agentOverlay: 'Ask Agent',
  spotlight: 'Spotlight',
  settings: 'Settings…',
  signOut: 'Sign out',
  quit: `Quit ${APP_DISPLAY_NAME}`,
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
 * Builds the menu-bar extra / tray context menu (Open, Ask Agent, Spotlight,
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
      label: labels.agentOverlay,
      accelerator: AGENT_OVERLAY_ACCELERATOR,
      registerAccelerator: false,
      enabled: signedIn,
      click: () => {
        void toggleAgentOverlay()
      },
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
