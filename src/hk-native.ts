import * as OpenCC from "opencc-js/cn2t";
import type { Lang } from "./model";
import { expressions, nouns, subjects, times, type NounKind } from "./hk-lexicon";

const convert = OpenCC.Converter({ from: "cn", to: "hk" });
export const HK_ENGINE_VERSION = "1.0.0";
export interface NativeResult { text: string; rules: string[]; unchangedClauses: number }
interface Phrase { text: string; kind: NounKind }
interface Context { source: string }

const nounTable = new Map<string, Phrase>();
for (const [input, output, kind] of nouns) {
  nounTable.set(convert(input), { text: convert(output), kind });
  nounTable.set(convert(output), { text: convert(output), kind });
}
const starters = (table: Record<string, string>) => Object.keys(table).sort((a, b) => b.length - a.length);
const subjectKeys = starters(subjects), timeKeys = starters(times);
const expressionTable = new Map(Object.entries(expressions).map(([a, b]) => [convert(a), convert(b)]));

function noun(text: string, context: Context, depth = 0): Phrase | undefined {
  if (depth > 3) return;
  const direct = nounTable.get(text);
  if (direct) {
    // Retain a source author's English term only in a recognized semantic slot.
    if (text === "社交媒體" && /\bsocial media\b/i.test(context.source))
      return { text: context.source.match(/\bsocial media\b/i)![0], kind: "media" };
    return direct;
  }
  if (/^social media$/i.test(text)) return { text, kind: "media" };
  if (/^meeting$/i.test(text)) return { text, kind: "event" };
  const owner = subjectKeys.find(s => text.startsWith(s + "的") || text.startsWith(s + "嘅"));
  if (owner) {
    const child = noun(text.slice(owner.length + 1), context, depth + 1);
    if (child) return { ...child, text: subjects[owner] + "嘅" + child.text };
  }
  const prefix = text.match(/^(這個|那個|這些|那些|呢個|嗰個|呢啲|嗰啲|個|場|新的|舊的|新|舊|紅色的|藍色的|(?:\d+(?:\.\d+)?|[一二三四五六七八九十百兩]+)[個部張杯碗份架把袋支本隻])/u)?.[0];
  if (prefix) {
    const child = noun(text.slice(prefix.length), context, depth + 1);
    const forms: Record<string, string> = { "這個": "呢個", "那個": "嗰個", "這些": "呢啲", "那些": "嗰啲", "新的": "新嘅", "舊的": "舊嘅", "紅色的": "紅色嘅", "藍色的": "藍色嘅" };
    if (child) return { ...child, text: (forms[prefix] ?? prefix) + child.text };
  }
}

