/** Browser file helpers, each guarded so a blocked API degrades rather than throws. */

export function downloadTextFile(filename: string, text: string, mimeType = 'application/json') {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Revoke on the next frame so the download has taken the URL.
  requestAnimationFrame(() => URL.revokeObjectURL(url))
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** Reads a user-selected file as text, refusing anything implausibly large. */
export async function readTextFile(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) {
    throw new Error(
      `That file is ${Math.round(file.size / 1024)} KB. The limit is ${Math.round(maxBytes / 1024)} KB.`,
    )
  }
  return file.text()
}
