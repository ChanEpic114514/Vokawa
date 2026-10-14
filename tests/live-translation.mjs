// Opt-in, real API test; consumes free quota. No mocked responses, not part of CI.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const cases=[
 ['en','yue','water'],['en','yue','train station'],['en','yue','Please keep my blue umbrella at the front desk until Friday.'],
 ['zh','yue','吃'],['zh','yue','钱包'],['zh','yue','我不是忘记带文件，而是把文件放在了另一只袋子里。'],
 ['yue','zh','佢'],['yue','zh','鎖匙'],['yue','zh','我今晚唔返屋企食飯，你哋唔使等我。'],
 ['yue','en','瞓'],['yue','en','落雨'],['yue','en','如果聽朝落雨，我哋就搭地鐵去博物館。'],
 ['en','zh','tree'],['en','zh','boarding pass'],['en','zh','The meeting starts at 9:30, not 8:30. Please bring two copies.'],
 ['zh','en','猫'],['zh','en','图书馆'],['zh','en','我已经买了三张票，但是还没有收到确认邮件。'],
 ['zh','yue','下星期三我们原本计划一起去郊外散步，不过天气预报说明天开始会连续下雨，所以我想先问问大家的意见。要是你们觉得不方便，我们可以改到星期六上午再出发，也可以选择留在市区，找一家安静的餐厅吃午饭，然后去附近的博物馆看看。请你收到消息以后，在今天晚上九点之前告诉我你的选择，我好提前订位和买票。如果有人需要带小朋友一起来，也请告诉我人数，我会确认餐厅有没有儿童座椅，以及博物馆是否需要另外预约。']
];
const server=spawn(process.execPath,['tests/serve.mjs'],{stdio:['ignore','ignore','pipe']});
let browser;const results=[];
try{
 let ready=false;
 for(let i=0;i<80;i++){
  if(server.exitCode!==null)throw Error('测试服务启动失败，检查 4173 端口。');
  try{if((await fetch('http://127.0.0.1:4173')).ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 assert(ready,'Run npm run build first');
 browser=await chromium.launch({...(process.env.VOKAWA_CHROMIUM?{executablePath:process.env.VOKAWA_CHROMIUM,args:['--no-sandbox']}:{}),...(process.env.VOKAWA_BROWSER_PROXY?{proxy:{server:process.env.VOKAWA_BROWSER_PROXY,bypass:'127.0.0.1,localhost'}}:{})});
 // Explicit option only for this isolated environment's TLS-intercepting proxy.
 const proxyTLS=!!process.env.VOKAWA_BROWSER_PROXY&&process.env.VOKAWA_TEST_PROXY_TLS==='1';
 const page=await browser.newPage({viewport:{width:390,height:844},ignoreHTTPSErrors:proxyTLS});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173');
 for(const [source,target,input] of cases){
  await page.getByLabel('原文语言',{exact:true}).selectOption(source);await page.getByLabel('译文语言',{exact:true}).selectOption(target);await page.getByLabel('待翻译文字').fill(input);
  const began=Date.now();await page.getByRole('button',{name:'翻译',exact:true}).last().click();
  await page.waitForFunction(()=>!!document.querySelector('[data-testid=result]')||(![...document.querySelectorAll('button')].some(b=>b.textContent==='取消翻译')&&!!document.querySelector('[role=status]')),{},{timeout:190000});
  const result=page.locator('[data-testid=result] .translation'),translation=await result.count()?await result.textContent():null;
  const error=translation?null:await page.getByRole('status').textContent();
  results.push({source,target,input,translation,error,seconds:(Date.now()-began)/1000});console.log(JSON.stringify(results.at(-1)));if(error)break;
 }
 await mkdir('test-results',{recursive:true});
 await writeFile('test-results/live-translation.json',JSON.stringify({timestamp:new Date().toISOString(),mode:'Real browser, actual MyMemory API, no mocks',testProxyTLSException:proxyTLS,iphone:'not tested',quality:'Results for review, not a linguistic certification',pageErrors:errors,results},null,2));
 assert.equal(errors.length,0);assert.equal(results.length,cases.length);assert(results.every(x=>x.translation));
}finally{await browser?.close();server.kill('SIGTERM');}
