/**
 * Desktop speech-to-text: MediaRecorder capture + Gemini transcription.
 * Electron Chromium does not ship Chrome's proprietary Web Speech service, so
 * `webkitSpeechRecognition` typically fails with a silent `network` error.
 */

import axios from 'axios'

const GEMINI_TRANSCRIBE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent'

/** Active MediaRecorder session (one at a time). */
let activeRecorder: MediaRecorder | null = null
let activeStream: MediaStream | null = null
let activeChunks: Blob[] = []

/**
 * Returns whether getUserMedia is available for microphone capture.
 *
 * @returns True when the browser can open a mic stream
 */
export function isMicrophoneCaptureSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  )
}

/**
 * Stops any in-flight recorder and releases the mic track.
 *
 * @returns Nothing
 */
function releaseMic(): void {
  try {
    activeRecorder?.stop()
  } catch {
    // already stopped
  }
  activeRecorder = null
  activeStream?.getTracks().forEach((t) => t.stop())
  activeStream = null
  activeChunks = []
}

/**
 * Starts microphone recording. Call {@link stopMicrophoneRecording} to finish.
 *
 * @returns Nothing
 */
export async function startMicrophoneRecording(): Promise<void> {
  if (!isMicrophoneCaptureSupported()) {
    throw new Error('microphone_unsupported')
  }
  releaseMic()

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
    },
    video: false,
  })
  activeStream = stream
  activeChunks = []

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : ''

  const recorder = mimeType
    ? new MediaRecorder(stream, { mimeType })
    : new MediaRecorder(stream)
  activeRecorder = recorder

  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size > 0) {
      activeChunks.push(event.data)
    }
  }

  recorder.start(250)
}

/**
 * Stops recording and returns the captured audio blob.
 *
 * @returns Audio blob (webm/ogg), or null when empty
 */
export async function stopMicrophoneRecording(): Promise<Blob | null> {
  const recorder = activeRecorder
  if (!recorder) {
    releaseMic()
    return null
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    recorder.onstop = () => {
      const type = recorder.mimeType || 'audio/webm'
      const result =
        activeChunks.length > 0 ? new Blob(activeChunks, { type }) : null
      resolve(result)
      activeStream?.getTracks().forEach((t) => t.stop())
      activeStream = null
      activeRecorder = null
      activeChunks = []
    }
    try {
      recorder.stop()
    } catch {
      resolve(null)
      releaseMic()
    }
  })

  return blob
}

/**
 * Cancels an in-progress recording without producing a transcript.
 *
 * @returns Nothing
 */
export function cancelMicrophoneRecording(): void {
  releaseMic()
}

/**
 * Reads a Blob as a base64 string (no data-URL prefix).
 *
 * @param blob - Audio blob
 * @returns Base64 payload
 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * Transcribes an audio blob with the user's Gemini API key.
 *
 * @param blob - Recorded audio
 * @param apiKey - Gemini API key
 * @param speechLang - BCP-47 language hint (e.g. zh-TW)
 * @returns Transcript text
 */
export async function transcribeAudioWithGemini(
  blob: Blob,
  apiKey: string,
  speechLang: string,
): Promise<string> {
  const key = apiKey.trim()
  if (!key) {
    throw new Error('gemini_key_missing')
  }
  if (blob.size < 256) {
    throw new Error('audio_too_short')
  }

  const base64 = await blobToBase64(blob)
  const mimeType = blob.type || 'audio/webm'
  const langHint =
    speechLang === 'zh-TW'
      ? 'Traditional Chinese (Taiwan)'
      : speechLang === 'zh-CN'
        ? 'Simplified Chinese'
        : 'English'

  const { data } = await axios.post<{
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  }>(
    `${GEMINI_TRANSCRIBE_URL}?key=${encodeURIComponent(key)}`,
    {
      contents: [
        {
          parts: [
            {
              text:
                `Transcribe this voice recording to plain text only. ` +
                `Preferred language: ${langHint}. ` +
                `Do not add quotes, labels, or commentary — output the spoken words only.`,
            },
            {
              inline_data: {
                mime_type: mimeType.split(';')[0] || 'audio/webm',
                data: base64,
              },
            },
          ],
        },
      ],
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60_000,
    },
  )

  if (data.error?.message) {
    throw new Error(data.error.message)
  }

  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim() ?? ''

  if (!text) {
    throw new Error('empty_transcript')
  }
  return text
}
