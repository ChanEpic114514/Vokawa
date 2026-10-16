/** Authored rules, not a copied dictionary. Native-speaker sign-off is pending. */
export const LEXICON_REVIEW = "pending-native-speaker-review" as const;

export type NounKind = "object" | "food" | "drink" | "place" | "transport" | "media" | "event";
export const nouns: ReadonlyArray<readonly [string, string, NounKind]> = [
  ["出租車", "的士", "transport"], ["計程車", "的士", "transport"],
  ["公交車", "巴士", "transport"], ["公共汽車", "巴士", "transport"],
  ["自行車", "單車", "transport"], ["地鐵", "地鐵", "transport"],
  ["火車", "火車", "transport"], ["電車", "電車", "transport"],
  ["冰箱", "雪櫃", "object"], ["空調", "冷氣", "object"],
  ["充電寶", "尿袋", "object"], ["塑料袋", "膠袋", "object"],
  ["塑膠袋", "膠袋", "object"], ["垃圾桶", "垃圾桶", "object"],
  ["鑰匙", "鎖匙", "object"], ["雨傘", "遮", "object"],
  ["錢包", "銀包", "object"], ["短信", "短訊", "object"],
  ["消息", "消息", "object"], ["文件", "文件", "object"],
  ["手機", "手機", "object"], ["電腦", "電腦", "object"],
  ["票", "飛", "object"], ["機票", "機票", "object"],
  ["土豆", "薯仔", "food"], ["西紅柿", "番茄", "food"],
  ["方便麪", "即食麪", "food"], ["方便麵", "即食麪", "food"],
  ["冰淇淋", "雪糕", "food"], ["三明治", "三文治", "food"],
  ["米飯", "飯", "food"], ["飯", "飯", "food"], ["午飯", "午飯", "food"],
  ["晚飯", "晚飯", "food"], ["早餐", "早餐", "food"],
  ["水", "水", "drink"], ["咖啡", "咖啡", "drink"],
  ["奶茶", "奶茶", "drink"], ["茶", "茶", "drink"],
  ["洗手間", "洗手間", "place"], ["廁所", "廁所", "place"],
  ["車站", "車站", "place"], ["地鐵站", "地鐵站", "place"],
  ["公交車站", "巴士站", "place"], ["機場", "機場", "place"],
  ["銀行", "銀行", "place"], ["醫院", "醫院", "place"],
  ["公司", "公司", "place"], ["學校", "學校", "place"],
  ["家", "屋企", "place"], ["家裏", "屋企", "place"],
  ["餐廳", "餐廳", "place"], ["超市", "超市", "place"],
  ["社交媒體", "社交媒體", "media"], ["社交平台", "社交平台", "media"],
  ["會議", "會議", "event"],
];
export const subjects: Record<string, string> = {
  "我們": "我哋", "你們": "你哋", "他們": "佢哋", "她們": "佢哋", "它們": "佢哋",
  "我哋": "我哋", "你哋": "你哋", "佢哋": "佢哋", "我": "我", "你": "你",
  "他": "佢", "她": "佢", "它": "佢", "佢": "佢", "大家": "大家",
};
export const times: Record<string, string> = {
  "今天": "今日", "明天": "聽日", "昨天": "尋日", "今晚": "今晚",
  "現在": "而家", "剛才": "頭先", "今天晚上": "今晚", "明天早上": "聽朝",
  "今日": "今日", "聽日": "聽日", "尋日": "尋日", "而家": "而家", "聽朝": "聽朝",
};
export const expressions: Record<string, string> = {
  "吃": "食", "喝": "飲", "睡覺": "瞓覺",
  "早上好": "早晨", "晚上好": "晚上好", "再見": "再見", "不好意思": "唔好意思",
  "沒關係": "唔緊要", "不要緊": "唔緊要", "對不起": "對唔住",
  "請再說一遍": "唔該再講一次", "請說慢一點": "唔該講慢啲",
  "請說慢一點兒": "唔該講慢啲", "請稍等": "唔該等陣", "等一下": "等陣",
  "沒問題": "冇問題", "不客氣": "唔使客氣", "不知道": "唔知",
  "為甚麼": "點解", "為什麼": "點解", "甚麼": "乜嘢", "什麼": "乜嘢",
};
