import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{await page.addInitScript(()=>{if(!localStorage.getItem('vokawa-v2'))localStorage.setItem('vokawa-v2',JSON.stringify({settings:{demo:true,translationProvider:'backend'}}));});});
test('six directions, favorite persistence, search and fullscreen',async({page})=>{
 await page.goto('/');
 for(const src of ['en','zh','yue']) for(const dst of ['en','zh','yue']) if(src!==dst){
  await page.getByLabel('原文语言',{exact:true}).selectOption(src);await page.getByLabel('译文语言',{exact:true}).selectOption(dst);
  await page.getByLabel('待翻译文字').fill(src==='en'?'Hello!':'你好！');
  await page.getByRole('button',{name:'翻译',exact:true}).last().click();await expect(page.getByTestId('result')).toContainText(dst==='en'?'Hello!':'你好！');
 }
 await page.getByLabel('收藏',{exact:true}).click();await page.reload();await page.getByRole('button',{name:'记录',exact:true}).click();
 await page.getByText('只看收藏').click();await expect(page.locator('.translation')).toHaveCount(1);
 await page.getByRole('button',{name:'放大',exact:true}).click();await expect(page.locator('dialog')).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByLabel('搜索记录').fill('unmatched');await expect(page.locator('.translation')).toHaveCount(0);
});
test('conversation reverses language and preserves turns',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'对话',exact:true}).click();await page.getByLabel('待翻译文字').fill('How much is this?');
 await page.getByRole('button',{name:'翻译',exact:true}).last().click();await expect(page.locator('.translation')).toHaveText('呢個幾多錢？');
 await page.getByRole('button',{name:'粤语 说话',exact:true}).click();await page.getByLabel('待翻译文字').fill('你好！');await page.getByRole('button',{name:'翻译',exact:true}).last().click();await expect(page.locator('.translation').last()).toHaveText('Hello!');
});
test('offline reload retains dictionary and history at Pages subpath',async({page,context})=>{
 await page.goto('/Vokawa/');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await page.getByLabel('待翻译文字').fill('How much is this?');
 await page.getByRole('button',{name:'翻译',exact:true}).last().click();
 await context.setOffline(true);await page.reload();await expect(page.getByRole('heading',{name:'Vokawa',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'粤语朗读',exact:true}).click();await page.getByLabel('单字、词语或长句').fill('銀行行長');await expect(page.getByTestId('chosen-jyutping')).toHaveText('ngan4 hong4 hong4 zoeng2');
 await page.getByRole('button',{name:'记录',exact:true}).click();await expect(page.locator('.translation')).toHaveText('呢個幾多錢？');
 const urls=await page.evaluate(async()=>{const keys=await caches.keys();const paths=[];for(const k of keys)for(const r of await (await caches.open(k)).keys())paths.push(new URL(r.url).pathname);return paths;});
 expect(urls.some(x=>x.endsWith('/api/translate'))).toBe(false);
});
test('root offline cache and manifest install paths',async({page,context})=>{
 await page.goto('/');const manifest=await page.evaluate(async()=>fetch(document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href).then(r=>r.json()));expect(manifest.display).toBe('standalone');expect(manifest.start_url).toBe('./');
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await context.setOffline(true);await page.reload();await expect(page.getByLabel('待翻译文字')).toBeVisible();
});
test('real headless browser missing-voice path and narrow layout',async({page})=>{
 await page.goto('/');const voices=await page.evaluate(()=>speechSynthesis.getVoices().map(v=>({lang:v.lang,local:v.localService})));
 console.log('Actual headless browser voices:',JSON.stringify(voices));
 await page.getByRole('button',{name:'粤语朗读',exact:true}).click();await page.getByRole('button',{name:'系统试听（未审核）',exact:true}).click();
 if(!voices.length)await expect(page.getByRole('status')).toContainText('没有可用的本地香港粤语声音');
 for(const tab of ['翻译','对话','粤语朗读','记录','设置']){await page.getByRole('button',{name:tab,exact:true}).first().click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
});
test('polyphonic choice selects matching real recording',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'粤语朗读',exact:true}).click();await page.getByLabel('单字、词语或长句').fill('行');await page.getByLabel('行的候选读音 1',{exact:true}).selectOption('hong4');await expect(page.getByTestId('chosen-jyutping')).toHaveText('hong4');const response=page.waitForResponse(r=>r.url().endsWith('/audio/ekho/hong4.wav')&&r.status()===200);await page.getByLabel('播放行的单字录音 1',{exact:true}).click();const data=await(await response).body();expect(data.subarray(0,4).toString()).toBe('RIFF');await expect(page.getByRole('status')).toContainText('hong4');
});
test('mocked API translation escapes HTML and stores no token',async({page})=>{
 await page.route('**/api/translate',async route=>{
  expect(route.request().headers()['authorization']).toBe('Bearer secret-test');
  expect(route.request().postDataJSON().text).toBe('real request');
  await route.fulfill({json:{translation:'<img src=x onerror=alert(1)>',engine:'mock only'}});
 });
 await page.goto('/');await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('示例模式',{exact:true}).uncheck();await page.getByLabel('连接令牌（仅当前页面内存）').fill('secret-test');
 await page.getByRole('button',{name:'翻译',exact:true}).first().click();await page.getByLabel('待翻译文字').fill('real request');await page.getByRole('button',{name:'翻译',exact:true}).last().click();
 await expect(page.getByTestId('result')).toContainText('<img src=x onerror=alert(1)>');await expect(page.locator('[data-testid=result] img')).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('secret-test');
});
test('microphone never starts automatically, requires consent, aborts on tab switch',async({page})=>{
 await page.addInitScript(()=>{
  const w=window as any;w.micCalls={start:0,abort:0};w.SpeechRecognition=w.webkitSpeechRecognition=class{start(){w.micCalls.start++;}abort(){w.micCalls.abort++;}};
 });
 await page.goto('/');expect(await page.evaluate(()=>(window as any).micCalls.start)).toBe(0);
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'◉ 语音输入',exact:true}).click();expect(await page.evaluate(()=>(window as any).micCalls.start)).toBe(0);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'◉ 语音输入',exact:true}).click();expect(await page.evaluate(()=>(window as any).micCalls.start)).toBe(1);
 await page.getByRole('button',{name:'记录',exact:true}).click();expect(await page.evaluate(()=>(window as any).micCalls.abort)).toBe(1);
});
