export type OcrScript = "eng" | "chi_sim" | "chi_tra";
export type OcrLayout = "document" | "scattered";
export type OcrProgress = { phase: "loading" | "recognizing"; progress: number };
export type OcrResult = { text: string; confidence: number };
export const ocrLanguages = (script: OcrScript) => script === "eng" ? ["eng"] : [script, "eng"];
export const cleanOcrText = (text: string) => text.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
export const ocrAssetBase = (base = import.meta.env.BASE_URL, href = document.baseURI) => new URL(`${base}ocr/v1/`, href);

// This adapter uses the pinned Tesseract.js 7 worker protocol so cancellation
// can terminate the worker even while its core or language data is loading.
export class LensOcr {
  private worker?: Worker;
  private reject?: (error: unknown) => void;
  private generation = 0;
  constructor(private factory: (url: URL) => Worker = url => new Worker(url)) {}
  cancel(reason: unknown = new DOMException("Cancelled", "AbortError")) {
    this.generation++;
    this.worker?.terminate();
    this.worker = undefined;
    this.reject?.(reason);
    this.reject = undefined;
  }
  async recognize(blob: Blob, script: OcrScript, layout: OcrLayout, signal: AbortSignal, report: (p: OcrProgress) => void, base = ocrAssetBase()): Promise<OcrResult> {
    this.cancel();
    const generation = this.generation;
    signal.throwIfAborted();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    signal.throwIfAborted();
    if (generation !== this.generation) throw new DOMException("Cancelled", "AbortError");
    const worker = this.factory(new URL("worker.min.js", base));
    this.worker = worker;
    const workerId = crypto.randomUUID();
    let sequence = 0;
    let phase: OcrProgress["phase"] = "loading";
    const abort = () => this.cancel();
    signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => this.cancel(Error("OCR_TIMEOUT")), 180000);
    const request = (action: string, payload: unknown, transfer: Transferable[] = []) => new Promise<any>((resolve, reject) => {
      const jobId = `${workerId}-${sequence++}`;
      this.reject = reject;
      worker.onerror = () => reject(Error("OCR_LOAD_FAILED"));
      worker.onmessageerror = () => reject(Error("OCR_INVALID_RESULT"));
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker || data.workerId !== workerId || data.jobId !== jobId) return;
        if (data.status === "progress") report({ phase, progress: Math.max(0, Math.min(1, Number(data.data?.progress) || 0)) });
        if (data.status === "reject") reject(Error("OCR_FAILED"));
        if (data.status === "resolve") { this.reject = undefined; resolve(data.data); }
      };
      worker.postMessage({ workerId, jobId, action, payload }, transfer);
    });
    try {
      report({ phase, progress: 0 });
      await request("load", { options: { lstmOnly: true, corePath: new URL("core/", base).href, logging: false } });
      const langs = ocrLanguages(script);
      await request("loadLanguage", { langs, options: { langPath: new URL("data", base).href, gzip: true, lstmOnly: true, cacheMethod: "none" } });
      await request("initialize", { langs, oem: 1, config: {} });
      await request("setParameters", { params: { tessedit_pageseg_mode: layout === "scattered" ? "11" : "3", user_defined_dpi: "300" } });
      phase = "recognizing";
      report({ phase, progress: 0 });
      const result = await request("recognize", { image: bytes, options: {}, output: { text: true } }, [bytes.buffer]);
      if (typeof result?.text !== "string") throw Error("OCR_INVALID_RESULT");
      return { text: cleanOcrText(result.text), confidence: Number.isFinite(result.confidence) ? result.confidence : 0 };
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      if (this.worker === worker) { this.worker = undefined; this.reject = undefined; }
    }
  }
}
