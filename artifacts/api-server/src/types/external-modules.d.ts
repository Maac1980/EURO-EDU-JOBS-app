/**
 * Ambient declarations for npm modules without bundled @types.
 * Added for the upload-pipeline /goal (PDF/HEIC/DOCX conversion).
 */

declare module "heic-convert" {
  interface HeicConvertOptions {
    buffer: ArrayBufferLike;
    format: "JPEG" | "PNG";
    quality?: number;
  }
  function heicConvert(options: HeicConvertOptions): Promise<ArrayBuffer>;
  export default heicConvert;
}
