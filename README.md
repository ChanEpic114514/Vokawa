# Vokawa 0.5 — 即时文字翻译

React + TypeScript + Vite + PWA；保留可选 Python / FastAPI 后端。

**本地运行见 [第 5 版更新、运行与测试教程](docs/V05_UPDATE_TEST_ZH.md)。GitHub Pages 在推送到 main 后自动部署。**

```bash
npm ci
npm run dev -- --port 5173 --strictPort
```

Chrome 打开 http://localhost:5173 。输入自己的字、词、句子，点击翻译。默认 MyMemory 官方公共 API 支持英语、普通话、香港粤语六向互译，无需密钥、Python、Ollama 或本地翻译模型。

匿名免费额度每天 5000 字符，单请求最多 500 UTF-8 字节；长文本分段，全部成功才显示结果。不是无限、离线、零误译服务。点击后输入发送到供应商，可能被保留或交由合作翻译服务处理，勿发送敏感资料。额度耗尽后停止，不自动付费。

翻译页、对话及历史记录的播放采用系统声音；香港粤语声音需在当前设备上选择并试听，无需语音后端。粤语朗读工作台保留 Ekho 单字、多音字选择、完整录音及可选 Canto-TTS 路径；该工作台合成任意新词句仍需语音服务，可改点同页的系统试听。

| 路径 | 用途 |
| --- | --- |
| src/translation.ts | 免费 API、六向映射、分段、错误、取消 |
| src/main.tsx / model.ts | 界面、任务、历史、设置迁移 |
| src/pronunciation.ts | 本地粤拼与多音字 |
| src/ekho.ts / cantonese.ts | 单字与完整词句音频 |
| audio-assets/ → public/audio/ | 原始录音及授权的无损打包与自动还原 |
| backend/ / speech-service/ | 可选 FastAPI、Canto 与旧 Ollama 接入 |
| docs/verification-v0.5/ | 本次真实验证记录 |

```bash
npm test
npm run build
# 可选，需下载浏览器，占磁盘空间
npx playwright install chromium
npm run test:e2e
# 可选，真实联网，会消耗免费额度
npm run test:live-translation
```

标准浏览器回归会模拟翻译接口；真实联网测试单独运行，不在 CI 自动执行。构建和测试不会部署。

- [MyMemory API](https://mymemory.translated.net/doc/spec.php)
- [额度](https://mymemory.translated.net/doc/usagelimits.php)
- [条款及隐私](https://mymemory.translated.net/terms-and-conditions)

源码 MIT，音频和模型遵守各自授权。见 public/audio/ 和 public/THIRD_PARTY_NOTICES.txt。

## GitHub audio packaging

Original audio and license files are stored losslessly in `audio-assets/*.zip.part` with a SHA-256 manifest. `npm run dev` and `npm run build` restore them to `public/audio` using Python 3 and its standard library. Translation-page system playback needs no model download or speech backend. The Pages workflow publishes on pushes to `main`.

## iPhone PWA testing

Open the published HTTPS address in Safari, use Share → Add to Home Screen, then launch Vokawa from its icon. Select and test the phone’s Hong Kong Cantonese system voice in Settings. Test new translations, playback, favorites and offline access to cached recordings. New translations require internet; the Chromebook can be switched off.
