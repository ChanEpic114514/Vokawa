import {test,expect} from '@playwright/test';
test('real complete word and chosen sentence recordings replay offline at Pages subpath',async({page,context})=>{
 await page.goto('/Vokawa/');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();
 await page.getByRole('button',{name:'粤语朗读',exact:true}).click();
 await page.locator('section').filter({has:page.getByRole('heading',{name:'内置完整录音'})}).getByRole('button',{name:'如果',exact:true}).click();
 const response=page.waitForResponse(r=>r.url().endsWith('/audio/words/word-01.wav')&&r.status()===200);
 await page.getByRole('button',{name:'播放粤语音频',exact:true}).click();expect((await(await response).body()).subarray(0,4).toString()).toBe('RIFF');
 await expect.poll(()=>page.evaluate(async()=>!!await(await caches.open('vokawa-ekho-v9')).match(new URL('audio/words/word-01.wav',location.href).href))).toBe(true);
 const text='銀行行長今日會開會，開完會之後，我哋一齊去食飯。';
 await page.locator('section').filter({has:page.getByRole('heading',{name:'内置完整录音'})}).getByRole('button',{name:text,exact:true}).click();
 const sentence=page.waitForResponse(r=>r.url().endsWith('/audio/sentences/canto-15.wav')&&r.status()===200);
 await page.getByRole('button',{name:'播放粤语音频',exact:true}).click();await sentence;
 await expect.poll(()=>page.evaluate(async()=>!!await(await caches.open('vokawa-ekho-v9')).match(new URL('audio/sentences/canto-15.wav',location.href).href))).toBe(true);
 await context.setOffline(true);await page.reload();
 const decoded=await page.evaluate(async()=>{const ctx=new AudioContext();try{const b=await(await fetch('audio/sentences/canto-15.wav')).arrayBuffer();return(await ctx.decodeAudioData(b)).duration;}finally{await ctx.close();}});
 expect(decoded).toBeGreaterThan(1);
});
test('new synthesis sends explicit chosen Jyutping and does not fall back to system speech',async({page})=>{
 await page.addInitScript(()=>{(window as any).spoken=0;window.speechSynthesis.speak=()=>{(window as any).spoken++;};});
 await page.route('**/api/speech',async route=>{
  const data=route.request().postDataJSON();expect(data.text).toBe('行長想食飯。');expect(data.readings[0].jyutping).toBe('hong4');
  await route.fulfill({status:503,json:{error:'语音后端暂不可用'}});
 });
 await page.goto('/');await page.getByRole('button',{name:'粤语朗读',exact:true}).click();await page.getByLabel('单字、词语或长句').fill('行長想食飯。');await page.getByLabel('行的候选读音 1',{exact:true}).selectOption('hong4');
 await page.getByRole('button',{name:'播放粤语音频',exact:true}).click();await expect(page.getByRole('status')).toContainText('语音后端暂不可用');
 expect(await page.evaluate(()=>(window as any).spoken)).toBe(0);
});
