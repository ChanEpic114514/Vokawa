import {test,expect} from '@playwright/test';
test('selected full WAV caches and decodes offline under GitHub Pages subpath',async({page,context})=>{
 await page.goto('/Vokawa/');await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();
 await page.getByRole('button',{name:'粤语朗读',exact:true}).click();await page.getByLabel('单字、词语或长句').fill('行');await page.getByLabel('行的候选读音 1',{exact:true}).selectOption('hong4');await page.getByLabel('播放行的单字录音 1',{exact:true}).click();
 await expect.poll(()=>page.evaluate(async()=>!!(await(await caches.open('vokawa-ekho-v9')).match(new URL('audio/ekho/hong4.wav',location.href).href)))).toBe(true);
 await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'粤语朗读',exact:true}).click();await page.getByLabel('单字、词语或长句').fill('行');await page.getByLabel('行的候选读音 1',{exact:true}).selectOption('hong4');await page.getByLabel('播放行的单字录音 1',{exact:true}).click();
 const duration=await page.evaluate(async()=>{const r=await fetch('audio/ekho/hong4.wav');if(r.status!==200)throw Error('No cached full WAV');const ctx=new AudioContext();try{return(await ctx.decodeAudioData(await r.arrayBuffer())).duration;}finally{await ctx.close();}});expect(duration).toBeGreaterThan(0.1);expect(duration).toBeLessThan(1);
});
