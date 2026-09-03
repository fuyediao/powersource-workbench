/** POWERSOURCE OA / ERP silent login (aligned with renderer host list). */

import { createHash } from 'node:crypto'
import type { Session } from 'electron'

const POWERSOURCE_HOSTS = ['192.168.0.5', '219.129.189.58', '61.29.250.144'] as const
const POWERSOURCE_OA_PORT = 86
const POWERSOURCE_ERP_PORT = 8068

/** Result of a silent OA/ERP login attempt. */
export type SilentPowersourceLoginResult =
  | { ok: true; finalUrl: string }
  | { ok: false; reason: string }

type PowersourceSystem = 'oa' | 'erp'

/**
 * Returns MD5 hex digest (ERP client hashes the password with `$.md5` before POST).
 *
 * @param value - Plaintext password
 * @returns Lowercase hex MD5
 */
function md5Hex(value: string): string {
  return createHash('md5').update(value, 'utf8').digest('hex')
}

/**
 * Resolves OA vs ERP from a login URL host/port.
 *
 * @param url - Absolute login URL
 * @returns System id, or null when not a known POWERSOURCE endpoint
 */
export function powersourceSystemFromUrl(url: string): PowersourceSystem | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null
  }
  if (!(POWERSOURCE_HOSTS as readonly string[]).includes(parsed.hostname)) {
    return null
  }
  const port = parsed.port
    ? Number(parsed.port)
    : parsed.protocol === 'https:'
      ? 443
      : 80
  if (port === POWERSOURCE_OA_PORT) {
    return 'oa'
  }
  if (port === POWERSOURCE_ERP_PORT) {
    return 'erp'
  }
  return null
}

/**
 * Returns whether the URL is one of the six OA/ERP login endpoints.
 *
 * @param url - Absolute page URL
 * @returns True when host+port match a known POWERSOURCE login origin
 */
export function isPowersourceLoginUrl(url: string): boolean {
  return powersourceSystemFromUrl(url) !== null
}

/**
 * Reads a hidden/input value from ASP.NET login HTML.
 *
 * @param html - Login page HTML
 * @param name - Input name attribute
 * @returns Value or empty string
 */
