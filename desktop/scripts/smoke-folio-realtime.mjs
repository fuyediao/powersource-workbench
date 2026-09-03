#!/usr/bin/env node
/**
 * Folio Realtime transport smoke test: opens two Supabase Realtime clients on the same
 * `folio-page:{id}` broadcast channel (simulating two Electron windows on the same page)
 * and verifies each side receives the other's `yjs` and `awareness` broadcasts — the exact
 * mechanism `src/components/folio/folio-editor.tsx` relies on for live collaboration.
 *
 * Usage: node scripts/smoke-folio-realtime.mjs (reads VITE_DEPLOYMENT_DOMAIN /
 * VITE_SUPABASE_ANON_KEY from `.env` in this package).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

/**
 * Load `KEY=value` pairs from a dotenv-style file, ignoring comments/blank lines.
 * @param {string} file - Absolute path to the env file.
 * @returns {Record<string, string>} Parsed key/value map.
 */
function loadEnv(file) {
  const out = {}
  if (!fs.existsSync(file)) {
    return out
  }
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      continue
    }
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

const env = { ...loadEnv(path.join(packageDir, '.env')), ...process.env }
const domain = env.VITE_DEPLOYMENT_DOMAIN
const anonKey = env.VITE_SUPABASE_ANON_KEY

if (!domain || !anonKey) {
  console.error('Missing VITE_DEPLOYMENT_DOMAIN / VITE_SUPABASE_ANON_KEY (checked .env + process.env).')
  process.exit(1)
}

const supabaseUrl = `https://supabase.${domain}`
const pageId = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const channelName = `folio-page:${pageId}`

/**
 * Wait for a broadcast event on a channel, or reject after a timeout.
 * @param {import('@supabase/supabase-js').RealtimeChannel} channel - Channel to listen on.
 * @param {string} event - Broadcast event name.
 * @param {number} timeoutMs - How long to wait.
 * @returns {Promise<unknown>} The received payload.
 */
function waitForBroadcast(channel, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), timeoutMs)
    channel.on('broadcast', { event }, ({ payload }) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

/**
 * Subscribe a channel and resolve once Realtime confirms `SUBSCRIBED`.
 * @param {import('@supabase/supabase-js').RealtimeChannel} channel - Channel to subscribe.
 * @returns {Promise<void>}
 */
function subscribed(channel) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout subscribing')), 8000)
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer)
        resolve()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer)
        reject(new Error(`subscribe failed: ${status}`))
      }
    })
  })
}

async function main() {
  const windowA = createClient(supabaseUrl, anonKey)
  const windowB = createClient(supabaseUrl, anonKey)

  const channelA = windowA.channel(channelName)
  const channelB = windowB.channel(channelName)

  await Promise.all([subscribed(channelA), subscribed(channelB)])
  console.log(`PASS: both windows subscribed to ${channelName}`)

  const yjsToB = waitForBroadcast(channelB, 'yjs')
  await channelA.send({ type: 'broadcast', event: 'yjs', payload: { update: 'A->B' } })
  const receivedByB = await yjsToB
  if (receivedByB.update !== 'A->B') {
    throw new Error(`unexpected payload at window B: ${JSON.stringify(receivedByB)}`)
  }
  console.log('PASS: window A yjs broadcast received by window B')

  const yjsToA = waitForBroadcast(channelA, 'yjs')
  await channelB.send({ type: 'broadcast', event: 'yjs', payload: { update: 'B->A' } })
  const receivedByA = await yjsToA
  if (receivedByA.update !== 'B->A') {
    throw new Error(`unexpected payload at window A: ${JSON.stringify(receivedByA)}`)
  }
  console.log('PASS: window B yjs broadcast received by window A')

  const awarenessToB = waitForBroadcast(channelB, 'awareness')
  await channelA.send({ type: 'broadcast', event: 'awareness', payload: { update: 'A-cursor' } })
  await awarenessToB
  console.log('PASS: window A awareness broadcast received by window B')

  await windowA.removeChannel(channelA)
  await windowB.removeChannel(channelB)
  console.log('--- ALL FOLIO REALTIME SMOKE CHECKS PASSED ---')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('FAIL:', error.message)
    process.exit(1)
  })
