import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Lang } from "./model";
import { t, useLocale } from "./i18n";
import { Icon } from "./Icon";
import { LensOcr, type OcrScript, type OcrLayout, type OcrProgress } from "./lens-ocr";
import { prepareImage, FULL_CROP, cropFromPoints, type Crop } from "./lens-image";
import "./lens.css";

type Props = { source: Lang; onText: (text: string) => void; onPrepare: () => void; onBusy: (busy: boolean) => void };
const scriptFor = (lang: Lang): OcrScript => lang === "en" ? "eng" : lang === "zh" ? "chi_sim" : "chi_tra";
export function LensPanel(props: Props) {
  const locale = useLocale();
  const callbacks = useRef(props); callbacks.current = props;
  const [image, setImage] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [crop, setCrop] = useState<Crop>(FULL_CROP);
  const [script, setScript] = useState<OcrScript>(scriptFor(props.source));
  const [layout, setLayout] = useState<OcrLayout>("document");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<OcrProgress | null>(null);
  const [status, setStatus] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const camera = useRef<HTMLInputElement>(null), album = useRef<HTMLInputElement>(null);
  const url = useRef(""), serial = useRef(0), controller = useRef<AbortController | null>(null);
  const engine = useRef(new LensOcr());
  const drag = useRef<{ x: number; y: number } | null>(null);
  function working(value: boolean) { setBusy(value); callbacks.current.onBusy(value); }
  function cancel() {
    serial.current++; controller.current?.abort(); controller.current = null;
    engine.current.cancel(); working(false); setProgress(null);
  }
  function invalidate() { cancel(); callbacks.current.onPrepare(); setConfidence(null); setStatus(""); }
  function showImage(blob: Blob | null) {
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = blob ? URL.createObjectURL(blob) : "";
    setPreview(url.current); setImage(blob); setCrop(FULL_CROP);
  }
  useEffect(() => { invalidate(); setScript(scriptFor(props.source)); }, [props.source]);
  useEffect(() => { cancel(); setStatus(""); }, [locale]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { cancel(); setStatus(t("识别已停止，可重新开始。", "Recognition stopped. You can start again.")); } };
    const leave = () => cancel();
    document.addEventListener("visibilitychange", hide); window.addEventListener("pagehide", leave);
    return () => {
      serial.current++; controller.current?.abort(); engine.current.cancel();
      if (url.current) URL.revokeObjectURL(url.current);
      callbacks.current.onBusy(false);
      document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", leave);
    };
  }, []);
  function errorText(error: unknown) {
    const code = error instanceof Error ? error.message : "";
    if (code === "IMAGE_SIZE") return t("请选择小于 25 MB 的有效图片。", "Choose a valid image smaller than 25 MB.");
    if (code.startsWith("IMAGE_")) return t("无法读取此图片，请改用 JPG、PNG 或 WebP，或重新拍摄。", "Could not read this image. Try JPG, PNG, WebP, or take another photo.");
    if (code === "OCR_TIMEOUT") return t("识别超时。请缩小框选范围后重试。", "Recognition timed out. Select a smaller area and retry.");
    return t("识别失败。首次使用需要联网下载识别资源；请检查网络后重试。", "Recognition failed. First use requires internet to download OCR resources. Check your connection and retry.");
  }
  async function choose(file?: File) {
    if (!file) return;
    invalidate(); const id = serial.current; working(true);
    setStatus(t("正在打开图片…", "Opening image…"));
    try { const blob = await prepareImage(file); if (id === serial.current) { showImage(blob); setStatus(""); } }
    catch (error) { if (id === serial.current) setStatus(errorText(error)); }
    finally { if (id === serial.current) working(false); }
  }
  async function rotate() {
    if (!image || busy) return;
    invalidate(); const id = serial.current; working(true);
    try { const blob = await prepareImage(image, 90); if (id === serial.current) showImage(blob); }
    catch (error) { if (id === serial.current) setStatus(errorText(error)); }
    finally { if (id === serial.current) working(false); }
  }
  async function recognize() {
    if (!image || busy) return;
    invalidate(); const id = serial.current, abort = new AbortController(); controller.current = abort; working(true);
    try {
      const blob = await prepareImage(image, 0, crop);
      if (id !== serial.current) return;
      const result = await engine.current.recognize(blob, script, layout, abort.signal, value => { if (id === serial.current) setProgress(value); });
      if (id !== serial.current) return;
      setConfidence(result.confidence);
      if (!result.text) setStatus(t("没有识别到文字。请调整角度、光线或框选范围。", "No text found. Adjust the angle, lighting or selection."));
      else {
        callbacks.current.onText(result.text);
        setStatus(result.text.length > 3000
          ? t("识别超过 3,000 字。请缩小选区或编辑文字后再翻译。", "More than 3,000 characters. Select a smaller area or edit the text before translating.")
          : t("请校对姓名、价格和数字，然后点击翻译。", "Check names, prices and numbers, then select Translate."));
      }
    } catch (error) { if (id === serial.current && !abort.signal.aborted) setStatus(errorText(error)); }
    finally { if (id === serial.current) { working(false); setProgress(null); controller.current = null; } }
  }
  const point = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };
  const selected = crop.width < 1 || crop.height < 1;
  return <section className="panel lens-panel" aria-label="Vokawa Lens" aria-busy={busy}>
    <input ref={camera} hidden type="file" accept="image/*" capture="environment" aria-label={t("拍摄图片", "Take a photo")} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
    <input ref={album} hidden type="file" accept="image/*" aria-label={t("选择图片文件", "Choose an image file")} onChange={e => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
    <div className="lens-toolbar"><strong><Icon name="lens" /> Vokawa Lens</strong><div>
      <button className="primary" disabled={busy} onClick={() => { callbacks.current.onPrepare(); camera.current?.click(); }}>{t("拍照", "Camera")}</button>
      <button className="secondary" disabled={busy} onClick={() => album.current?.click()}>{t("选择图片", "Choose image")}</button>
    </div></div>
    <p className="lens-note">{t("图片留在本机处理。点击翻译后，文字会发送到你选用的翻译服务。", "Images are processed on your device. Translating sends the text to your selected translation service.")}</p>
    <div className="lens-options">
      <label>{t("图片文字", "Image script")}<select value={script} disabled={busy} onChange={e => { invalidate(); setScript(e.target.value as OcrScript); }}>
        <option value="eng">{t("英文", "English")}</option><option value="chi_sim">{t("简体中文 + 英文", "Simplified Chinese + English")}</option><option value="chi_tra">{t("繁体／粤语字 + 英文", "Traditional / Cantonese + English")}</option>
      </select></label>
      <label>{t("排版", "Layout")}<select value={layout} disabled={busy} onChange={e => { invalidate(); setLayout(e.target.value as OcrLayout); }}>
        <option value="document">{t("通知／连续文字", "Notice / continuous text")}</option><option value="scattered">{t("路牌／餐牌散列文字", "Sign / scattered menu text")}</option>
      </select></label>
    </div>
    {script === "chi_tra" && <p className="lens-note">{t("部分粤语口语字容易误识别，请对照图片校对。", "Some Cantonese characters may be misread. Check the text against your image.")}</p>}
    {preview ? <>
      <p className="lens-note">{t("拖动图片框选文字；不框选则识别整张。", "Drag over the image to select text, or recognize the whole image.")}</p>
      <div className="lens-stage"><div className="lens-image" data-testid="lens-image"
        onPointerDown={e => { if (busy) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = point(e); setCrop(FULL_CROP); }}
        onPointerMove={e => { if (drag.current) setCrop(cropFromPoints(drag.current, point(e))); }}
        onPointerUp={e => { if (!drag.current) return; const next = cropFromPoints(drag.current, point(e)); drag.current = null; invalidate(); setCrop(next.width > .02 && next.height > .02 ? next : FULL_CROP); }}
        onPointerCancel={() => { drag.current = null; setCrop(FULL_CROP); }}>
        <img src={preview} alt={t("待识别图片", "Image to recognize")} draggable={false} />
        {selected && <span className="lens-selection" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />}
      </div></div>
      <div className="lens-tools"><button className="text-button" disabled={busy} onClick={() => void rotate()}>{t("旋转 90°", "Rotate 90°")}</button>
        <button className="text-button" disabled={busy || !selected} onClick={() => { invalidate(); setCrop(FULL_CROP); }}>{t("整张图片", "Whole image")}</button>
        <button className="text-button" disabled={busy} onClick={() => { invalidate(); showImage(null); }}>{t("移除图片", "Remove image")}</button></div>
    </> : <div className="lens-empty"><Icon name="lens" size={38} /><p>{t("拍下路牌、餐牌或通知", "Capture a sign, menu or notice")}</p><small>{t("正对文字，避免反光，让文字清晰可见。", "Face the text directly, avoid glare and keep it in focus.")}</small></div>}
    <div className="lens-footer">
      <button className="primary" disabled={!image || busy} onClick={() => void recognize()}>{selected ? t("识别选区", "Recognize selection") : t("识别文字", "Recognize text")}</button>
      {busy && <button className="secondary" onClick={() => { cancel(); setStatus(t("已取消识别。", "Recognition cancelled.")); }}>{t("取消识别", "Cancel recognition")}</button>}
      {progress && <span role="status">{progress.phase === "loading" ? t("正在加载识别资源", "Loading OCR resources") : t("正在识别", "Recognizing")} {Math.round(progress.progress * 100)}%</span>}
    </div>
    {status && <p className="lens-note" role="status">{status}</p>}
    {confidence !== null && confidence < 65 && <p className="lens-note">{t("识别把握较低，请仔细校对，或重拍更清晰的图片。", "Low recognition confidence. Review carefully or take a clearer photo.")}</p>}
  </section>;
}
