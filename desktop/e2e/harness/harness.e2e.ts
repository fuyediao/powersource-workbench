import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

/* oxlint-disable no-empty-pattern */

interface RunningHarnessApp {
  app: ElectronApplication
  page: Page
}

/** Launches the compiled Electron app on an isolated local profile. */
async function launchHarness(userDataDir: string, hostDisabled = false): Promise<RunningHarnessApp> {
  const app = await electron.launch({
    args: ['.', '--harness-e2e', `--user-data-dir=${userDataDir}`],
    cwd: path.resolve(import.meta.dirname, '../..'),
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      WORKBENCH_HARNESS_E2E: '1',
      WORKBENCH_DISABLE_CODEX_HOST: hostDisabled ? '1' : '0',
    },
  })
  const page = await app.firstWindow()
  page.on('pageerror', (error) => {
    process.stderr.write(`[Harness renderer error] ${error.stack ?? error.message}\n`)
  })
  await page.waitForFunction(() => Boolean(window.workbench?.harness))
  return { app, page }
}

/** Returns live Canvas file names, excluding the per-conversation archive folder. */
async function liveCanvasNames(folder: string): Promise<string[]> {
  return (await readdir(folder)).filter((name) => name !== '.sessions')
}

/** Terminates an E2E Electron instance without tray or close-to-hide behavior. */
async function stopHarness(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => undefined)
}

/** Reads text rendered by the isolated native Harness Canvas preview. */
async function canvasPreviewText(app: ElectronApplication): Promise<string> {
  return app.evaluate(async ({ webContents }) => {
    const preview = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL().startsWith('data:text/html'))
    if (!preview) return ''
    return preview.executeJavaScript('document.body?.innerText ?? ""') as Promise<string>
  })
}

test('persists device-only Harness settings in SQLite across app restarts', async ({}, testInfo) => {
  const userDataDir = testInfo.outputPath('profile')
  const first = await launchHarness(userDataDir)
  await first.page.evaluate(async () => {
    await window.workbench.harness.setDevicePreferences({
      approvalMode: 'askAlways',
      computerUseEnabled: true,
      webSearchEnabled: true,
      computerUseTarget: { id: 'display:1', kind: 'display', label: 'Primary display' },
      sidebarVisible: false,
      utilitySidebarVisible: false,
      utilitySidebarWidth: 540,
      workFolder: 'C:\\Harness E2E',
      mcpServers: [{ name: 'local-test', transport: 'stdio', command: 'node', args: ['server.mjs'] }],
    })
  })
  await stopHarness(first.app)

  const second = await launchHarness(userDataDir)
  const preferences = await second.page.evaluate(() => window.workbench.harness.getDevicePreferences())
  expect(preferences).toMatchObject({
    approvalMode: 'askAlways',
    computerUseEnabled: true,
    webSearchEnabled: true,
    sidebarVisible: false,
    utilitySidebarVisible: false,
    utilitySidebarWidth: 540,
    workFolder: 'C:\\Harness E2E',
    mcpServers: [{ name: 'local-test', transport: 'stdio', command: 'node' }],
  })
  await stopHarness(second.app)
})

test('shows a real unavailable-host state and never starts a fixture task', async ({}, testInfo) => {
  const running = await launchHarness(testInfo.outputPath('offline-profile'), true)
  await expect(running.page.getByText(/Local workflow host unavailable/i)).toBeVisible()
  await expect(running.page.getByRole('button', { name: /Retry connection/i })).toBeVisible()
  await expect(running.page.getByText(/Sample run/i)).toHaveCount(0)
  await running.page.getByRole('button', { name: 'Tools', exact: true }).click()
  await expect(running.page.getByRole('heading', { name: /Featured scenarios/i })).toBeVisible()
  await stopHarness(running.app)
})

