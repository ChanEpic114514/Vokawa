# Vokawa 第 5 版：更新、运行与测试

版本 0.5.0。本次不部署；先在 Chromebook 完成测试。

## 1. 本版变化与边界

默认使用 MyMemory 官方公共 API，浏览器直接联网翻译你输入的字、词、句子。英语、普通话、香港粤语六向互译，使用 en-GB、zh-CN、yue-HK。无需 API 密钥、Python、Ollama、本地翻译模型或自建翻译服务器。

每次输入最多 3000 字符，按段落、标点与每次 500 UTF-8 字节的接口上限分段，全部成功才显示完整结果；中途失败不保存残缺译文。可以取消；修改文字、切换语言或页面会阻止旧请求覆盖新内容。对话逐条翻译，默认不发送历史上下文；需要消歧时请在当前文字中写清楚语境。

**任意文本指不依赖预设例句，并不保证每个词义正确。** 机器翻译不是列出全部义项的字典；生僻字、孤立字词、专名、多义词可能翻译错误。长文本分段也可能损失上下文。实际测试曾出现“猫”→“The cats”，增加了复数和定冠词，需要使用者核对。

原有 Ekho 单字、完整词语录音、Canto-TTS 句子接入、粤拼、多音字、历史收藏与 PWA 保留。**任意新文本能翻译，不等于任意新句子无需服务即可生成语音。** 新词句音频仍需第 4 版的语音服务；单字与内置录音可直接播放。

## 2. 免费额度与隐私

2026-10-14 核对 MyMemory 官方说明：匿名每天 5000 字符、单请求最多 500 UTF-8 字节。实际额度和服务可用性由供应商决定；共享网络出口可能受共同限制。到限额后报错停止，不自动收费、不绕过限制。不需要填写邮箱或密钥。

点击“翻译”后，当前文字会发送至 MyMemory；供应商可能长期保留提交的文字，且可能使用合作翻译服务。不要输入敏感信息。应用只调用查询接口 /get，不调用贡献接口 /set；这不等于供应商不记录查询。打字过程中不会自动上传。历史默认只在当前浏览器保存，设置可关闭保存新记录。

- API：https://mymemory.translated.net/doc/spec.php
- 额度：https://mymemory.translated.net/doc/usagelimits.php
- 条款与隐私：https://mymemory.translated.net/terms-and-conditions

## 3. 保留旧版，再解压

在旧版 VS Code 终端按 Ctrl+C 停止服务。保留旧目录 ~/Vokawa，不覆盖它。

下载 Vokawa-Full-v0.5.zip，用 Chromebook“文件”将它复制到“Linux 文件”，然后执行：

```bash
cd ~
mkdir -p Vokawa-v05
unzip Vokawa-Full-v0.5.zip -d Vokawa-v05
cd ~/Vokawa-v05/Vokawa
pwd
ls package.json package-lock.json
```

最后应列出两个文件。若找不到 zip，在“Linux 文件”确认实际文件名。若 unzip 不存在，执行 sudo apt-get install unzip。也可图形化解压，再用 VS Code 打开内部含 package.json 的 Vokawa 文件夹。

完整包约 115 MB，主要为录音。没有附带 node_modules 或模型权重；安装依赖还需额外空间。可用 df -h ~ 检查剩余磁盘。无需重新安装 Ollama。

## 4. 启动并确认版本

在上述项目目录运行：

```bash
node --version
npm ci
npm run dev -- --port 5173 --strictPort
```

建议 Node.js 24 LTS；若现有 Node 太旧并出现引擎版本错误，先提供 node --version 的结果。npm ci 已在本次交付环境验证。

Chrome 打开 **http://localhost:5173**，保持终端运行。确认右上角显示 **PWA 0.5**、模式显示 **即时翻译 · MyMemory**。

在“设置”中确认“示例模式”关闭，“翻译服务”为“MyMemory 免费联网翻译（默认）”。令牌可留空，不需要点击“测试自备后端连接”。旧版示例模式会自动迁移，保留同一地址下的历史、收藏和语音设置。

