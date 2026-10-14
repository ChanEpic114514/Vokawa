# Vokawa 0.3：Ekho 单字录音

本版实际接入 4296 个原始 44.1 kHz PCM WAV（约 120 MB），保留六调编号 1–6。它们是音节文件，不是 4296 个汉字。音频无调速、改调或拼接。完整版上游原包另包含作者扩展的第 7 调，本版不使用。

用户报告首轮 28 项、第二轮 43 项均正确；第二轮在 Chrome 试听。用户进一步接受 Ekho 作为单字音频。没有把这份接受记录写成全库逐条审音证书。

## Chromebook 使用

解压交付包，将其中 Vokawa 目录作为项目。在 VS Code 打开此目录，终端必须处于含 package.json 的目录：

```bash
cd ~/Vokawa
npm ci
npm run dev
```

打开终端显示的地址，进入“粤语朗读”。输入单字或文字，在每个字下方选择候选粤拼，再点击该字的“单字录音”。例如输入“行”，选择 hong4，播放的是 hong4.wav。系统声音为空也能播放录音。遇到无对应录音的候选，按钮禁用，不会改用普通话或近似声调。

Ollama 与 Python 后端均不是单字录音功能的依赖；已删除 Ollama 的 Chromebook 无需重新安装。任意文本翻译仍保留原有后端依赖，示例翻译可直接运行。

## PWA 与离线

```bash
npm run build
npm run preview
```

开发模式不启用离线缓存。生产版的应用文件首次联网缓存；录音首次播放联网取得，额外请求完整 WAV 后按需缓存。等播放结束再测试断网。未播放、未缓存的音节在离线状态不能取得；浏览器回收或清除站点数据后需要重新下载。全套文件放在网站上，但不会自动占用手机 120 MB。

完整词语与长句仍使用“系统试听（未审核）”。该功能不受候选粤拼控制，准确性和自然度没有因本次集成而得到保证。单字按钮只播放单音节，不提供拼接词句的伪自然朗读。

## GitHub Pages / iPhone

项目已有 GitHub Actions Pages 工作流，可将完整源码和 public/audio/ekho 目录一起上传到自己的 Vokawa 仓库。切勿漏掉音频目录。GitHub 仓库 Settings → Pages → Source 选择 GitHub Actions，在 Actions 中选择 Deploy PWA to GitHub Pages → Run workflow，手动启动构建部署。网页支持仓库子路径。

也可以将本版 dist 目录上传到提供免费静态 HTTPS 托管的平台。iPhone Safari 打开最终 HTTPS 地址 → 分享 → 添加到主屏幕。首次联网打开并播放几个单字，随后飞行模式重开、测试那些已缓存的音节。

Chromebook 的开发服务器地址不适合作为长期 iPhone 地址；部署静态文件后单字音频无需 Chromebook 持续运行。不需要 Expo、Xcode 或付费 Apple 开发者账号。

当前工作区没有配置 Vokawa GitHub remote，因此本次仅完成本地提交及 Git 历史备份，没有声称已推送或部署到 GitHub。也未修改用户其他仓库。

## 验证结论

- 生产构建通过；18 项单元测试、9 项 Playwright Chromium 测试通过。
- 检查所选读音取得真实 RIFF WAV；子路径下完整音频缓存、断网重新打开页面与音频解码通过。
- 已修正“數一數／数一数”为 sou2 jat1 sou2；修正不是对任意多音字语境的全面保证。
- 停止、切换页面、候选选择变化会停止当前录音；旧播放结束事件不会覆盖新播放状态。
- 测试没有证明真实 iPhone Safari 播放或扬声器听感，也没有测试完整任意文本翻译模型。
- 旧版本保留于交付包的 Vokawa-before-Ekho.zip；Git 分支 backup/pre-ekho-single-character 也保留集成前状态。

## 授权与原始材料

录音 Copyright (C) 2008–2009 Cameron Wong，随包 GPLv2。公开目录保留完整 COPYING.txt、SOURCE.txt；WAV 本身是未修改的原始 PCM 源音频。引用及发行仍需遵守资源许可，不把整个应用自动描述为已完成授权审查。

来源与 SHA256：见 public/audio/ekho/SOURCE.txt。用户此前收到的完整官方原包仍可保留。
