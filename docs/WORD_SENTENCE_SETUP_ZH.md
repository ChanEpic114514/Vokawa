# Vokawa 0.4：单字、完整词语与句子

本版实际修改了 React + TypeScript + Vite + PWA、FastAPI 代码，保留既有功能。

## 播放路径

1. 粤语单字：Ekho 原始录音，可选多音字读音。
2. 已收录词语：完整真人录音或 Canto 整词录音，匹配文字与粤拼；不拼接单字。
3. 已收录句子：网站提供完整 Canto 音频，取到文件后可离线缓存。
4. 任意新词句：发送文字与所选粤拼到 Canto 服务，返回完整 WAV；不自动改用普通话或系统声音。

用户已确认 10 条真人词语正确，接受句子的节奏差异、生硬及极小概率漏字。本版不将这份接受记录称为任意词句零错误。

已移除默认读错“行長”“數一數”及含错误行长读音的句子缓存，采用指定粤拼的对照录音。补充五组内置翻译示例的 Canto 音频，便于无后端试用。新生成的五条示例与改进后的输出没有再次人工试听。

## 改进与边界

- 使用 Vokawa 上下文词典和用户选择的粤拼，绕过 Canto 已发现错误的自动选音。
- 已处理“數一數／数一数”、银行行长和“開完會”；任意语境仍可能有歧义。
- 新合成使用 full 采样、较低停止决策温度、异常时长检查及最多两次尝试。时长只能检查明显截断或异常重复，不能逐字检测漏字。
- 约 80 字以上优先按已有标点分段，保留全部内容，合成后加短停顿。不是单字拼接；跨分段语调不保证等同于单次整篇生成。
- 一次新合成最多 500 字。变速保持音高，不保证修复原始韵律。
- 动态音频只保留在页面内存，不自动离线保存。静态音频按需缓存；清除站点数据后需重新取得。
- Safari 若阻止生成后的自动播放，可主动点击“播放已生成音频”。

## Chromebook：先试静态功能

解压完整代码包，先保留原文件夹，打开新版含 package.json 的 Vokawa 目录。已有 0.3 代码包也是升级前备份。

如果新版目录放在 ~/Vokawa：

~~~bash
cd ~/Vokawa
npm ci
npm run dev
~~~

若解压在另一处，在 VS Code 打开新版目录再开终端。不要在用户主目录执行 npm。

打开终端地址 → 粤语朗读 → 内置完整录音 → 选择词句 → 播放粤语音频。

静态功能不需要 Python、Ollama 或模型下载；无需在空间紧张的 Chromebook 重新安装 Ollama。

~~~bash
npm run build
npm run preview
~~~

开发模式没有 PWA 离线缓存；生产预览首次联网并播放相应录音后再断网。

## 任意新句子：语音服务

两种通信方式均已实际运行测试：

### FastAPI

在有足够资源的 Linux 电脑/服务器上：

~~~bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements-speech.txt
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8765
~~~

首次下载模型约 764 MB，研究进程峰值超过 2 GB，环境依赖另占空间。此步骤给服务机器使用，不要求当前 Chromebook 安装。

设置 → 粤语词句合成 → FastAPI，开发地址 /api。使用后端启动时打印的连接令牌；只存在页面内存。可设置 VOKAWA_TTS_MODEL_DIR 复用已有模型；VOKAWA_TTS_THREADS 默认 2。

朗读不需要 Ollama；/health 与通用翻译仍沿用原翻译服务，没有新增免费的通用翻译托管。

### Gradio / Hugging Face

speech-service 提供部署代码。另附独立 Vokawa-Speech-Service.zip，已按 Space 根目录层级整理同一引擎。

在有资源的机器本地启动：

~~~bash
pip install -r speech-service/requirements.txt
python speech-service/app.py
~~~

Vokawa 设置类型 Gradio，填写完整服务地址。远程填写 https://你的空间.hf.space，不能填 /spaces/ 展示页。不会向 Gradio 发送 FastAPI 令牌。

免费部署尚未完成：

- 普通 CPU Gradio/Docker Space 目前新建要求付费计划，不属于完全免费路线。
- 官方允许已验证邮箱、注册超过 30 天的免费个人账号使用最多两个 ZeroGPU Space。本版 CPU ONNX 在该硬件选项尚未实测，不能声称免费托管已成功。
- 本次未登录、创建账号、申请付费硬件或发布外部服务。还需实际可用的免费目标环境，再验证部署。
- 服务收到主动输入的文字和粤拼；临时音频与 Gradio 副本安排约 10 分钟清理。不录音、不克隆声音。停止会取消页面请求/播放；服务端已经开始的计算可能继续完成。

## iPhone PWA

将完整源码放到自己的 Vokawa GitHub 仓库，Pages 选择 GitHub Actions，再手动运行 Deploy PWA to GitHub Pages。或者将构建的 dist 上传到免费静态 HTTPS 托管。

Safari 打开最终 HTTPS 地址 → 分享 → 添加到主屏幕。单字与内置词句无需 Chromebook 在线；任意新句子另需在线语音服务。

真实 iPhone 的安装、首次播放、飞行模式重开与动态音频重播仍待实机检查。

## 验证记录

- 构建通过，21 前端单元测试、29 Python 测试、11 Chromium E2E 通过。
- 实际改进引擎生成银行行长句、數一數、长句，音频分别 4.72、1.04、8.95 秒。这证明运行成功，不是改善听感的人工结论。
- 真实 Chromium → 本地 Gradio 5.49.1 → 实际 Canto 模型 → WAV → 解码通过；生成“行長想食飯。”，手选 hong4 / zoeng2。没有向 Gradio 发送令牌。
- 词句在 /Vokawa/ 子路径缓存、离线重新打开通过。
- 新合成失败会报错；取消和切页使旧结果失效。
- Git 分支 backup/pre-word-sentence 保留升级前状态；另有源码备份。没有 Vokawa GitHub remote，未推送或部署。

资源版权、录音者、来源与封装修正说明在 public/audio 及 THIRD_PARTY_NOTICES.txt；未把资源许可换成应用 MIT 许可。
