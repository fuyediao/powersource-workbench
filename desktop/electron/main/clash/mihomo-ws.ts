import { randomBytes, randomUUID } from 'node:crypto'
import net from 'node:net'

import { controllerSocketPath, readClashSecret } from './store'

type WsSession = {
  socket: net.Socket
  buffer: Buffer
}

const sessions = new Map<string, WsSession>()

/**
 * Builds a masked WebSocket text/close/pong frame (RFC 6455 client).
 * @param opcode - Frame opcode.
 * @param payload - Frame payload.
 * @returns Wire bytes.
 */
function encodeFrame(opcode: number, payload: Buffer): Buffer {
  const mask = randomBytes(4)
  const length = payload.length
  let header: Buffer
  if (length < 126) {
    header = Buffer.alloc(2)
    header[1] = 0x80 | length
  } else if (length < 65536) {
    header = Buffer.alloc(4)
    header[1] = 0x80 | 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 0x80 | 127
    header.writeUInt32BE(0, 2)
    header.writeUInt32BE(length, 6)
  }
  header[0] = 0x80 | opcode
  const masked = Buffer.alloc(length)
  for (let i = 0; i < length; i += 1) {
    masked[i] = payload[i] ^ mask[i % 4]
  }
  return Buffer.concat([header, mask, masked])
}

/**
 * Parses one server WebSocket frame from a buffer.
 * @param buffer - Incoming bytes.
 * @returns Frame plus remainder, or null when incomplete.
 */
function decodeFrame(buffer: Buffer): {
  opcode: number
  payload: Buffer
  rest: Buffer
} | null {
  if (buffer.length < 2) {
    return null
  }
  const opcode = buffer[0] & 0x0f
  const masked = (buffer[1] & 0x80) !== 0
  let length = buffer[1] & 0x7f
  let offset = 2
  if (length === 126) {
    if (buffer.length < 4) {
      return null
    }
    length = buffer.readUInt16BE(2)
    offset = 4
  } else if (length === 127) {
    if (buffer.length < 10) {
      return null
    }
    length = buffer.readUInt32BE(6)
    offset = 10
  }
  const maskOffset = offset
  if (masked) {
    offset += 4
  }
  if (buffer.length < offset + length) {
    return null
  }
  let payload = buffer.subarray(offset, offset + length)
  if (masked) {
    const mask = buffer.subarray(maskOffset, maskOffset + 4)
    const copy = Buffer.from(payload)
    for (let i = 0; i < copy.length; i += 1) {
      copy[i] = copy[i] ^ mask[i % 4]
    }
    payload = copy
  }
  return { opcode, payload, rest: buffer.subarray(offset + length) }
}

/**
 * Opens a Mihomo websocket over the controller IPC socket.
 * @param pathname - Path such as /traffic.
 * @param onText - Text-frame callback (session id plus payload).
 * @param sessionId - Optional id so the renderer can subscribe first.
 * @returns Session id.
 */
export function openMihomoWs(
  pathname: string,
  onText: (id: string, data: string) => void,
  sessionId?: string,
): Promise<string> {
  const id = sessionId && sessionId.length > 0 ? sessionId : randomUUID()
  const secret = readClashSecret()
  const pathWithQuery = pathname.includes('?')
    ? `${pathname}&token=${encodeURIComponent(secret)}`
    : `${pathname}?token=${encodeURIComponent(secret)}`
  const key = randomBytes(16).toString('base64')
  const request = [
    `GET ${pathWithQuery} HTTP/1.1`,
    'Host: localhost',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${key}`,
    'Sec-WebSocket-Version: 13',
    `Authorization: Bearer ${secret}`,
    '',
    '',
  ].join('\r\n')

  return new Promise((resolve, reject) => {
    const socket = net.connect(controllerSocketPath())
    let headerBuf = Buffer.alloc(0)
    let upgraded = false
    const session: WsSession = { socket, buffer: Buffer.alloc(0) }

    const fail = (error: Error) => {
      socket.destroy()
      sessions.delete(id)
      reject(error)
    }

    socket.once('error', (error) => {
      if (!upgraded) {
        fail(error)
      }
    })

    socket.on('data', (chunk: Buffer) => {
      if (!upgraded) {
        headerBuf = Buffer.concat([headerBuf, chunk])
        const split = headerBuf.indexOf('\r\n\r\n')
        if (split < 0) {
          return
        }
        const header = headerBuf.subarray(0, split).toString('utf8')
        const rest = headerBuf.subarray(split + 4)
        if (!header.startsWith('HTTP/1.1 101')) {
          fail(new Error(`Mihomo websocket upgrade failed: ${pathname}`))
          return
        }
        upgraded = true
        sessions.set(id, session)
        session.buffer = rest
        resolve(id)
        if (rest.length === 0) {
          return
        }
      } else {
        session.buffer = Buffer.concat([session.buffer, chunk])
      }
      while (true) {
        const frame = decodeFrame(session.buffer)
        if (!frame) {
          break
        }
        session.buffer = frame.rest
        if (frame.opcode === 1) {
          onText(id, frame.payload.toString('utf8'))
        } else if (frame.opcode === 8) {
          closeMihomoWs(id)
        } else if (frame.opcode === 9) {
          socket.write(encodeFrame(0x0a, frame.payload))
        }
      }
    })

    socket.on('close', () => {
      sessions.delete(id)
    })

    socket.write(request)
  })
}

/**
 * Closes one Mihomo websocket session.
 * @param id - Session id from {@link openMihomoWs}.
 */
export function closeMihomoWs(id: string): void {
  const session = sessions.get(id)
  if (!session) {
    return
  }
  sessions.delete(id)
  try {
    session.socket.write(encodeFrame(0x08, Buffer.alloc(0)))
  } catch {
    // Already closed.
  }
  session.socket.destroy()
}

/**
 * Closes every Mihomo websocket (core restart).
 */
export function closeAllMihomoWs(): void {
  const ids = Array.from(sessions.keys())
  for (const id of ids) {
    closeMihomoWs(id)
  }
}