注意：localhost 与 127.0.0.1，以及 5173 与 4173 是不同存储地址。历史不会自动在这些地址间迁移。不要清除网站数据，否则历史也会删除。

## 5. 手动测试

输入自己的内容，点击翻译，不只测试下列表格。

| 方向 | 示例 | 核对 |
| --- | --- | --- |
| 普通话→粤语 | 吃；钱包；我明天不去公司，因为我要陪妈妈去医院。 | 字、词、句均返回；否定与时间保留 |
| 粤语→普通话 | 佢；鎖匙；我今晚唔返屋企食飯，你哋唔使等我。 | 语义、对象、否定正确 |
| 英语→粤语 | I forgot my umbrella on the bus. | 自己的新句可翻译 |
| 粤语→英语 | 如果聽朝落雨，我哋就搭地鐵去博物館。 | 条件、时间、地点保留 |
| 英语→普通话 | The meeting starts at 9:30, not 8:30. | 数字与否定准确 |
| 普通话→英语 | 我已经买了三张票，但是还没有收到确认邮件。 | 三张、已经、还没有准确 |

再检查：

1. 输入 200～300 个中文字，观察分段进度及完整译文，检查是否遗漏。
2. 点击翻译后取消或修改输入，旧结果不得覆盖新内容。
3. 收藏译文，刷新后在“记录”里搜索。
4. 断网后提交新内容，应提示需要联网，不会返回假译文。
5. 在“粤语朗读”里输入“行”，选择不同读音播放，再播放内置“如果”。

文字翻译成功而新句子播放失败，属于语音服务配置问题；不用安装 Ollama 修复。查看 docs/WORD_SENTENCE_SETUP_ZH.md 的语音说明。

## 6. 构建和自动测试

先 Ctrl+C 停止开发服务器，再运行：

```bash
npm test
npm run build
npm run preview -- --port 4173 --strictPort
```

打开 **http://localhost:4173**。在设置中等待“离线应用缓存已就绪”，播放需要的内置录音，再断网刷新。应用、词典、该地址保存的历史及已缓存录音可用；新翻译需要联网。开发模式 5173 不启用离线缓存。

可选浏览器测试会额外下载 Chromium，占用磁盘；可先用手动测试：

```bash
# 先停止占用 4173 的 preview
npx playwright install chromium
npm run test:e2e
```

上述回归测试用模拟翻译服务检查错误与界面行为。真实联网测试单独运行，会消耗 MyMemory 免费额度：

```bash
npm run test:live-translation
```

实际输入、返回译文和错误记录在 test-results/live-translation.json。真实联网测试不在 CI 自动运行，也不代表全部译文正确。出现额度或网络限制后，不要反复大量重跑。

Python 后端不必为本轮文字翻译测试安装。若你要修改后端，才另外执行：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements-dev.txt
python -m pytest tests/test_backend.py tests/test_cantonese_speech.py tests/test_speech_api.py -q
```

## 7. 排错与回退

- ENOENT / package.json 不存在：进入 ~/Vokawa-v05/Vokawa，再运行 npm，不要在 ~ 直接运行。
- 5173 被占用：停止旧版终端，不必杀系统进程。
- 仍只能翻译五句：确认页面是 0.5，关闭示例模式；关掉所有旧版页面后重开。
- 无法连接 MyMemory：检查网络，稍后重试；无需启动 Python。网络可能屏蔽此服务。
- 免费额度用完：等待供应商恢复额度，不会自动收费。
- 某个词译错：放进完整句子重试，记录原文、方向和译文供后续修正。
- 需要回退：停止新版，返回保留的 ~/Vokawa 启动旧版。

本次未部署、未向 GitHub 推送。构建和测试不会发布网站；Pages 工作流仍须手动触发。完成本地验收后，再安排部署及 iPhone Safari 真机测试。
