# Vokawa 0.2 创建与使用教程

## 1. Chromebook + VS Code

1. 启用 ChromeOS 的 Linux 开发环境，安装 Linux 版 VS Code。
2. 通过 Node.js 官方发行方式安装 Node.js 24 LTS。终端执行 `node --version` 与 `npm --version` 确认。Python 建议 3.12。
3. 解压代码 ZIP，VS Code 选择打开其中的 `Vokawa` 文件夹。以下命令都在此文件夹执行。

```bash
npm ci
npm run dev
```

打开 `http://localhost:5173`。不要双击 `index.html`；TSX 需要 Vite 编译。没有后端也能使用内置示例、粤拼、历史与设备支持的本地朗读。

“翻译”默认英文→粤语。点击翻译会显示“呢個幾多錢？”。打开“粤语朗读”，可输入任意单字、词语或长句。该页面不负责把普通话改写为粤语；它直接朗读所输入文字。

## 2. 可选真实翻译后端

按 https://ollama.com/download/linux 安装 Ollama，并根据 https://docs.ollama.com/quickstart 配置本地服务。需足够内存、磁盘及首轮模型下载流量。

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
ollama pull qwen3:8b
python -m uvicorn backend.server:app --host 127.0.0.1 --port 8765 --no-access-log
```

如果 Ollama 服务尚未启动，在另一终端运行 `ollama serve`。后端终端会打印连接令牌。不要把令牌提交到 GitHub。

在网页“设置”中：后端地址 `/api` → 粘贴令牌 → 测试连接 → 关闭示例模式。真实请求发送给你配置的后端；后端不记录文本请求体。`npm run dev` 配有代理；生产预览/静态托管不提供此代理，需填完整地址并配置 CORS。

低配置电脑可在启动后端前执行 `export VOKAWA_MODEL=qwen3:4b` 并 `ollama pull qwen3:4b`。这不是流畅运行或翻译准确性的保证。

## 3. 本地验证生产 PWA

```bash
npm test
npm run build
npm run preview
```

打开 `http://localhost:4173`。在“设置”等待“离线应用缓存已就绪”，刷新一次，再断网刷新。界面、五组示例和粤拼应仍可运行；语音取决于本机声音是否已下载并由浏览器提供。`npm run dev` 刻意不注册 Service Worker。

若要运行完整测试：

```bash
npx playwright install chromium
npm run test:e2e
pip install -r backend/requirements-dev.txt
python -m pytest tests/test_backend.py -q
```

注意：Chromium 测试不能替代 iPhone Safari 真机测试。

## 4. 上传 GitHub

本次连接仅能访问另一个非 Vokawa 仓库，未向远程写入。已提供本地 Git 历史备份 `Vokawa-history.bundle`，含原版标签/分支和迁移提交；它与源代码 ZIP 内容对应。

若想保留完整版本历史，将 bundle 与代码 ZIP 放在同一上级目录，从 bundle 克隆：

```bash
git clone Vokawa-history.bundle Vokawa-git
cd Vokawa-git
git remote remove origin
```

在 GitHub 网页新建空白 **Vokawa** 仓库（不要勾选生成 README）。免费 GitHub Pages 可用公共仓库。然后使用你的仓库 URL：

```bash
git remote add origin https://github.com/YOUR_USERNAME/Vokawa.git
git push -u origin main
git push origin backup/v1 --tags
```

GitHub 密码不用于 Git 推送；使用你已配置的 SSH 或凭证管理器。不要把访问令牌写入项目、远程 URL、README 或发给聊天。

也可直接从 ZIP 新建仓库（不保留 bundle 内逐次提交，原版 ZIP 备份仍在）：

```bash
git init -b main
git add .
git commit -m "Migrate Vokawa to React PWA and FastAPI"
git remote add origin https://github.com/YOUR_USERNAME/Vokawa.git
git push -u origin main
```

不要把本次代码推入其他项目仓库。若你已经有 Vokawa 仓库，应先克隆检查现有改动，再迁移，避免强制覆盖。

## 5. 免费 HTTPS 托管与 iPhone 安装

1. Vokawa 仓库 Settings → Pages → Source 选择 GitHub Actions。
2. Actions → “Deploy PWA to GitHub Pages” → Run workflow。
3. 成功后使用该次部署输出的 URL；典型地址为 `https://YOUR_USERNAME.github.io/Vokawa/`。本次尚未执行远程部署，示例地址不是已经上线的网站。
4. iPhone Safari 打开该 **HTTPS** 地址，进入“设置”等离线缓存就绪。
5. 分享 → 添加到主屏幕 → 添加。以后从主屏幕图标打开。
6. 在“设置”刷新声音，选择可用的本地香港粤语声音并试听。若没有声音，检查 iPhone 辅助功能中的朗读/声音设置，下载香港粤语声音后重新打开应用。设置名称随 iOS 版本变化；下载的声音未必会向 Safari 暴露，不能保证此操作一定解决问题。
7. 开飞行模式，从主屏幕重开，实际测试粤语播放。若失败，本机不满足离线语音条件，不应误认为已经安装完整语音库。

不需要 Apple 开发者账号、签名、Xcode、App Store 审核或 Chromebook 持续开机来运行静态 PWA 和设备本地语音。免费方案的前提是 GitHub Pages 账户与仓库符合官方条件。

## 6. 关于电脑关机后的通用翻译

**本次没有解决独立离线通用翻译。** 原版 Ollama 翻译仍需要运行中的计算设备；本版只把语音、词典及前端移到手机。GitHub Pages 不能托管 Python/Ollama。

如果要让 iPhone 访问真实后端，必须有你自己的可用 HTTPS 后端；`/api` 在 Pages 上不会自动工作。在后端设置 `VOKAWA_ALLOWED_ORIGINS=https://YOUR_USERNAME.github.io`，在应用设置填后端 HTTPS 地址及令牌。手机上的 `127.0.0.1` 指手机本身，不能指向 Chromebook；HTTPS 页面也不能调用普通 HTTP 电脑地址。

本次不要求租付费服务器，也没有将不可靠公共推理服务或试用额度当作永久免费方案。关机后可做的事情与仍需要后端的事情在应用中分别说明。

## 7. 更新、数据和原版回退

- 修改后执行 `npm run build`，提交并再次手动执行 Pages workflow。关闭所有 Vokawa 旧页面/主屏幕窗口，再打开可启用新 Service Worker。
- 历史保存在当前网站源的 localStorage；Safari 和主屏幕应用的数据容器、站点地址变化可能影响可见性。系统清理网站数据会丢失历史。此版本没有跨设备同步。
- 同源旧 Web 预览的 `vokawa-preview` 数据会尝试读取；原生 iOS 沙盒历史不会自动搬到 PWA。
- 原版完整备份：`backups/Vokawa-v1-original.zip`；在 `backups` 目录执行 `sha256sum -c SHA256SUMS` 可核验。原版 Swift 文件仅在压缩备份与 `backup/v1` Git 分支内，当前应用不编译它们。

官方参考：
- https://vite.dev/guide/
- https://fastapi.tiangolo.com/tutorial/cors/
- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
