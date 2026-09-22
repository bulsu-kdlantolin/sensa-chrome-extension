/**
 * @file pdfGenerator.ts
 * @description Zero-dependency, pure client-side PDF compiler for high-resolution canvas documents.
 * Fully compliant with Manifest V3 and Chrome Web Store security requirements.
 * Eliminates all external remotely hosted scripts (e.g. cdnjs, pdfobject, eval) by natively
 * constructing standard ISO 32000 / PDF 1.4 binary documents directly in browser memory.
 */

interface PdfImagePage {
  width: number
  height: number
  data: Uint8Array
}

/**
 * Converts a base64 Data URL to a Uint8Array.
 */
function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1]
  const binaryString = window.atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/**
 * Compiles raster canvas pages into a valid ISO 32000 / PDF 1.4 binary file.
 * Uses native /DCTDecode (JPEG) for zero-dependency, ultra-fast embedding.
 */
export function compilePdfFromImages(images: PdfImagePage[]): Uint8Array {
  // Standard ISO A4 dimensions in PDF points (72 pt / inch)
  const pageWidth = 595.28
  const pageHeight = 841.89

  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let currentOffset = 0

  function writeString(str: string) {
    const buf = new Uint8Array(str.length)
    for (let i = 0; i < str.length; i++) {
      buf[i] = str.charCodeAt(i) & 0xff
    }
    chunks.push(buf)
    currentOffset += buf.length
  }

  function writeBuffer(buf: Uint8Array) {
    chunks.push(buf)
    currentOffset += buf.length
  }

  // Header (PDF 1.4 + binary marker)
  writeString("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n")

  const numPages = images.length
  const totalObjs = 2 + numPages * 3

  // Obj 1: Catalog
  offsets[1] = currentOffset
  writeString(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`)

  // Obj 2: Pages container
  offsets[2] = currentOffset
  const kids: string[] = []
  for (let i = 0; i < numPages; i++) {
    kids.push(`${3 + i * 3} 0 R`)
  }
  writeString(`2 0 obj\n<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${numPages} >>\nendobj\n`)

  // Each page: Page Object, Content Stream, and Image XObject
  for (let i = 0; i < numPages; i++) {
    const pageObjNum = 3 + i * 3
    const contentObjNum = pageObjNum + 1
    const imageObjNum = pageObjNum + 2
    const img = images[i]

    // Page object
    offsets[pageObjNum] = currentOffset
    writeString(
      `${pageObjNum} 0 obj\n<<\n  /Type /Page\n  /Parent 2 0 R\n  /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}]\n  /Resources <<\n    /ProcSet [/PDF /ImageC]\n    /XObject << /Im${i + 1} ${imageObjNum} 0 R >>\n  >>\n  /Contents ${contentObjNum} 0 R\n>>\nendobj\n`
    )

    // Content stream: scale image to fit page
    const contentStr = `q\n${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm\n/Im${i + 1} Do\nQ\n`
    offsets[contentObjNum] = currentOffset
    writeString(
      `${contentObjNum} 0 obj\n<< /Length ${contentStr.length} >>\nstream\n${contentStr}endstream\nendobj\n`
    )

    // Image XObject (native baseline JPEG decoding)
    offsets[imageObjNum] = currentOffset
    const imgHeader = `${imageObjNum} 0 obj\n<<\n  /Type /XObject\n  /Subtype /Image\n  /Width ${img.width}\n  /Height ${img.height}\n  /ColorSpace /DeviceRGB\n  /BitsPerComponent 8\n  /Filter /DCTDecode\n  /Length ${img.data.length}\n>>\nstream\n`
    writeString(imgHeader)
    writeBuffer(img.data)
    writeString("\nendstream\nendobj\n")
  }

  // Cross-reference table (xref)
  const xrefOffset = currentOffset
  writeString(`xref\n0 ${totalObjs + 1}\n`)
  writeString("0000000000 65535 f \n")
  for (let i = 1; i <= totalObjs; i++) {
    const offStr = String(offsets[i]).padStart(10, "0")
    writeString(`${offStr} 00000 n \n`)
  }

  // Trailer
  writeString(
    `trailer\n<<\n  /Size ${totalObjs + 1}\n  /Root 1 0 R\n>>\nstartxref\n${xrefOffset}\n%%EOF\n`
  )

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0)
  const result = new Uint8Array(totalLength)
  let pos = 0
  for (const chunk of chunks) {
    result.set(chunk, pos)
    pos += chunk.length
  }
  return result
}

/**
 * Exports an array of HTML5 Canvases directly to a downloadable multi-page PDF document.
 * @param pages Array of rendered HTMLCanvasElement pages
 * @param filename Desired filename for downloaded PDF
 */
export function exportCanvasesAsPdf(pages: HTMLCanvasElement[], filename: string): void {
  if (!pages || pages.length === 0) return

  const imagePages: PdfImagePage[] = pages.map((canvas) => {
    // 0.95 quality JPEG maintains sharp visual clarity while creating compact files
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95)
    return {
      width: canvas.width,
      height: canvas.height,
      data: dataUrlToUint8Array(dataUrl)
    }
  })

  const pdfBytes = compilePdfFromImages(imagePages)
  const blob = new Blob([pdfBytes], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)

  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
