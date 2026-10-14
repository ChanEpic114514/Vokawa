export type Lang = 'en' | 'zh' | 'yue';
export const names: Record<Lang, string> = { en: 'English', zh: '普通话', yue: '粤语' };
export const locales: Record<Lang, string> = { en: 'en-US', zh: 'zh-CN', yue: 'zh-HK' };
export interface Entry { id: string; source: Lang; target: Lang; sourceText: string; targetText: string; engine: string; favorite: boolean; notice?: string }
export const phrases: Record<Lang, string>[] = [
  { en: 'How much is this?', zh: '这个多少钱？', yue: '呢個幾多錢？' },
  { en: 'Where is the nearest station?', zh: '最近的车站在哪里？', yue: '最近嘅車站喺邊度？' },
  { en: 'Please speak more slowly.', zh: '请说慢一点。', yue: '唔該講慢啲。' },
  { en: 'I would like a glass of water.', zh: '我想要一杯水。', yue: '我想要一杯水。' },
  { en: 'Hello!', zh: '你好！', yue: '你好！' }
];
export function demoTranslate(text: string, source: Lang, target: Lang) {
  const p = phrases.find(p => p[source].toLowerCase() === text.trim().toLowerCase());
  if (!p) throw Error('示例模式仅支持下面五组句子。请在设置中关闭示例模式，使用 MyMemory 即时翻译。');
  return { translation: p[target], engine: '内置示例 · 非通用翻译' };
}
export interface Settings { demo: boolean; save: boolean; auto: boolean; jp: boolean; rate: number; api: string; voice: string; speechApi:string; speechKind: 'fastapi'|'gradio'; translationProvider:'mymemory'|'backend' }
export const defaults: Settings = { demo: false, save: true, auto: false, jp: true, rate: 1, api: '/api', voice: '', speechApi:'/api', speechKind:'fastapi', translationProvider:'mymemory' };
export function loadSaved(): {settings: Settings; history: Entry[]} {
  try {
    const value = JSON.parse(localStorage.getItem('vokawa-v2') || localStorage.getItem('vokawa-preview') || '{}');
    const s = value.settings || value;
    const settings = {...defaults};
    // Upgrade old demo-only settings without losing history or speech preferences.
    if(s.translationProvider==='mymemory'||s.translationProvider==='backend'){
      settings.translationProvider=s.translationProvider;
      if(typeof s.demo==='boolean')settings.demo=s.demo;
    }
    for (const key of ['save', 'auto', 'jp'] as const) if (typeof s[key] === 'boolean') settings[key] = s[key];
    if (typeof s.rate === 'number' && s.rate >= 0.6 && s.rate <= 1.2) settings.rate = s.rate;
    if (typeof s.api === 'string') settings.api = s.api;
    if (typeof s.voice === 'string') settings.voice = s.voice;
    if(typeof s.speechApi==='string')settings.speechApi=s.speechApi;
    if(s.speechKind==='fastapi'||s.speechKind==='gradio')settings.speechKind=s.speechKind;
    const history = Array.isArray(value.history) ? value.history.filter((e: Partial<Entry>) => e && typeof e.id === 'string' && e.source! in names && e.target! in names && typeof e.sourceText === 'string' && typeof e.targetText === 'string').slice(0,1000) : [];
    return {settings, history};
  } catch { return {settings: defaults, history: []}; }
}
export async function apiCall(api: string, token: string, path: string, body?: unknown, signal?: AbortSignal) {
  const base = api.trim().replace(/\/$/, '');
  if (!base || (!base.startsWith('/') && !/^https?:\/\//i.test(base))) throw Error('请填写 /api 或完整的 HTTP(S) 后端地址。');
  const url = new URL(base + path, location.href);
  if (url.username || url.password) throw Error('后端地址不能包含账号或密码。');
  if (location.protocol === 'https:' && url.protocol !== 'https:') throw Error('HTTPS 页面不能连接 HTTP 后端；请使用 HTTPS 后端。');
  const response = await fetch(url, {method:body ? 'POST' : 'GET', headers:{'Content-Type':'application/json', Authorization:'Bearer '+token}, body:body ? JSON.stringify(body) : undefined, signal, cache:'no-store', credentials:'omit', redirect:'error'});
  let data;
  try { data = await response.json(); } catch { throw Error('后端未返回 JSON。请检查地址；GitHub Pages 不运行 Python。'); }
  if (!response.ok) throw Error(data.error || '后端请求失败');
  return data;
}