// Every predicate must be completely consumed. Unknown tails are never rewritten.
function predicate(text: string, context: Context, depth = 0): string | undefined {
  if (depth > 3) return;
  const fixed: Record<string, string> = {
    "不知道": "唔知", "知道": "知", "不明白": "唔明", "明白": "明", "沒空": "冇時間",
    "有空": "有時間", "吃飯": "食飯", "睡覺": "瞓覺", "回家": "返屋企",
    "上班": "返工", "下班": "收工", "上學": "返學", "開會": "開會", "工作": "做嘢",
    "很累": "好攰", "很餓": "好肚餓", "很渴": "好頸渴", "很忙": "好忙",
    "很開心": "好開心", "很喜歡": "好鍾意", "在這裏": "喺呢度", "在那裏": "喺嗰度",
  };
  if (fixed[text]) return fixed[text];
  const ride = text.match(/^(?:乘坐|乘|坐|搭)(.+?)去(.+)$/u);
  if (ride) {
    const vehicle = noun(ride[1], context), destination = noun(ride[2], context);
    if (vehicle?.kind === "transport" && destination?.kind === "place")
      return "搭" + vehicle.text + "去" + destination.text;
  }
  if (text.startsWith("沒有")) {
    const object = noun(text.slice(2), context);
    if (object) return "冇" + object.text;
  }
  const operators: ReadonlyArray<readonly [string, string]> = [
    ["還沒有", "仲未"], ["還沒", "仲未"], ["已經", "已經"],
    ["不需要", "唔使"], ["不想", "唔想"],
    ["沒有", "冇"], ["沒", "冇"], ["不", "唔"],
    ["想要", "想"], ["想", "想"], ["需要", "要"], ["可以", "可以"],
    ["會", "會"], ["正在", ""],
  ];
  for (const [input, output] of operators) {
    if (!text.startsWith(input) || (input === "沒" && text.startsWith("沒有"))) continue;
    const tail = text.slice(input.length);
    // Progressive aspect needs a verb slot; do not append 緊 after its object.
    if (input === "正在") {
      const m = tail.match(/^(吃|喝|看|等)(.+)$/u);
      const n = m && noun(m[2], context);
      const verbs: Record<string, string> = { "吃": "食", "喝": "飲", "看": "睇", "等": "等" };
      if (m && n && ((m[1] === "吃" && n.kind === "food") || (m[1] === "喝" && n.kind === "drink") || m[1] === "等" || m[1] === "看"))
        return verbs[m[1]] + "緊" + n.text;
      continue;
    }
    const rest = predicate(tail, context, depth + 1);
    if (rest !== undefined) return output + rest;
  }
  const verbs: ReadonlyArray<readonly [string, string, readonly NounKind[]]> = [
    ["乘坐", "搭", ["transport"]], ["乘", "搭", ["transport"]], ["坐", "搭", ["transport"]],
    ["吃", "食", ["food"]], ["食", "食", ["food"]], ["喝", "飲", ["drink"]],
    ["飲", "飲", ["drink"]], ["去", "去", ["place"]], ["在", "喺", ["place"]],
    ["喺", "喺", ["place"]], ["回", "返", ["place"]],
    ["買", "買", ["object", "food", "drink"]], ["帶", "帶", ["object"]],
    ["找", "搵", ["object", "place"]], ["尋找", "搵", ["object", "place"]],
    ["使用", "用", ["object", "media"]], ["用", "用", ["object", "media"]],
    ["看", "睇", ["object", "media"]], ["睇", "睇", ["object", "media"]],
    ["喜歡", "鍾意", ["object", "food", "drink", "place", "media"]],
    ["沒有", "冇", ["object", "food", "drink", "event"]],
    ["有", "有", ["object", "food", "drink", "event"]],
    ["要", "要", ["object", "food", "drink"]],
  ];
  for (const [input, output, kinds] of verbs) {
    if (!text.startsWith(input)) continue;
    let tail = text.slice(input.length), aspect = "";
    if (tail.startsWith("了") || tail.startsWith("咗")) { aspect = "咗"; tail = tail.slice(1); }
    const n = noun(tail, context);
    if (n && kinds.includes(n.kind)) {
      if (n.kind === "event" && input === "有" && /\bmeeting\b/i.test(context.source) && n.text.endsWith("會議"))
        return output + aspect + n.text.slice(0, -2) + " meeting";
      return output + aspect + (/^[A-Za-z]/.test(n.text) ? " " : "") + n.text;
    }
  }
}

function clause(text: string, context: Context): { text: string; rule: string } | undefined {
  if (!text || text.length > 500 || /[\uE000-\uF8FF]/u.test(text)) return;
  const expression = expressionTable.get(text);
  if (expression) return { text: expression, rule: "expression" };
  if (times[text]) return { text: times[text], rule: "time" };
  const n = noun(text, context);
  if (n) return { text: n.text, rule: "noun-phrase" };
  const location = text.match(/^(.+?)(?:在|喺)?(?:哪裏|哪裡|哪兒|邊度)$/u);
  if (location) {
    const place = noun(location[1], context);
    if (place) return { text: place.text + "喺邊度", rule: "where-question" };
  }
  const price = text.match(/^(這個|那個|呢個|嗰個|.+)多少錢$/u);
  if (price) {
    const item = ({ "這個": "呢個", "那個": "嗰個", "呢個": "呢個", "嗰個": "嗰個" } as Record<string, string>)[price[1]] ?? noun(price[1], context)?.text;
    if (item) return { text: item + "幾多錢", rule: "price-question" };
  }
  for (const prefix of ["請", "不要", "別"]) {
    if (text.startsWith(prefix)) {
      const rest = predicate(text.slice(prefix.length), context);
      if (rest !== undefined) return { text: (prefix === "請" ? "唔該" : "唔好") + rest, rule: "request" };
    }
  }
  let tail = text, head = "";
  // Both time-subject and subject-time orders are accepted without reordering.
  for (let i = 0; i < 2; i++) {
    const keys = i === 0 ? [...timeKeys, ...subjectKeys] : head && subjectKeys.some(s => text.startsWith(s)) ? timeKeys : subjectKeys;
    const key = keys.find(k => tail.startsWith(k));
    if (!key) break;
    head += subjects[key] ?? times[key];
    tail = tail.slice(key.length);
  }
  if (tail.endsWith("嗎") && head) {
    const question = tail.slice(0, -1);
    for (const [prefix, form] of [["可以", "可唔可以"], ["想", "想唔想"], ["有", "有冇"]]) {
      if (!question.startsWith(prefix)) continue;
      const checked = prefix === "有" ? noun(question.slice(1), context)?.text : predicate(question.slice(prefix.length), context);
      if (checked) return { text: head + form + checked, rule: "yes-no-question" };
    }
    return;
  }
  const p = predicate(tail, context);
  if (p !== undefined) return { text: head + p, rule: "spoken-clause" };
}

