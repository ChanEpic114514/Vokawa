import { describe, it, expect, vi } from "vitest";
import { cropFromPoints, cropPixels, imageSize, FULL_CROP } from "../src/lens-image";
import { LensOcr, cleanOcrText, ocrAssetBase, ocrLanguages } from "../src/lens-ocr";
const base = new URL("https://example.com/Vokawa/ocr/v1/");
class FakeWorker {
  onmessage: any; onerror: any; onmessageerror: any;
  terminate = vi.fn(); packets: any[] = []; respond = true;
  postMessage(packet: any) {
    this.packets.push(packet);
    if (this.respond) queueMicrotask(() => this.onmessage?.({ data: { ...packet, status: "resolve", data: packet.action === "recognize" ? { text: "  牛肉飯 $38\n", confidence: 92 } : {} } }));
  }
}
describe("Lens image preparation", () => {
  it("bounds camera output without upscaling small images", () => {
    expect(imageSize(100, 200)).toEqual({ width: 100, height: 200 });
    const size = imageSize(12000, 9000);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(2600);
    expect(size.width * size.height).toBeLessThanOrEqual(4001000);
    expect(() => imageSize(0, 100)).toThrow("IMAGE_SIZE");
  });
  it("normalizes reverse drags and clips out-of-bounds touch input", () => {
    expect(cropFromPoints({ x: 1.2, y: .8 }, { x: -.2, y: .2 })).toEqual({ x: 0, y: .2, width: 1, height: .6000000000000001 });
    expect(cropPixels(FULL_CROP, 1100, 500)).toEqual({ x: 0, y: 0, width: 1100, height: 500 });
    expect(cropPixels({ x: 1, y: 1, width: 1, height: 1 }, 100, 50)).toEqual({ x: 99, y: 49, width: 1, height: 1 });
  });
  it("keeps names, punctuation, numbers and long text intact", () => {
    expect(cleanOcrText("\u0000  牛肉飯 $38\r\n09:00  \r出口  ")).toBe("牛肉飯 $38\n09:00  \n出口");
    expect(cleanOcrText("字".repeat(4000))).toHaveLength(4000);
    expect(ocrLanguages("chi_tra")).toEqual(["chi_tra", "eng"]);
    expect(ocrLanguages("eng")).toEqual(["eng"]);
    expect(ocrAssetBase("./", "https://example.com/Vokawa/?v=1").href).toBe(base.href);
  });
});
describe("Lens worker lifecycle", () => {
  it("loads same-origin resources, selects sparse text mode and releases the worker", async () => {
    const worker = new FakeWorker(), factory = vi.fn((_url: URL) => worker as unknown as Worker);
    const engine = new LensOcr(factory);
    const result = await engine.recognize(new Blob(["test"]), "chi_tra", "scattered", new AbortController().signal, () => {}, base);
    expect(result).toEqual({ text: "牛肉飯 $38", confidence: 92 });
    expect(factory.mock.calls[0][0].href).toBe(base.href + "worker.min.js");
    expect(worker.packets.map(p => p.action)).toEqual(["load", "loadLanguage", "initialize", "setParameters", "recognize"]);
    expect(worker.packets[1].payload.options.langPath).toBe(base.href + "data");
    expect(worker.packets[3].payload.params.tessedit_pageseg_mode).toBe("11");
    expect(worker.terminate).toHaveBeenCalled();
  });
  it("cancels during model loading and ignores a late worker reply", async () => {
    const worker = new FakeWorker(); worker.respond = false;
    const engine = new LensOcr(() => worker as unknown as Worker), abort = new AbortController();
    const result = engine.recognize(new Blob(["test"]), "eng", "document", abort.signal, () => {}, base);
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(worker.packets).toHaveLength(1));
    abort.abort();
    worker.onmessage({ data: { ...worker.packets[0], status: "resolve", data: {} } });
    await rejected;
    expect(worker.terminate).toHaveBeenCalled();
    expect(worker.packets).toHaveLength(1);
  });
  it("does not spawn a worker when cancellation occurs while reading image bytes", async () => {
    const factory = vi.fn(), engine = new LensOcr(factory);
    let resolve!: (value: ArrayBuffer) => void;
    const blob = { arrayBuffer: () => new Promise<ArrayBuffer>(r => { resolve = r; }) } as Blob;
    const result = engine.recognize(blob, "eng", "document", new AbortController().signal, () => {}, base);
    engine.cancel(); resolve(new ArrayBuffer(1));
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(factory).not.toHaveBeenCalled();
  });
  it("reports a worker load failure and releases its resources", async () => {
    const worker = new FakeWorker(); worker.respond = false;
    const engine = new LensOcr(() => worker as unknown as Worker);
    const result = engine.recognize(new Blob(["test"]), "eng", "document", new AbortController().signal, () => {}, base);
    const rejected = expect(result).rejects.toThrow("OCR_LOAD_FAILED");
    await vi.waitFor(() => expect(worker.packets).toHaveLength(1));
    worker.onerror(); await rejected;
    expect(worker.terminate).toHaveBeenCalled();
  });
});