test('covers the shared model control, Computer Use, tools, schedules, library, MCP, and history', async ({}, testInfo) => {
  const canvasWorkspace = testInfo.outputPath('canvas-workspace')
  const canvasFolder = path.join(canvasWorkspace, 'canvas')
  await mkdir(canvasFolder, { recursive: true })
  const running = await launchHarness(testInfo.outputPath('navigation-profile'), true)
  try {
    await running.page.evaluate(async (workFolder) => {
      localStorage.setItem('ai_provider_keys', JSON.stringify({
        chatgpt: 'e2e-placeholder-key',
        claude: 'e2e-placeholder-key',
        gemini: 'e2e-placeholder-key',
      }))
      await window.workbench.harness.setDevicePreferences({ sidebarVisible: true, workFolder })
    }, canvasWorkspace)
    await running.page.reload()
    await expect(running.page.getByRole('button', { name: 'Model' })).toBeVisible()
    const sidebarToggle = running.page.getByTestId('harness-sidebar-toggle')
    await expect(running.page.getByTestId('harness-sidebar')).toBeVisible()
    await sidebarToggle.click()
    await expect(running.page.getByTestId('harness-sidebar')).toBeHidden()
    await expect.poll(() => running.page.getByTestId('harness-sidebar').evaluate((element) =>
      element.getBoundingClientRect().width,
    )).toBe(0)
    await expect(sidebarToggle).toHaveAttribute('aria-label', 'Show sidebar')
    await sidebarToggle.click()
    await expect(running.page.getByTestId('harness-sidebar')).toBeVisible()
    await expect.poll(() => running.page.getByTestId('harness-sidebar').evaluate((element) =>
      Math.round(element.getBoundingClientRect().width),
    )).toBe(240)
    const approval = running.page.getByRole('button', { name: 'Approval' })
    await expect(approval).toBeVisible()
    await approval.click()
    await running.page.getByRole('option', { name: 'Full access' }).click()
    await expect(approval).toContainText('Full access')
    await running.page.getByTestId('harness-composer-add').click()
    const webSearch = running.page.getByTestId('harness-web-search-toggle')
    await expect(webSearch).toHaveAttribute('aria-checked', 'false')
    await webSearch.click()
    await expect(webSearch).toHaveAttribute('aria-checked', 'true')
    const deliberation = running.page.getByTestId('harness-deliberation-toggle')
    await expect(deliberation).toHaveAttribute('aria-checked', 'false')
    await deliberation.click()
    await expect(deliberation).toHaveAttribute('aria-checked', 'true')
    await expect(running.page.getByTestId('harness-deliberation-config')).toBeVisible()
    const deliberationSeats = running.page.getByTestId('harness-deliberation-seat')
    await expect(deliberationSeats).toHaveCount(2)
    const councilModels = running.page.getByRole('button', { name: /Council model \d+/ })
    await expect(councilModels).toHaveCount(2)
    const initialCouncilLabels = await councilModels.allTextContents()
    expect(new Set(initialCouncilLabels).size).toBe(2)
    await councilModels.nth(1).click()
    await running.page.getByRole('option', { name: /^Claude ·/ }).click()
    await expect(councilModels.nth(1)).toContainText('Claude')
    await expect(running.page.getByTestId('harness-deliberation-config')).toBeVisible()
    await expect(running.page.getByTestId('harness-deliberation-remove-model').first()).toBeDisabled()
    await expect(running.page.getByTestId('harness-deliberation-remove-model').last()).toBeDisabled()
    const addCouncilModel = running.page.getByTestId('harness-deliberation-add-model')
    await expect(addCouncilModel).toBeEnabled()
    await addCouncilModel.click()
    await expect(deliberationSeats).toHaveCount(3)
    await expect(running.page.getByTestId('harness-deliberation-remove-model').first()).toBeEnabled()
    await running.page.getByTestId('harness-deliberation-remove-model').last().click()
    await expect(deliberationSeats).toHaveCount(2)
    await expect(running.page.getByTestId('harness-deliberation-remove-model').first()).toBeDisabled()
    await expect(running.page.getByTestId('harness-deliberation-remove-model').last()).toBeDisabled()
    const deliberationEffort = running.page.getByRole('button', { name: 'Reasoning for Gemini' }).first()
    await deliberationEffort.click()
    await running.page.getByRole('option', { name: 'High', exact: true }).click()
    await expect(deliberationEffort).toContainText('High')
    await expect(running.page.getByTestId('harness-deliberation-config')).toBeVisible()
    await expect(running.page.getByTestId('harness-deliberation-config')).not.toContainText('Final answer model')
    const computerUse = running.page.getByTestId('harness-computer-use-toggle')
    await expect(computerUse).toBeEnabled()
    await computerUse.click()
    await expect(computerUse).toHaveAttribute('aria-checked', 'true')
    await running.page.getByTestId('harness-composer-add').click()
    await expect(running.page.getByTestId('harness-computer-use-chip')).toBeVisible()

    await running.page.getByRole('button', { name: 'Tools', exact: true }).click()
    await expect(running.page.getByTestId('harness-expert-card')).toHaveCount(94)
    const executors = await running.page.getByTestId('harness-expert-card').evaluateAll((cards) =>
      cards.map((card) => card.getAttribute('data-executor')),
    )
    expect(new Set(executors).size).toBe(94)

    await running.page.getByRole('button', { name: 'Scheduled', exact: true }).click()
    await expect(running.page.getByRole('heading', { name: 'Scheduled' })).toBeVisible()
    await running.page.getByRole('button', { name: 'Library', exact: true }).click()
    await running.page.getByRole('button', { name: 'MCP', exact: true }).click()
    await expect(running.page.getByText(/OpenAI built-in connectors/i)).toBeVisible()
    await running.page.getByRole('button', { name: 'History', exact: true }).click()
    await expect(running.page.getByRole('heading', { name: 'History' })).toBeVisible()
    await running.page.getByRole('button', { name: 'New task', exact: true }).click()
    await writeFile(
      path.join(canvasFolder, 'index.html'),
      '<!doctype html><html><head><title>Canvas test</title></head><body><h1>Canvas E2E</h1><script>setTimeout(()=>console.log("canvas-ready"),1000)</script></body></html>',
      'utf8',
    )
    await writeFile(path.join(canvasFolder, 'document.md'), '# Canvas document\n\nMarkdown preview.', 'utf8')
    const utilitySidebar = running.page.getByTestId('harness-utility-sidebar')
    const utilitySidebarToggle = running.page.getByTestId('harness-utility-sidebar-toggle')
    await expect(utilitySidebarToggle).toHaveAttribute('aria-label', 'Show workspace tools')
    await expect.poll(() => utilitySidebar.evaluate((element) => element.clientWidth)).toBe(0)
    await utilitySidebarToggle.click()
    await expect(utilitySidebarToggle).toHaveAttribute('aria-label', 'Hide workspace tools')
    await expect(utilitySidebar).toBeVisible()
    await expect.poll(() => utilitySidebar.evaluate((element) => element.clientWidth)).toBeGreaterThanOrEqual(359)
    const resizeHandle = running.page.getByRole('separator', { name: 'Resize workspace tools' })
    const initialUtilityWidth = await utilitySidebar.evaluate((element) => element.getBoundingClientRect().width)
    const resizeBounds = await resizeHandle.boundingBox()
    expect(resizeBounds).not.toBeNull()
    if (resizeBounds) {
      await running.page.mouse.move(resizeBounds.x + 2, resizeBounds.y + resizeBounds.height / 2)
      await running.page.mouse.down()
      await running.page.mouse.move(resizeBounds.x - 78, resizeBounds.y + resizeBounds.height / 2, { steps: 5 })
      await running.page.mouse.up()
    }
    await expect.poll(() => utilitySidebar.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(initialUtilityWidth + 60)
    await expect(utilitySidebar.locator('kbd')).toHaveCount(0)
    for (const label of ['Review', 'Terminal', 'Browser', 'Files', 'Canvas', 'Office']) {
      await expect(running.page.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
    await expect(running.page.getByRole('button', { name: 'Side conversation', exact: true })).toHaveCount(0)
    await expect(running.page.getByTestId('harness-utility-add-tab')).toHaveCount(0)
    await running.page.getByRole('button', { name: 'Review', exact: true }).click()
    await expect(running.page.getByTestId('harness-review-page')).toBeVisible()
    const addTab = running.page.getByTestId('harness-utility-add-tab')
    await expect(addTab).toBeVisible()
    await addTab.click()
    for (const label of ['Terminal', 'Browser', 'Files', 'Canvas', 'Office']) {
      await expect(running.page.getByRole('menuitem', { name: label, exact: true })).toBeVisible()
    }
    await running.page.getByRole('menuitem', { name: 'Terminal', exact: true }).click()
    await expect(running.page.getByTestId('harness-terminal-page')).toBeVisible()
    await expect(utilitySidebar.getByTestId('harness-utility-tab')).toHaveCount(2)
    await utilitySidebar.getByTestId('harness-utility-tab').filter({ hasText: 'Review' }).click()
    await expect(running.page.getByTestId('harness-review-page')).toBeVisible()
    await addTab.click()
    await running.page.getByRole('menuitem', { name: 'Browser', exact: true }).click()
    await expect(running.page.getByTestId('harness-browser-page')).toBeVisible()
    await addTab.click()
    await running.page.getByRole('menuitem', { name: 'Files', exact: true }).click()
    await expect(running.page.getByTestId('harness-files-page')).toBeVisible()
    await addTab.click()
    await running.page.getByRole('menuitem', { name: 'Canvas', exact: true }).click()
    await expect(running.page.getByTestId('harness-canvas-page')).toBeVisible()
    await running.page.getByRole('button', { name: 'index.html', exact: true }).click()
    await expect.poll(() => canvasPreviewText(running.app)).toContain('Canvas E2E')
    await running.page.getByRole('button', { name: 'Console', exact: true }).click()
    await expect(running.page.getByTestId('harness-canvas-console')).toContainText('canvas-ready')
    await running.page.getByRole('button', { name: 'Source', exact: true }).click()
    const canvasEditor = running.page.getByTestId('harness-canvas-source-editor')
    const editedHtml = '<!doctype html><html><body><h1>Edited Canvas</h1></body></html>'
    await canvasEditor.fill(editedHtml)
    await expect(running.page.getByTestId('harness-canvas-save-state')).toHaveText('Saved')
    await expect.poll(() => readFile(path.join(canvasFolder, 'index.html'), 'utf8')).toBe(editedHtml)
    await running.page.getByRole('button', { name: 'Preview', exact: true }).click()
    await expect.poll(() => canvasPreviewText(running.app)).toContain('Edited Canvas')
    await running.page.getByRole('button', { name: 'document.md', exact: true }).click()
    await expect(running.page.getByRole('heading', { name: 'Canvas document' })).toBeVisible()
    await addTab.click()
    await running.page.getByRole('menuitem', { name: 'Office', exact: true }).click()
    await expect(running.page.getByText('Sign in to open the Office library.', { exact: true })).toBeVisible()
    await expect(utilitySidebar.getByTestId('harness-utility-tab')).toHaveCount(6)
    await utilitySidebar.getByRole('button', { name: 'Close Office', exact: true }).click()
    await expect(utilitySidebar.getByTestId('harness-utility-tab')).toHaveCount(5)
    await utilitySidebar.getByRole('button', { name: 'Close Review', exact: true }).click()
    await expect(utilitySidebar.getByTestId('harness-utility-tab')).toHaveCount(4)
    await expect(running.page.getByTestId('harness-canvas-page')).toBeVisible()
    const canvasSessionId = 'e2e-canvas-session-01'
    await running.page.evaluate(async ({ cwd, canvasSessionId }) => {
      await window.workbench.harness.parkCanvas(cwd, canvasSessionId)
    }, { cwd: canvasWorkspace, canvasSessionId })
    await expect.poll(async () => (await liveCanvasNames(canvasFolder)).length).toBe(0)
    await expect.poll(async () =>
      running.page.evaluate(
        async ({ cwd, canvasSessionId }) => window.workbench.harness.restoreCanvas(cwd, canvasSessionId),
        { cwd: canvasWorkspace, canvasSessionId },
      ),
    ).toBe(true)
    await expect(running.page.getByRole('button', { name: 'index.html', exact: true })).toBeVisible()
    await running.page.getByRole('button', { name: 'New task', exact: true }).click()
    await expect(running.page.getByTestId('harness-canvas-page')).toHaveCount(0)
    await expect(utilitySidebar.getByTestId('harness-utility-tab').filter({ hasText: 'Canvas' })).toHaveCount(0)
    await expect.poll(async () => (await liveCanvasNames(canvasFolder)).length).toBe(0)
    await utilitySidebarToggle.click()
    await expect(utilitySidebarToggle).toHaveAttribute('aria-label', 'Show workspace tools')
    await expect.poll(() => utilitySidebar.evaluate((element) => element.clientWidth)).toBe(0)
    await utilitySidebarToggle.click()
    await expect(utilitySidebarToggle).toHaveAttribute('aria-label', 'Hide workspace tools')
    await expect.poll(() => utilitySidebar.evaluate((element) => element.clientWidth)).toBeGreaterThan(initialUtilityWidth + 60)
    const firstTaskTitle = 'Review the newest customer opportunities, recent follow-ups, unresolved risks, and next actions across every active account'
    const taskComposer = running.page.getByRole('textbox', { name: 'Ask Harness to do anything...' })
    await taskComposer.fill(firstTaskTitle)
    await taskComposer.press('Enter')
    const activeTitle = running.page.getByTestId('harness-active-title')
    await expect(activeTitle).toHaveText(firstTaskTitle)
    await expect(activeTitle).toHaveAttribute('title', firstTaskTitle)
    const titleDimensions = await activeTitle.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(titleDimensions.clientWidth).toBeLessThanOrEqual(360)
    expect(titleDimensions.scrollWidth).toBeGreaterThan(titleDimensions.clientWidth)
  } finally {
    await stopHarness(running.app)
  }
})
