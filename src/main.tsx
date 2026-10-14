import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {names, phrases, loadSaved, demoTranslate, apiCall, type Entry, type Lang, type Settings} from './model';
import {Speaker, matches} from './speech';
import {EkhoPlayer, recordingURL} from './ekho';
import {CantonesePlayer, selectedReadings} from './cantonese';
import phraseAudio from './phrase-audio.json';
import {Microphone} from './microphone';
import {pronunciation, jyutping} from './pronunciation';
import {onlineTranslate} from './translation';
import './style.css';

const initial = loadSaved();
const tabs = ['翻译','对话','粤语朗读','记录','设置'] as const;
type Tab = typeof tabs[number];
function App() {
  const [tab,setTab] = useState<Tab>('翻译');
  const [settings,setSettings] = useState<Settings>(initial.settings);
  const [history,setHistory] = useState<Entry[]>(initial.history);
  const [src,setSrc] = useState<Lang>('en'), [dst,setDst] = useState<Lang>('yue');
  const [input,setInput] = useState('');
  const [result,setResult] = useState<Entry|null>(null), [turns,setTurns] = useState<Entry[]>([]);
  const [reverse,setReverse] = useState(false), [busy,setBusy] = useState(false);
  const [message,setMessage] = useState(''), [token,setToken] = useState('');
  const [voices,setVoices] = useState<SpeechSynthesisVoice[]>([]), [recording,setRecording] = useState(false);
  const [search,setSearch] = useState(''), [favorites,setFavorites] = useState(false);
  const [full,setFull] = useState(''), [online,setOnline] = useState(navigator.onLine);
  const [reading,setReading] = useState('銀行行長今日會開會，開完會之後，我哋一齊去食飯。');
  const [choices,setChoices] = useState<Record<number,string>>({});
  const [offlineReady,setOfflineReady] = useState(false);
  const ekho = useRef(new EkhoPlayer()), canto=useRef(new CantonesePlayer());
  const speaker = useRef(new Speaker()), mic = useRef(new Microphone());
  const request = useRef<AbortController|null>(null), generation = useRef(0);
  const pair: [Lang,Lang] = tab === '对话' && reverse ? [dst,src] : [src,dst];
  const candidates = useMemo(() => pronunciation(reading),[reading]);
  const dialog = useRef<HTMLDialogElement>(null);
  function cancel() {generation.current++;request.current?.abort();request.current=null;setBusy(false);}
  function stop() {mic.current.stop();speaker.current.stop();ekho.current.stop();canto.current.stop();}
  function changeTab(t:Tab) {cancel();stop();setMessage('');setTab(t);}
  function updateInput(text:string) {cancel();setInput(text);setResult(null);setMessage('');}
  function setting<K extends keyof Settings>(key:K, value:Settings[K]) {cancel();setSettings(s=>({...s,[key]:value}));}
  function refreshVoices() {setVoices('speechSynthesis' in window ? window.speechSynthesis.getVoices() : []);}
  useEffect(() => {
    try {localStorage.setItem('vokawa-v2',JSON.stringify({settings,history}));} catch {setMessage('本机存储不可用或已满；记录可能无法保存。');}
  },[settings,history]);
  useEffect(() => {
    refreshVoices();
    window.speechSynthesis?.addEventListener('voiceschanged',refreshVoices);
    const hide = () => {if(document.hidden){stop();cancel();}};
    const pagehide = () => {stop();cancel();};
    const network = () => setOnline(navigator.onLine);
    document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',pagehide);
    window.addEventListener('online',network);window.addEventListener('offline',network);
    if ('serviceWorker' in navigator) navigator.serviceWorker.ready.then(() => setOfflineReady(true));
    return () => {stop();request.current?.abort();window.speechSynthesis?.removeEventListener('voiceschanged',refreshVoices);document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',pagehide);window.removeEventListener('online',network);window.removeEventListener('offline',network);};
  },[]);
  function play(text: string, lang: Lang) {
    stop();
    try {
      speaker.current.speak(text, lang, settings.voice, settings.rate, setMessage);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  function playWorkbench(text:string,lang:Lang,selected:Record<number,string>={}) {
    mic.current.stop();ekho.current.stop();canto.current.stop();
    if(lang==='yue' && Array.from(text.trim()).length===1) {
      speaker.current.stop();
      const key=selectedReadings(text,selected).find(r=>r.jyutping)?.jyutping;
      if(key) ekho.current.play(key,setMessage);
      else setMessage('这个字没有候选读音，请在粤语读音工作台检查。');
      return;
    }
    if(lang==='yue') {speaker.current.stop();void canto.current.play(text,selectedReadings(text,selected),settings.speechApi,settings.speechKind,token,settings.rate,setMessage).catch(e=>setMessage(e.message));return;}
    try {speaker.current.speak(text,lang,settings.voice,settings.rate,setMessage);} catch(e) {setMessage((e as Error).message);}
  }
  function toggleMic() {
    if(recording) {mic.current.stop();return;}
    speaker.current.stop();ekho.current.stop();canto.current.stop();cancel();
    try {mic.current.start(pair[0],updateInput,setRecording,setMessage);} catch(e){setMessage((e as Error).message);}
  }
  async function translate() {
    stop();cancel();
    const id = generation.current, text=input.trim(), [source,target]=pair;
    if(!text || source===target) {setMessage('请输入文字并选择不同语言。');return;}
    setBusy(true);setMessage('');setResult(null);
    const controller = new AbortController();request.current=controller;
    const timeout = setTimeout(()=>controller.abort(),180000);
    try {
      const data = settings.demo ? demoTranslate(text,source,target) : settings.translationProvider==='mymemory' ? await onlineTranslate(text,source,target,controller.signal,(done,total)=>{if(id===generation.current)setMessage(`正在翻译 ${Math.min(done+1,total)}/${total} 段…`);}) : await apiCall(settings.api,token,'/translate',{text,source,target,context:tab==='对话'?turns.slice(-6).map(e=>({sourceText:e.sourceText,targetText:e.targetText})):[]},controller.signal);
      if(id!==generation.current) return;
      if(typeof data.translation!=='string' || !data.translation.trim()) throw Error('后端没有返回有效译文。');
      const entry: Entry = {id:crypto.randomUUID(),source,target,sourceText:text,targetText:data.translation,engine:data.engine || '翻译服务',favorite:false,notice:'notice' in data?String(data.notice):undefined};
      setMessage('');setResult(entry);
      if(settings.save) setHistory(h=>[entry,...h].filter((e,i)=>e.favorite || i<500));
      if(tab==='对话') {setTurns(t=>[...t,entry]);setInput('');}
      if(settings.auto) play(entry.targetText,target);
    } catch(e) {if(id===generation.current)setMessage((e as Error).name==='AbortError'?'请求超时，请重试。':(e as Error).message);}
    finally {clearTimeout(timeout);if(id===generation.current){setBusy(false);request.current=null;}}
  }
  function favorite(entry:Entry) {
    setHistory(h=>h.some(e=>e.id===entry.id)?h.map(e=>e.id===entry.id?{...e,favorite:!e.favorite}:e):[{...entry,favorite:true},...h]);
  }
  function card(entry:Entry) {
    return <article className="card" key={entry.id}><small>{names[entry.target]} · {entry.engine}</small><p className="translation">{entry.targetText}</p>{entry.target==='yue'&&settings.jp&&<p className="jyutping">{jyutping(entry.targetText)}</p>}{entry.notice&&<p className="hint">{entry.notice}</p>}<div className="actions"><button onClick={()=>play(entry.targetText,entry.target)}>播放{entry.target==='yue'?'粤语':''}</button><button aria-label="收藏" onClick={()=>favorite(entry)}>{history.some(e=>e.id===entry.id&&e.favorite)?'★ 已收藏':'☆ 收藏'}</button><button onClick={()=>navigator.clipboard?.writeText(entry.targetText).then(()=>setMessage('已复制')).catch(()=>setMessage('复制失败，请选中文字复制。'))}>复制</button><button onClick={()=>{setFull(entry.targetText);dialog.current?.showModal();}}>放大</button></div></article>;
  }
  function languages() {
    return <div className="languages"><label>原文语言<select aria-label="原文语言" value={src} onChange={e=>{cancel();stop();setSrc(e.target.value as Lang);setResult(null);}}>{Object.entries(names).map(([k,n])=><option value={k} key={k}>{n}</option>)}</select></label><button aria-label="交换语言" onClick={()=>{cancel();stop();setSrc(dst);setDst(src);setInput(result?.targetText||'');setResult(null);}}>⇄</button><label>译文语言<select aria-label="译文语言" value={dst} onChange={e=>{cancel();stop();setDst(e.target.value as Lang);setResult(null);}}>{Object.entries(names).map(([k,n])=><option value={k} key={k}>{n}</option>)}</select></label></div>;
  }
  return <><header><div className="brand"><span className="logo">V</span><div><h1>Vokawa</h1><small>英语 · 普通话 · 香港粤语</small></div></div><span className="badge">{online?'在线':'离线'} · PWA 0.5</span></header><main>
    <nav aria-label="主要导航">{tabs.map(t=><button key={t} aria-current={tab===t?'page':undefined} onClick={()=>changeTab(t)}>{t}</button>)}</nav>
    <div className="mode">{settings.demo?'离线示例模式 · 五组内置句子':settings.translationProvider==='mymemory'?'即时翻译 · MyMemory · 输入自己的字、词或句子':'自备翻译后端 · FastAPI + Ollama'}</div>
    {message&&<div className="status" role="status">{message}</div>}
    {(tab==='翻译'||tab==='对话')&&<>
      {languages()}
      {tab==='对话'&&<><div className="actions"><button onClick={()=>{cancel();stop();setTurns([]);setInput('');}}>新对话</button><small>{settings.translationProvider==='mymemory'?'逐条翻译，不发送先前对话；歧义请在本条输入中补充上下文。':'自备模型使用最近六轮上下文'}</small></div>{turns.map(e=><section key={e.id}><p className="source">{names[e.source]} · {e.sourceText}</p>{card(e)}</section>)}<div className="actions">{[false,true].map(r=><button className={reverse===r?'selected':''} key={String(r)} onClick={()=>{cancel();stop();setReverse(r);setInput('');}}>{names[r?dst:src]} 说话</button>)}</div></>}
      <section className="card"><label htmlFor="input">{names[pair[0]]} → {names[pair[1]]}</label><textarea id="input" aria-label="待翻译文字" value={input} maxLength={3000} onChange={e=>updateInput(e.target.value)} placeholder="输入任意字、词或句子，点击翻译…"/><div className="actions"><button className={recording?'recording':''} onClick={toggleMic}>{recording?'■ 停止录音':'◉ 语音输入'}</button><button onClick={()=>play(input,pair[0])}>朗读原文</button><button onClick={()=>{stop();updateInput('');}}>清空</button><small>{input.length}/3000</small></div></section>
      {!settings.demo&&settings.translationProvider==='mymemory'&&<p className="hint">点击翻译会把本次文字发送至 MyMemory。免费匿名额度每天 5000 字符（以服务实际限制为准），无密钥、不自动付费。供应商可能保留文字并交由合作翻译服务处理，请勿发送敏感资料。单字或短词有歧义时，请加上语境。</p>}
      <button className="primary wide" onClick={()=>busy?(cancel(),setMessage('已取消翻译。')):void translate()}>{busy?'取消翻译':'翻译'}</button>
      {tab==='翻译'&&result&&<div data-testid="result">{card(result)}</div>}
      <details className="samples"><summary>载入示例句子</summary>{phrases.map((p,i)=><button key={i} onClick={()=>updateInput(p[pair[0]])}>{p[pair[0]]}</button>)}</details>
      <p className="hint">译文播放使用系统声音；粤语采用设置中的本地香港粤语声音，无需语音后端。系统自行判断读音，显示的粤拼不会控制系统发音。</p>
    </>}
    {tab==='粤语朗读'&&<>
      <h2>粤语读音工作台</h2><p className="hint">单字使用 Ekho 原始录音，可手动选择多音字读音。文字与粤拼在本机处理；音频从本站按需取得。新长句交给 Canto-TTS 按句子或较长分句合成，不拼接单字录音。</p>
      <section className="card"><label htmlFor="reading">单字、词语或长句</label><textarea id="reading" value={reading} maxLength={3000} onChange={e=>{stop();setReading(e.target.value);setChoices({});}}/><div className="actions"><button className="primary" onClick={()=>playWorkbench(reading,'yue',choices)}>播放粤语音频</button><button onClick={()=>canto.current.replay()}>播放已生成音频</button><button onClick={()=>{stop();try{speaker.current.speak(reading,'yue',settings.voice,settings.rate,setMessage);}catch(e){setMessage((e as Error).message);}}}>系统试听（未审核）</button><button onClick={stop}>停止播放</button></div></section>
      <div className="notice">单字使用 Ekho；已收录完整词语使用真人录音；句子使用 Canto-TTS。候选选择决定发送给模型的读音，但不保证每次合成完全正确。首次生成新句子需连接语音服务；不会自动改用系统声音。句子仍可能偶尔漏字或节奏不稳。</div>
      <section className="card"><h3>上下文候选读音</h3><div className="readings">{candidates.map(([char,values],i)=><label key={i} className="reading"><span>{char}</span>{values.length>1?<select aria-label={`${char}的候选读音 ${i+1}`} value={choices[i]||values[0]} onChange={e=>{stop();setChoices(c=>({...c,[i]:e.target.value}));}}>{values.map(p=><option key={p}>{p}</option>)}</select>:<small>{values[0]||'—'}</small>}{values.length>0&&<button aria-label={`播放${char}的单字录音 ${i+1}`} disabled={!recordingURL(choices[i]||values[0])} onClick={()=>{stop();ekho.current.play(choices[i]||values[0],setMessage);}}>单字录音</button>}</label>)}</div><p className="jyutping" data-testid="chosen-jyutping">{candidates.map(([,v],i)=>choices[i]||v[0]||'').filter(Boolean).join(' ')}</p><small>词典候选含异读，不代表全部都是现代香港常用读音。默认首选来自词语匹配，不能完全理解句意。</small></section>
      <section className="card"><h3>内置完整录音</h3><p>这些词语和句子已随网站提供，首次取得后可离线播放。</p><div className="actions">{phraseAudio.filter((r,i,a)=>a.findIndex(x=>x.text===r.text)===i).map(r=><button key={r.text} onClick={()=>{stop();setReading(r.text);let n=0;const jp=r.jyutping.split(' '),chosen:Record<number,string>={};pronunciation(r.text).forEach(([,v],i)=>{if(v.length)chosen[i]=jp[n++]||v[0];});setChoices(chosen);}}>{r.text}</button>)}</div><p><a href="./audio/words/ATTRIBUTION.txt">真人词语来源、录音者与授权</a> · <a href="./audio/sentences/MODEL_LICENSE.txt">Canto-TTS 模型授权</a></p></section>
      <div className="actions">{['行','銀行行長','音樂與快樂','我今日想搭地鐵去中環，之後同朋友食飯。'].map(t=><button key={t} onClick={()=>{stop();setReading(t);setChoices({});}}>{t}</button>)}</div>
    </>}
    {tab==='记录'&&<><h2>记录与收藏</h2><input aria-label="搜索记录" placeholder="搜索原文或译文" value={search} onChange={e=>setSearch(e.target.value)}/><label className="setting">只看收藏<input type="checkbox" checked={favorites} onChange={e=>setFavorites(e.target.checked)}/></label>{history.filter(e=>(!favorites||e.favorite)&&(e.sourceText+e.targetText).toLowerCase().includes(search.toLowerCase())).map(e=><section key={e.id}><p className="source">{e.sourceText}</p>{card(e)}<button onClick={()=>setHistory(h=>h.filter(x=>x.id!==e.id))}>删除记录</button></section>)}{!history.length&&<p className="empty">还没有记录。翻译后会显示在这里。</p>}</>}
    {tab==='设置'&&<>
      <h2>设置</h2><section className="card"><h3>粤语词句合成</h3><label>语音服务类型<select value={settings.speechKind} onChange={e=>{stop();setting('speechKind',e.target.value as 'fastapi'|'gradio');}}><option value="fastapi">FastAPI 后端</option><option value="gradio">Gradio / Hugging Face Space</option></select></label><label>语音服务地址<input value={settings.speechApi} onChange={e=>{stop();setting('speechApi',e.target.value);}} placeholder="/api 或 https://你的服务.hf.space"/></label><p>单字及内置完整录音不依赖模型服务。新句子的文字和粤拼会发送到此地址；返回音频只保留在当前页面内存，不自动存入离线缓存。语速控制保持音高，但不能保证修复节奏或漏字。</p><p>FastAPI 使用下方连接令牌。Gradio 连接公开语音服务，不向其发送该令牌。免费远程部署尚需你的可用托管账号及实际验证。</p></section><section className="card"><h3>翻译服务</h3><label className="setting">示例模式<input type="checkbox" checked={settings.demo} onChange={e=>setting('demo',e.target.checked)}/></label><label>翻译服务<select value={settings.translationProvider} onChange={e=>setting('translationProvider',e.target.value as 'mymemory'|'backend')}><option value="mymemory">MyMemory 免费联网翻译（默认）</option><option value="backend">自备 FastAPI + Ollama（可选）</option></select></label><p className="hint">默认服务支持任意文本及六个语言方向，不需要 Python、Ollama 或 API 密钥。长文本按 500 UTF-8 字节分段，可能损失跨段语境；全部成功才显示完整结果。服务有免费额度，不保证每个词义都正确。</p><p><a href="https://mymemory.translated.net/doc/usagelimits.php" target="_blank" rel="noreferrer">免费额度</a> · <a href="https://mymemory.translated.net/terms-and-conditions" target="_blank" rel="noreferrer">条款及隐私说明</a></p><p className="hint">下面地址与令牌用于自备后端及 FastAPI 语音，不会发送给 MyMemory。不使用自备后端时可留空令牌。</p><label>后端地址<input value={settings.api} onChange={e=>setting('api',e.target.value)} placeholder="/api 或 https://…"/></label><label>连接令牌（仅当前页面内存）<input type="password" autoComplete="off" value={token} onChange={e=>{cancel();setToken(e.target.value);}}/></label><button onClick={async()=>{try{const r=await apiCall(settings.api,token,'/health',undefined,AbortSignal.timeout(8000));setMessage(r.message);}catch(e){setMessage((e as Error).message);}}}>测试自备后端连接</button></section>
      <section className="card"><h3>本地粤语声音</h3><button onClick={()=>{refreshVoices();setMessage('已刷新浏览器可用声音。');}}>刷新声音</button><label>选择声音<select value={settings.voice} onChange={e=>setting('voice',e.target.value)}><option value="">自动选择可用本地香港粤语声音</option>{voices.filter(v=>matches(v,'yue')).map(v=><option value={v.voiceURI} key={v.voiceURI}>{v.name} · {v.lang}</option>)}</select></label><p className="hint">检测到 {voices.filter(v=>matches(v,'yue')).length} 个本地粤语声音。只接受香港粤语 / yue 及 localService 声音。下载的增强语音未必会向 Safari 开放；须在真机试听并做飞行模式测试。</p><button onClick={()=>{stop();try{speaker.current.speak('銀行行長今日會開會，唔該你講慢啲。','yue',settings.voice,settings.rate,setMessage);}catch(e){setMessage((e as Error).message);}}}>试听粤语</button><button onClick={stop}>停止播放</button></section>
      <section className="card"><h3>播放与记录</h3>{([['auto','自动播放译文'],['jp','显示粤拼'],['save','保存新历史记录']] as const).map(([k,n])=><label className="setting" key={k}>{n}<input type="checkbox" checked={settings[k]} onChange={e=>setting(k,e.target.checked)}/></label>)}<label>语速 {settings.rate.toFixed(1)}×<input type="range" min="0.6" max="1.2" step="0.1" value={settings.rate} onChange={e=>setting('rate',Number(e.target.value))}/></label><button onClick={()=>{if(confirm('删除全部历史与收藏？')){setHistory([]);localStorage.removeItem('vokawa-preview');setMessage('已删除记录。');}}}>删除全部记录</button><p className="hint">录音只在点击并同意后开始，最长 30 秒；切换页面或锁屏即停止。识别可能使用系统供应商网络服务。Vokawa 不保存麦克风音频、不保存连接令牌。MyMemory 只接收本次文字；选用自备翻译后端时，对话会发送最近六轮上下文。</p></section>
      <section className="card"><h3>Ekho 单字录音</h3><p>已接入标准六调编号的 4296 个原始音节文件；不代表 4296 个常用汉字。你已确认两轮试听共 71 项正确，并接受其作为单字资源。首次播放需联网，成功缓存的音节可离线重播；浏览器清除缓存后需重新下载。系统可能清除网站数据。</p><p>录音无需 Ollama、录音权限或 Chromebook 在线。完整真人词语和 Canto-TTS 样本已接入；任意新词句需要语音服务。</p><a href="./audio/ekho/COPYING.txt">Ekho 录音授权 GPLv2</a></section><section className="card"><h3>iPhone 安装</h3><p>使用 Safari 打开 HTTPS 地址，分享 → 添加到主屏幕。</p><p>{offlineReady?'离线应用缓存已就绪':'离线缓存尚未就绪（开发模式不会启用）'}。首次联网打开并等待缓存完成后，再测试断网重开。系统可能清除网站数据；历史只保存在当前设备。</p><p>应用更新会在所有旧页面关闭后启用。无 Xcode、Expo 或 Apple 开发者账号依赖。</p><a href="./THIRD_PARTY_NOTICES.txt">第三方授权说明</a></section>
    </>}
    <footer>Vokawa · 0.5 · Ekho 单字 · 真人词语 · Canto-TTS 句子</footer>
  </main><dialog ref={dialog}><p className="fullscreen">{full}</p><button onClick={()=>dialog.current?.close()}>关闭</button></dialog></>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
