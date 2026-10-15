import type { Lang } from "./model";

export const TRANSLATION_ENDPOINT = "https://api.mymemory.translated.net/get";
export const languageCodes: Record<Lang, string> = {
  en: "en-GB",
  zh: "zh-CN",
  yue: "yue-HK",
};
const encoder = new TextEncoder();
export const byteLength = (s: string) => encoder.encode(s).length;

/** Keep all code points and paragraph boundaries within the API's UTF-8 limit. */
export function splitTranslation(text: string, limit = 500): string[] {
  if (limit < 4) throw Error("分段上限过小");
  const chars = Array.from(text),
    parts: string[] = [];
  let start = 0;
  while (start < chars.length) {
    let end = start,
      bytes = 0,
      boundary = -1;
    while (end < chars.length && bytes + byteLength(chars[end]) <= limit) {
      const c = chars[end];
      bytes += byteLength(c);
      end++;
      if (/[\s。！？!?；;，,：:]/u.test(c)) boundary = end;
      if (c === "\n") break;
    }
    if (end < chars.length && chars[end - 1] !== "\n" && boundary > start)
      end = boundary;
    parts.push(chars.slice(start, end).join(""));
    start = end;
  }
  return parts;
}
export function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
    (whole, key: string) => {
      if (key[0] !== "#") return named[key.toLowerCase()] ?? whole;
      const n =
        key[1].toLowerCase() === "x"
          ? parseInt(key.slice(2), 16)
          : parseInt(key.slice(1), 10);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
        ? String.fromCodePoint(n)
        : whole;
    },
  );
}
export function parseTranslation(data: unknown): string {
  if (!data || typeof data !== "object")
    throw Error("翻译服务返回格式异常，请重试。");
  const d = data as {
    responseStatus?: unknown;
    quotaFinished?: unknown;
    responseData?: { translatedText?: unknown };
    responseDetails?: unknown;
  };
  if (
    d.quotaFinished === true ||
    Number(d.responseStatus) === 429 ||
    /USED ALL AVAILABLE FREE|QUOTA|TOO MANY REQUESTS/i.test(
      String(d.responseDetails),
    )
  )
    throw Error(
      "MyMemory 免费额度已用完或请求过于频繁，请稍后或明天再试；本应用不会自动转用付费服务。",
    );
  if (Number(d.responseStatus) !== 200)
    throw Error("翻译服务暂时无法处理这段文字，请缩短输入并稍后重试。");
  const out = d.responseData?.translatedText;
  if (typeof out !== "string" || !out.trim() || out.length > 20000)
    throw Error("翻译服务没有返回有效译文。");
  if (/MYMEMORY WARNING|USED ALL AVAILABLE FREE TRANSLATIONS/i.test(out))
    throw Error("MyMemory 免费额度已用完，请稍后或明天再试。");
  return decodeEntities(out).trim();
}
export async function onlineTranslate(
  text: string,
  source: Lang,
  target: Lang,
  signal: AbortSignal,
  progress: (done: number, total: number) => void = () => {},
) {
  if (!text.trim()) throw Error("请输入文字。");
  if (text.length > 3000) throw Error("每次最多 3000 字符，请分段翻译。");
  if (
    !(source in languageCodes) ||
    !(target in languageCodes) ||
    source === target
  )
    throw Error("请选择两个不同的语言。");
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    throw Error("即时翻译需要联网；离线时可查看历史记录和已缓存的录音。");
  const chunks = splitTranslation(text.trim()),
    outputs: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    signal.throwIfAborted();
    progress(i, chunks.length);
    const part = chunks[i],
      body = part.trim();
    if (!/\p{L}/u.test(body)) {
      outputs.push(part);
      continue;
    }
    const url = new URL(TRANSLATION_ENDPOINT);
    url.search = new URLSearchParams({
      q: body,
      langpair: languageCodes[source] + "|" + languageCodes[target],
      mt: "1",
    }).toString();
    const controller = new AbortController(),
      abort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      });
      if (response.status === 429)
        throw Error("MyMemory 请求过于频繁或免费额度已用完，请稍后再试。");
      if (!response.ok)
        throw Error(
          "翻译服务暂不可用（HTTP " + response.status + "），请稍后重试。",
        );
      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw Error("翻译服务返回格式异常，请稍后重试。");
      }
      const output = parseTranslation(raw);
      signal.throwIfAborted();
      outputs.push(
        (part.match(/^\s*/u)?.[0] || "") +
          output +
          (part.match(/\s*$/u)?.[0] || ""),
      );
    } catch (e) {
      if (signal.aborted) throw signal.reason;
      if (controller.signal.aborted)
        throw Error(
          "翻译服务响应超时；没有把未完成的分段当成完整译文。请缩短输入后重试。",
        );
      if (e instanceof TypeError)
        throw Error(
          "无法连接 MyMemory。请检查网络；服务或浏览器可能暂时阻止了连接。",
        );
      throw e;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
  signal.throwIfAborted();
  progress(chunks.length, chunks.length);
  const translation = outputs
    .reduce(
      (a, b) =>
        a + (/[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b) ? " " : "") + b,
      "",
    )
    .trim();
  return {
    translation,
    engine: "MyMemory · 在线翻译",
    notice: "机器译文可能有歧义或误译；粤拼在本机生成。",
    segments: chunks.length,
  };
}
