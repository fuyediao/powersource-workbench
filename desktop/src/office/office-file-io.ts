/** Accept filter + suggested extension for one Univer office kind. */
export interface OfficeFileKindIo {
  accept: string
  extension: string
  mime: string
}

/**
 * Opens the system file picker and reads one file as raw bytes.
 * @param accept - Input accept filter (e.g. `.docx`).
 * @returns File name + bytes, or null when the user cancels.
 */
export function pickBinaryFile(accept: string): Promise<{ name: string; buffer: ArrayBuffer } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (result instanceof ArrayBuffer) {
          resolve({ name: file.name, buffer: result })
        } else {
          resolve(null)
        }
      }
      reader.onerror = () => resolve(null)
      reader.readAsArrayBuffer(file)
    }
    input.click()
  })
}

/**
 * Triggers a browser/Electron download of a binary blob.
 * @param filename - Suggested download name.
 * @param blob - File content.
 * @returns Nothing.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/**
 * Strips a known office extension from a file name, if present.
 * @param name - File name.
 * @param extensions - Extensions to strip (without the leading dot).
 * @returns Base name without extension.
 */
export function stripExtension(name: string, extensions: readonly string[]): string {
  const match = extensions.find((extension) => name.toLowerCase().endsWith(`.${extension}`))
  return match ? name.slice(0, -(match.length + 1)) : name
}