function extractInputValue(html: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`name=["']${escaped}["'][^>]*value=["']([^"']*)["']`, 'i'),
    new RegExp(`value=["']([^"']*)["'][^>]*name=["']${escaped}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(html)
    if (match?.[1] !== undefined) {
      return match[1]
    }
  }
  return ''
}

/**
 * Returns whether HTML still looks like the shared username/password login UI.
 *
 * @param html - Response body
 * @returns True when username/password fields are present
 */
function looksLikeLoginForm(html: string): boolean {
  return (
    /id=["']txtUserName["']/i.test(html) &&
    /id=["']txtPassword["']/i.test(html) &&
    /id=["']btnLogin["']/i.test(html)
  )
}

/**
 * Builds the OA post-login landing URL (`V_Main.aspx`).
 *
 * @param loginUrl - Login origin URL
 * @returns Absolute main page URL
 */
function oaMainUrl(loginUrl: string): string {
  return new URL('/V_Main.aspx', loginUrl).href
}

/**
 * Builds the ERP post-login landing URL (`/Home`, optional UI theme).
 *
 * @param loginUrl - Login origin URL
 * @param uiTheme - Optional theme from CheckLogin `resultdata.UItheme`
 * @returns Absolute home URL
 */
function erpHomeUrl(loginUrl: string, uiTheme?: string): string {
  const home = new URL('/Home', loginUrl)
  if (uiTheme) {
    home.searchParams.set('UItheme', uiTheme)
  }
  return home.href
}

/**
 * Silent OA login: ASP.NET WebForms POST to `/` then open `V_Main.aspx`.
 *
 * @param session - Pane session
 * @param loginUrl - Absolute OA login URL
 * @param username - Account (typically `PS` + 4 digits)
 * @param password - Plaintext password
 * @returns Login result
 */
async function performSilentOaLogin(
  session: Session,
  loginUrl: string,
  username: string,
  password: string,
): Promise<SilentPowersourceLoginResult> {
  const loginOrigin = new URL(loginUrl).origin
  const normalizedLogin = new URL('/', loginUrl).href

  let getResponse: Response
  try {
    getResponse = await session.fetch(normalizedLogin, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
  } catch {
    return { ok: false, reason: 'login_get_failed' }
  }

  const loginHtml = await getResponse.text()
  if (!looksLikeLoginForm(loginHtml)) {
    if (getResponse.ok) {
      const current = getResponse.url || normalizedLogin
      if (/V_Main\.aspx/i.test(current)) {
        return { ok: true, finalUrl: current }
      }
      return { ok: true, finalUrl: oaMainUrl(normalizedLogin) }
    }
    return { ok: false, reason: 'no_login_form' }
  }

  const body = new URLSearchParams()
  const hiddenNames = [
    '__RefreshPageGuid',
    '__RefreshHiddenField',
    '__EVENTTARGET',
    '__EVENTARGUMENT',
    '__VIEWSTATE',
    '__VIEWSTATEGENERATOR',
    '__EVENTVALIDATION',
    'hidip',
    'hidpsip',
  ] as const
  for (const name of hiddenNames) {
    body.set(name, extractInputValue(loginHtml, name))
  }
  body.set('txtUserName', username)
  body.set('txtPassword', password)
  body.set('btnLogin', '登 录')

  let postResponse: Response
  try {
    postResponse = await session.fetch(normalizedLogin, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: loginOrigin,
        Referer: normalizedLogin,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      body: body.toString(),
    })
  } catch {
    return { ok: false, reason: 'login_post_failed' }
  }

  const postHtml = await postResponse.text()
  const responseUrl = postResponse.url || normalizedLogin

  if (/验证失败/i.test(postHtml) && looksLikeLoginForm(postHtml)) {
    return { ok: false, reason: 'auth_failed' }
  }
  if (looksLikeLoginForm(postHtml) && !/V_Main\.aspx/i.test(responseUrl)) {
    return { ok: false, reason: 'auth_failed' }
  }
  if (/V_Main\.aspx/i.test(responseUrl)) {
    return { ok: true, finalUrl: responseUrl }
  }
  return { ok: true, finalUrl: oaMainUrl(normalizedLogin) }
}

/** JSON body from ERP `POST /Login/CheckLogin`. */
interface ErpCheckLoginResponse {
  type?: number
  message?: string
  resultdata?: { UItheme?: string } | null
}

/**
 * Silent ERP login: MD5 password + `POST /Login/CheckLogin`, then open `/Home`.
 *
 * @param session - Pane session
 * @param loginUrl - Absolute ERP login URL
 * @param username - Account (typically `PS` + 4 digits)
 * @param password - Plaintext password (hashed before POST)
 * @returns Login result
 */
async function performSilentErpLogin(
  session: Session,
  loginUrl: string,
  username: string,
  password: string,
): Promise<SilentPowersourceLoginResult> {
  const loginOrigin = new URL(loginUrl).origin
  const normalizedLogin = new URL('/', loginUrl).href
  const checkUrl = new URL('/Login/CheckLogin', loginUrl).href

  // Warm session cookies from the login page (same as a browser visit).
  try {
    await session.fetch(normalizedLogin, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
  } catch {
    return { ok: false, reason: 'login_get_failed' }
  }

  const body = new URLSearchParams()
  body.set('username', username)
  body.set('password', md5Hex(password))
  body.set('autologin', '0')

  let postResponse: Response
  try {
    postResponse = await session.fetch(checkUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: loginOrigin,
        Referer: normalizedLogin,
        Accept: 'application/json, text/javascript, */*; q=0.01',
      },
      body: body.toString(),
    })
  } catch {
    return { ok: false, reason: 'login_post_failed' }
  }

  let payload: ErpCheckLoginResponse
  try {
    payload = (await postResponse.json()) as ErpCheckLoginResponse
  } catch {
    return { ok: false, reason: 'invalid_login_response' }
  }

  // Captured client: `data.type == 1` means success → `/Home`.
  if (payload.type === 1) {
    const theme =
      payload.resultdata && typeof payload.resultdata.UItheme === 'string'
        ? payload.resultdata.UItheme
        : undefined
    return { ok: true, finalUrl: erpHomeUrl(normalizedLogin, theme) }
  }
  return { ok: false, reason: 'auth_failed' }
}

/**
 * Performs silent POWERSOURCE login for OA (WebForms) or ERP (CheckLogin + MD5).
 *
 * @param session - Electron session tied to the in-app browser pane
 * @param loginUrl - Absolute OA/ERP login URL
 * @param username - Account / employee id (typically `PS` + 4 digits)
 * @param password - Plaintext password
 * @returns Success with landing URL, or failure reason
 */
export async function performSilentPowersourceLogin(
  session: Session,
  loginUrl: string,
  username: string,
  password: string,
): Promise<SilentPowersourceLoginResult> {
  const system = powersourceSystemFromUrl(loginUrl)
  if (!system) {
    return { ok: false, reason: 'not_powersource_login' }
  }
  const trimmedUser = username.trim()
  if (!trimmedUser || !password) {
    return { ok: false, reason: 'empty_credentials' }
  }

  if (system === 'erp') {
    return performSilentErpLogin(session, loginUrl, trimmedUser, password)
  }
  return performSilentOaLogin(session, loginUrl, trimmedUser, password)
}
