import {afterEach, describe, expect, it, vi} from 'vitest';
import {matches, sentences, Speaker} from '../src/speech';
import {pronunciation, jyutping} from '../src/pronunciation';
import {demoTranslate, phrases, type Lang} from '../src/model';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('local voice selection',()=>{
 it('rejects Mandarin, Taiwan, unknown and remote voices for Cantonese',()=>{
  for(const lang of ['zh-CN','zh-TW','zh','cmn','en-US','yue-CN']) expect(matches({lang,localService:true},'yue')).toBe(false);
  expect(matches({lang:'zh-HK',localService:false},'yue')).toBe(false);
 });
 it('accepts explicit local Hong Kong/Cantonese language tags',()=>{
  for(const lang of ['zh-HK','zh_HK','yue-HK','yue','yue-Hant-HK','zh-Hant-HK']) expect(matches({lang,localService:true},'yue')).toBe(true);
 });
 it('keeps all characters and punctuation, including a long sentence',()=>{
  for(const text of ['銀行行長今日會開會。下一句！真的？','Hello! What?\n你好。', '長'.repeat(3000)]) expect(sentences(text).join('')).toBe(text);
 });
 it('uses one utterance per full sentence with the selected voice; stop invalidates late callbacks',()=>{
  const voice={lang:'zh-HK',localService:true,voiceURI:'hk',name:'HK'};
  const spoken: any[]=[];
  vi.stubGlobal('window',{speechSynthesis:{getVoices:()=>[voice],cancel:vi.fn(),speak:(u:unknown)=>spoken.push(u)}});
  vi.stubGlobal('SpeechSynthesisUtterance',class {constructor(public text:string){}});
  vi.useFakeTimers();const s=new Speaker();const status=vi.fn();s.speak('第一句。第二句！','yue','hk',0.8,status);
  expect(spoken).toHaveLength(1);expect(spoken[0].voice).toBe(voice);expect(spoken[0].text).toBe('第一句。');
  spoken[0].onend();expect(spoken[1].text).toBe('第二句！');s.stop();spoken[1].onend();expect(spoken).toHaveLength(2);
 });
 it('fails without any Cantonese voice rather than choosing a default Mandarin voice',()=>{
  const speak=vi.fn();vi.stubGlobal('window',{speechSynthesis:{getVoices:()=>[{lang:'zh-CN',localService:true}],cancel:vi.fn(),speak}});
  expect(()=>new Speaker().speak('你好','yue','',1,()=>{})).toThrow('没有可用');expect(speak).not.toHaveBeenCalled();
 });
});
describe('real local dictionary, not synthetic audio verification',()=>{
 it.each([['銀行','ngan4 hong4'],['行路','haang4 lou6'],['行長','hong4 zoeng2'],['音樂','jam1 ngok6'],['快樂','faai3 lok6'],['重要','zung6 jiu3'],['數一數','sou2 jat1 sou2'],['数一数','sou2 jat1 sou2']])('%s contextual output',(text,expected)=>expect(jyutping(text)).toBe(expected));
 it('does not force bank-president reading into walking context',()=>expect(jyutping('行長路')).toBe('haang4 coeng4 lou6'));
 it('exposes multiple readings for isolated 行',()=>expect(pronunciation('行')[0][1]).toEqual(expect.arrayContaining(['hang4','haang4','hong4'])));
});
it('preserves all six demo directions for all five examples',()=>{
 for(const source of ['en','zh','yue'] as Lang[])for(const target of ['en','zh','yue'] as Lang[])if(source!==target)for(const p of phrases)expect(demoTranslate(p[source],source,target).translation).toBe(p[target]);
 expect(()=>demoTranslate('arbitrary','en','yue')).toThrow('仅支持');
});
