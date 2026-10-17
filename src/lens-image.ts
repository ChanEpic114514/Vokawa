export type Crop = { x: number; y: number; width: number; height: number };
export const FULL_CROP: Crop = { x: 0, y: 0, width: 1, height: 1 };
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function cropFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Crop {
  const x = Math.min(clamp(a.x), clamp(b.x)), y = Math.min(clamp(a.y), clamp(b.y));
  return { x, y, width: Math.abs(clamp(a.x) - clamp(b.x)), height: Math.abs(clamp(a.y) - clamp(b.y)) };
}
export function imageSize(width: number, height: number) {
  if (!Number.isFinite(width * height) || width <= 0 || height <= 0) throw Error("IMAGE_SIZE");
  const scale = Math.min(1, 2600 / Math.max(width, height), Math.sqrt(4000000 / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export function cropPixels(crop: Crop, width: number, height: number) {
  const x = Math.min(width - 1, Math.floor(clamp(crop.x) * width));
  const y = Math.min(height - 1, Math.floor(clamp(crop.y) * height));
  return { x, y, width: Math.max(1, Math.min(width - x, Math.round(clamp(crop.width) * width))), height: Math.max(1, Math.min(height - y, Math.round(clamp(crop.height) * height))) };
}
export async function prepareImage(blob: Blob, rotation = 0, crop = FULL_CROP): Promise<Blob> {
  if (!blob.size || blob.size > MAX_IMAGE_BYTES) throw Error("IMAGE_SIZE");
  if (blob.type && !/^image\/(jpeg|png|webp|heic|heif|bmp|gif)$/i.test(blob.type)) throw Error("IMAGE_TYPE");
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(Error("IMAGE_DECODE_FAILED"));
      image.src = url;
    });
    const region = cropPixels(crop, img.naturalWidth, img.naturalHeight);
    const size = imageSize(region.width, region.height);
    const canvas = document.createElement("canvas");
    const sideways = Math.abs(rotation % 180) === 90;
    canvas.width = sideways ? size.height : size.width;
    canvas.height = sideways ? size.width : size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("IMAGE_CANVAS_FAILED");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(img, region.x, region.y, region.width, region.height, -size.width / 2, -size.height / 2, size.width, size.height);
    try {
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(Error("IMAGE_ENCODE_FAILED")), "image/png"));
    } finally { canvas.width = canvas.height = 1; }
  } finally { URL.revokeObjectURL(url); }
}
