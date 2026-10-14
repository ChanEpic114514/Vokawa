# 粤语语音研究与本次采用方案

核查与实际测试日期：2026-10-14。

## 结论

没有找到足够证据证明某方案同时达到：香港粤语单字全准确、语境消歧、可指定孤立多音字、自然长句、完全免费、iPhone Safari PWA 无服务器独立运行。

本次实际集成：**浏览器本地香港粤语 Web Speech 试听 + 本地 ToJyutping 字词读音参考**。这是目前能以低部署门槛交付的工程过渡方案，不是声学评测排名第一的模型，也不是“已经解决标准粤音”。核心的单字发音保证与强制多音字播放仍未完成。

## 比较与取舍

| 候选 | 免费 / 授权证据 | 浏览器与准确性证据 | 本次动作 / 决定 |
| --- | --- | --- | --- |
| 设备本地 Web Speech | 调用浏览器接口，无 API 账单、推理服务器；不分发系统模型或录音 | 可按 voice.lang 与 localService 筛选；无法以标准接口强制粤拼。Safari 公开缺陷中有下载声音不暴露的问题 | 已集成严格本地声音筛选、整句队列、中断、缺音拒绝；真机音质未验证 |
| to-jyutping 3.1.1（JS）/ ToJyutping 3.2.0（Python） | BSD-2-Clause，声明随包分发 | 提供词语匹配及候选排序，不是语音引擎，不理解全部歧义 | 实际运行前后端词典；发现“行長”错误并作有限修正；离线测试通过 |
| Sherpa-ONNX + 常见 Cantonese VITS 权重 | 推理框架授权不等于权重授权；相关 VITS 作者明确要求遵守模型各自许可 | Sherpa 有 WASM 部署路线，但不能由“支持 WASM”推导任意模型在 iPhone 可用。所查常见权重未获得充分清楚的分发授权与准确性证据 | 查阅项目/权重说明；未下载权重推理、未在 iPhone 测试；本次不分发或集成 |
| typangaa/canto-tts-nano | 模型卡标 Apache-2.0；训练数据未公开，注明版权原因 | 输入粤拼音素，ONNX，有 browser PoC manifest。模型卡自报 100 句、N=5、Qwen3-ASR judge：声调准确率 84.22%，CER 11.82%；不是独立母语人工验证 | 查阅模型卡及代码说明；未实际运行模型。指标不足以承诺单字正确，Safari 可用性也未获验证，暂不集成 |
| eSpeak NG（text2wav 0.0.14 WASM 构建） | eSpeak NG GPL-3.0-or-later，体积小、无在线服务 | 官方明确其共振峰合成比基于真人录音的合成器缺少自然、平滑感。支持 yue，但不是香港口音逐字人工认证资源 | 实际生成 3 个 WAV；仅证明推理可运行。没有母语者听审或手机试听，不以其替代自然长句引擎 |
| Forvo、需付费的粤语 API、未授权公共端点 | Forvo 方案此前已排除；付费 API 不符合约束，公共隐藏端点不能等同获许可且永久免费的服务 | 即使能拿到音频，也不证明词语上下文与长句质量 | 不抓取、不调用、不依赖免费试用额度 |

## 实际测试：本地粤拼

未修正时 JS 与 Python 两版均把 `銀行行長` 输出为 `ngan4 hong4 haang4 coeng4`。按银行职务的含义，`行長` 应为 `hong4 zoeng2`；词典来源见下方 CantoDict。

`shared/pronunciation-overrides.json` 只加入：

- 明确的完整词语 `銀行行長` / `银行行长`。
- 孤立查询 `行長` / `行长`，按银行职务解释。

不对所有句中的 `行長` 无条件替换，避免把“行長路”的行走含义改成银行职务；对应负例已测试。这个修正无法推导“所有语境下多音字都正确”。候选包含异读/其他变体，不能把每个候选都标为香港标准读音。

实际通过用例含銀行、行路、行長、音樂、快樂、重要及孤立行的多候选。测试检查文本结果，不检查音频。

## 实际测试：eSpeak 音频生成

环境：Linux x86_64 / Node 24.19.0，`text2wav@0.0.14`，参数 `{voice:'yue'}`。使用包内 eSpeak NG WASM。本机 Node 对文件路径的 streaming compile 报错后，包自动回退到 ArrayBuffer，最终正常输出 WAV。未修改合成器源码，未将其分发为应用引擎。

