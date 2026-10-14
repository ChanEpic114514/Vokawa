import catalogue from './phrase-audio.json';
import {pronunciation} from './pronunciation';
export type Reading = {char:string; jyutping:string|null};
export function selectedReadings(text:string, choices:Record<number,string>={}):Reading[] {
  return pronunciation(text).map(([char,values],i)=>({char,jyutping:choices[i]||values[0]||null}));
}
export function phraseRecording(text:string, readings:Reading[]) {
  const jp=readings.map(r=>r.jyutping).filter(Boolean).join(' ');
  return catalogue.find(r=>r.text===text&&r.jyutping===jp);
}
function endpoint(base:string) {
  const url=new URL(base.trim().replace(/\/$/,''),location.href);
  if(!base.trim()||url.username||url.password||!['http:','https:'].includes(url.protocol))throw Error('请填写有效的语音服务地址。');
  if(location.protocol==='https:'&&url.protocol!=='https:')throw Error('HTTPS 网页需要 HTTPS 语音服务。');
  return url;
}
export class CantonesePlayer {
  private audio:HTMLAudioElement|null=null;
  private controller:AbortController|null=null;
  private blobURL:string|null=null;
  private generation=0;
  private completeURL:string|null=null;
  private rate=1;
  private notify:((message:string)=>void)|null=null;
  stop() {
    this.generation++;this.controller?.abort();this.controller=null;
    this.audio?.pause();this.audio?.removeAttribute('src');this.audio?.load();this.audio=null;
    if(this.blobURL)URL.revokeObjectURL(this.blobURL);
    this.blobURL=null;this.completeURL=null;this.notify=null;
  }
  private startAudio(url:string,rate:number,notify:(s:string)=>void) {
    const audio=new Audio(url);this.audio=audio;audio.playbackRate=rate;
    audio.preservesPitch=true;
    audio.onended=()=>{if(this.audio===audio)notify('播放结束');};
    audio.onerror=()=>{if(this.audio===audio)notify('音频加载失败，请检查网络或离线缓存。');};
    return audio.play().catch(()=>{if(this.audio===audio)notify('音频已就绪，请点击“播放已生成音频”再次播放。');});
  }
  replay() {this.audio?.pause();if(this.completeURL&&this.notify)void this.startAudio(this.completeURL,this.rate,this.notify);}
  async play(text:string,readings:Reading[],api:string,kind:'fastapi'|'gradio',token:string,rate:number,notify:(s:string)=>void) {
    this.stop();this.rate=rate;this.notify=notify;
    if(!text.trim()){notify('请输入要播放的粤语文字。');return;}
    const id=this.generation,record=phraseRecording(text,readings);
    if(record) {
      const url=import.meta.env.BASE_URL+record.file;this.completeURL=url;
      notify(record.kind+' · '+(record.speaker||'Canto-TTS'));
      void this.startAudio(url,rate,notify);void fetch(url).catch(()=>{});return;
    }
    if(!navigator.onLine) {notify('这段文字没有已下载的完整录音；新句子生成需要联网语音服务。');return;}
    if(text.length>500) {notify('一次粤语合成最多 500 字，请分段输入。');return;}
    const base=endpoint(api),controller=new AbortController();this.controller=controller;
    const timeout=setTimeout(()=>controller.abort(),300000);
    notify('正在生成完整粤语音频；文字与所选粤拼会发送到你配置的语音服务。');
    try {
      let response:Response;
      if(kind==='gradio') {
        const request=await fetch(base.href.replace(/\/$/,'')+'/gradio_api/call/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:[text,JSON.stringify(readings)]}),signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});
        if(!request.ok)throw Error('语音服务不可用，请检查 Gradio 地址或额度。');
        const {event_id}=await request.json();if(typeof event_id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(event_id))throw Error('语音服务未返回任务编号。');
        const result=await fetch(base.href.replace(/\/$/,'')+'/gradio_api/call/generate/'+event_id,{signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});
        if(!result.ok)throw Error('无法获取语音任务结果。');
        const events=await result.text();
        const complete=events.split(/\r?\n\r?\n/).find(e=>e.startsWith('event: complete'));
        if(!complete)throw Error('语音生成未完成；请检查服务、生成失败或额度。');
        const line=complete.split(/\r?\n/).find(l=>l.startsWith('data: '));const values=JSON.parse(line?.slice(6)||'null');
        const audio=values?.[0];const fileURL=typeof audio?.url==='string'?new URL(audio.url,base):null;
        if(!fileURL||fileURL.origin!==base.origin||fileURL.username||fileURL.password)throw Error('语音文件地址无效。');
        response=await fetch(fileURL,{signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});
      } else {
        response=await fetch(base.href.replace(/\/$/,'')+'/speech',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({text,readings}),signal:controller.signal,credentials:'omit',cache:'no-store',redirect:'error'});
      }
      if(!response.ok) {const data=await response.json().catch(()=>null);throw Error(data?.error||'粤语合成失败，请检查语音后端。');}
      if(!(response.headers.get('Content-Type')||'').startsWith('audio/'))throw Error('语音服务未返回音频。');
      const blob=await response.blob();if(!blob.size||blob.size>50*1024*1024)throw Error('音频大小异常。');
      if(id!==this.generation)return;
      this.blobURL=URL.createObjectURL(blob);this.completeURL=this.blobURL;notify('完整音频已生成');
      await this.startAudio(this.blobURL,rate,notify);
    } catch(e) {
      if(id===this.generation)notify((e as Error).name==='AbortError'?'语音请求超时，请重试。':(e as Error).message);
    } finally {clearTimeout(timeout);if(id===this.generation)this.controller=null;}
  }
}