/** Opaque spans are never converted or passed into grammar rules. */
const protectedPattern = /```[\s\S]*?```|`[^`\n]*`|「[^」]*」|『[^』]*』|“[^”]*”|"[^"\n]*"|《[^》]*》|https?:\/\/[^\s<>「」“”，。！？]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|<[^>]*>/gu;

export function hkNative(text: string, sourceText = ""): NativeResult {
  const protectedSpans: string[] = [];
  // Never interpret user-supplied private-use characters as internal placeholders.
  if (/[\uE000-\uF8FF]/u.test(text)) return { text, rules: [], unchangedClauses: 1 };
  const masked = text.replace(protectedPattern, value => {
    protectedSpans.push(value);
    return `\uE000${protectedSpans.length - 1}\uE001`;
  });
  const normalized = convert(masked);
  const rules = new Set<string>();
  if (masked !== normalized) rules.add("opencc-hk");
  let unchangedClauses = 0;
  const pieces = normalized.split(/([。！？!?；;\n，,]+)/u);
  const sourceClauses = sourceText.replace(protectedPattern, "").split(/[。！？!?；;\n，,]+|\.(?=\s|$)/u).filter(s => s.trim());
  const count = pieces.filter(p => p.trim() && !/^[。！？!?；;\n，,]+$/u.test(p)).length;
  let clauseIndex = 0;
  const output = pieces.map(part => {
    if (!part.trim() || /^[。！？!?；;\n，,]+$/u.test(part)) return part;
    const body = part.trim();
    const source = sourceClauses.length === count ? sourceClauses[clauseIndex] : "";
    clauseIndex++;
    const result = clause(body, { source });
    if (!result) { unchangedClauses++; return part; }
    if (result.text !== body) rules.add(result.rule);
    return part.slice(0, part.indexOf(body)) + result.text + part.slice(part.indexOf(body) + body.length);
  }).join("");
  const restored = output.replace(/\uE000(\d+)\uE001/gu, (_, index: string) => protectedSpans[Number(index)]);
  // A rewrite may change grammar, but must not add, remove or reorder numeric literals.
  const numbers = (value: string) => value.match(/\d+(?:[.,:/-]\d+)*/g) ?? [];
  if (JSON.stringify(numbers(restored)) !== JSON.stringify(numbers(text)))
    return { text, rules: [], unchangedClauses: 1 };
  return { text: restored, rules: [...rules], unchangedClauses };
}

/** Apply once after either translation provider succeeds; other targets pass through. */
export function nativeTranslation<T extends { translation: string; engine?: string; notice?: string }>(
  result: T, sourceText: string, target: Lang,
): T {
  if (target !== "yue") return result;
  const native = hkNative(result.translation, sourceText);
  return { ...result, translation: native.text,
    engine: `${result.engine || "Translation"} · HK Native ${HK_ENGINE_VERSION}`,
    notice: "本機口語規則處理；未能可靠分析的句子保留原譯文。詞庫仍待香港母語者審校。",
  };
}
