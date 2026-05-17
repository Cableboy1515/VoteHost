declare module "svg-to-pdfkit" {
  function SVGtoPDF(
    doc: PDFKit.PDFDocument,
    svg: string,
    x: number,
    y: number,
    options?: {
      width?: number
      height?: number
      preserveAspectRatio?: string
      fontCallback?: (family: string, bold: boolean, italic: boolean, opts: object) => string
      assumePt?: boolean
      warningCallback?: (msg: string) => void
    }
  ): void
  export = SVGtoPDF
}