| 输入 | 生成文件 | 大小 | 采样率 / 声道 | 时长 |
| --- | --- | ---: | --- | ---: |
| 行 | `audio-probes/espeak-single.wav` | 24,970 字节 | 22,050 Hz / 单声道 | 0.565 秒 |
| 銀行行長 | `audio-probes/espeak-word.wav` | 55,658 字节 | 22,050 Hz / 单声道 | 1.261 秒 |
| 銀行行長今日會開會，開完會之後，我哋一齊去食飯。 | `audio-probes/espeak-long.wav` | 231,310 字节 | 22,050 Hz / 单声道 | 5.244 秒 |

这三个文件仅为技术比较样本，不是审核通过的标准音；不被 PWA 加载。没有把运行成功或 WAV 长度当作听感评分。生成文本由本项目提供，不采样或抓取母语者录音。探测包本身不包含在交付代码中。

可在单独临时目录复现（不要改 Vokawa 的依赖）：

```bash
npm init -y
npm install text2wav@0.0.14
node - <<'JS'
const tts = require('text2wav');
const fs = require('node:fs');
(async () => fs.writeFileSync('probe.wav', await tts('銀行行長', {voice:'yue'})))();
JS
```

## 已集成播放行为

1. 只接受浏览器报告为本地服务、语言为 `zh-HK`、`zh-Hant-HK`、`yue`、`yue-HK`、`yue-Hant-HK` 的声音。拒绝 `zh-CN`、`zh-TW`、泛称 `zh` 和远程声音，不按声音名称猜粤语。
2. 监听 voiceschanged，也允许用户主动刷新。首轮尚无声音时提示重新检查，不在后台自动开始播放。
3. 用户点击后开始合成。以完整句子为单元、保持标点和文本顺序，不拼接单字音频、不截断长输入。无标点长句保留为一个 utterance，浏览器如失败会报告错误，不默默丢字。
4. 保留 utterance 引用，串行等待 onend；新播放、停止、隐藏页面会撤销旧队列。自动播放默认关闭。
5. 显示未审核状态。**即使屏幕粤拼修正了，实际声音仍由系统自行决定，可能错读。**
6. 不缓存或导出系统生成音频，不分发系统模型。localService 是浏览器提供的信息，不代替 iPhone 飞行模式的实测。

当前可验证的工程优点是无需语音服务器、无需付费 API、无普通话自动兜底。不能据此承诺每台 iPhone 有可用声音或音质达到目标。

## 六项要求的当前状态

| 要求 | 状态 |
| --- | --- |
| 香港粤语单字声母、韵母、声调正确 | **未达保证**，需逐音节和常用字的母语审核资源/可信声学模型 |
| 上下文多音字 + 孤立选音 | 词典候选及有限文本修正已实现；**所选粤拼无法强制系统音频，未完整满足** |
| 自然完整长句 | 已实现整句播放流程；**自然度与逐字完整性尚未做真实 iPhone 听审** |
| 免费 | 已集成语音与词典无付费依赖；依赖用户设备已有可用本地声音 |
| iPhone PWA、无需电脑持续运行 | 架构支持；根路径和子路径离线缓存实测通过；**iPhone 真机尚待验证**；通用翻译仍需要原后端 |
| 隐私与合法授权 | 词典随附许可证，系统声音不分发；无抓取录音；识别每次明确同意、限时、离开即中止。浏览器识别可能联网 |

## 证据来源（均为本次核查）

- Web Speech localService 语义：https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService
- SpeechSynthesisUtterance 的公开控制属性：https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance
- Safari 声音暴露缺陷（报告不代表所有 iOS 版本均受影响）：https://bugs.webkit.org/show_bug.cgi?id=290497
- ToJyutping JS 项目、候选排序及授权：https://github.com/CanCLID/to-jyutping
- 银行职务读音核对（只引用语言事实，没有复制词典库或音频）：https://cantonese.sheik.co.uk/dictionary/characters/187/?full=true
- Sherpa 的 VITS 清单：https://k2-fsa.github.io/sherpa/onnx/tts/pretrained_models/vits.html
- VITS 项目对模型权利的说明：https://github.com/Keith-Hon/vits-cantonese
- 所查模型权重仓库：https://huggingface.co/csukuangfj/vits-cantonese-hf-xiaomaiiwn
- Canto-TTS 项目：https://github.com/typangaa/canto-tts
- Canto-TTS 模型卡、指标、授权：https://huggingface.co/typangaa/canto-tts-nano
- eSpeak NG 原理、自然度限制与授权：https://github.com/espeak-ng/espeak-ng
- eSpeak NG 支持 yue：https://github.com/espeak-ng/espeak-ng/blob/master/docs/languages.md
- 实测封装包：https://www.npmjs.com/package/text2wav/v/0.0.14
