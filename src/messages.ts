import { getLocale } from "./i18n";
const messages: Record<string, string> = {
  已停止播放: "Playback stopped.",
  播放结束: "Playback finished.",
  "请输入要朗读的文字。": "Enter something to read aloud.",
  "此浏览器不支持系统朗读。": "This browser does not support system speech.",
  "没有可用的本地香港粤语声音。请在设置刷新声音并检查 iPhone 的语音下载；不会改用普通话。":
    "No local Hong Kong Cantonese voice is available. Download a Cantonese voice in system settings, then refresh the voice list.",
  "没有此语言的本地声音，请检查系统语音设置。":
    "No local voice is available for this language. Check your system speech settings.",
  "系统朗读超时，请缩短句子后重试。":
    "Speech playback timed out. Try a shorter sentence.",
  "播放未获浏览器允许或音频不可用，请再次点击播放。":
    "Playback was blocked or the audio is unavailable. Tap to try again.",
  "翻译服务返回格式异常，请重试。":
    "The translation service returned an invalid response. Please try again.",
  "翻译服务返回格式异常，请稍后重试。":
    "The translation service returned an invalid response. Please try again later.",
  "MyMemory 免费额度已用完或请求过于频繁，请稍后或明天再试；本应用不会自动转用付费服务。":
    "MyMemory has reached its free quota or request limit. Please try again later or tomorrow.",
  "翻译服务暂时无法处理这段文字，请缩短输入并稍后重试。":
    "The service could not translate this text. Try a shorter passage or try again later.",
  "翻译服务没有返回有效译文。":
    "The service did not return a valid translation.",
  "MyMemory 免费额度已用完，请稍后或明天再试。":
    "MyMemory has reached its free quota. Try again later or tomorrow.",
  "请输入文字。": "Enter some text.",
  "每次最多 3000 字符，请分段翻译。":
    "Use up to 3,000 characters per translation.",
  "请选择两个不同的语言。": "Choose two different languages.",
  "即时翻译需要联网；离线时可查看历史记录和已缓存的录音。":
    "Translation needs an internet connection. Saved phrases and cached recordings remain available offline.",
  "MyMemory 请求过于频繁或免费额度已用完，请稍后再试。":
    "MyMemory has reached its request limit or free quota. Try again later.",
  "翻译服务响应超时；没有把未完成的分段当成完整译文。请缩短输入后重试。":
    "Translation timed out. No partial translation has been shown as a complete result. Try a shorter passage.",
  "无法连接 MyMemory。请检查网络；服务或浏览器可能暂时阻止了连接。":
    "Could not connect to MyMemory. Check your network and try again.",
  "请填写 /api 或完整的 HTTP(S) 后端地址。":
    "Enter /api or a complete HTTP(S) backend URL.",
  "后端地址不能包含账号或密码。":
    "Do not include a username or password in the backend URL.",
  "HTTPS 页面不能连接 HTTP 后端；请使用 HTTPS 后端。":
    "An HTTPS page requires an HTTPS backend.",
  "后端未返回 JSON。请检查地址；GitHub Pages 不运行 Python。":
    "The backend did not return JSON. Check the URL; GitHub Pages cannot run Python.",
  后端请求失败: "The backend request failed.",
  "请填写有效的语音服务地址。": "Enter a valid speech service URL.",
  "HTTPS 网页需要 HTTPS 语音服务。":
    "An HTTPS page requires an HTTPS speech service.",
  "音频加载失败，请检查网络或离线缓存。":
    "Could not load the audio. Check your connection or offline cache.",
  "音频已就绪，请点击“播放已生成音频”再次播放。":
    "Audio is ready. Tap Replay to listen.",
  "请输入要播放的粤语文字。": "Enter Cantonese text to play.",
  "这段文字没有已下载的完整录音；新句子生成需要联网语音服务。":
    "There is no downloaded recording for this text. Generating new audio needs an online speech service.",
  "一次粤语合成最多 500 字，请分段输入。":
    "Speech generation accepts up to 500 characters at a time.",
  "正在生成完整粤语音频；文字与所选粤拼会发送到你配置的语音服务。":
    "Generating audio. Text and selected readings are sent to your configured speech service.",
  "语音服务不可用，请检查 Gradio 地址或额度。":
    "The speech service is unavailable. Check its URL or quota.",
  "语音服务未返回任务编号。": "The speech service did not return a job ID.",
  "无法获取语音任务结果。": "Could not retrieve the speech result.",
  "语音生成未完成；请检查服务、生成失败或额度。":
    "Audio generation did not complete. Check the service or quota.",
  "语音文件地址无效。": "The audio file URL is invalid.",
  "粤语合成失败，请检查语音后端。":
    "Cantonese generation failed. Check the speech backend.",
  "语音服务未返回音频。": "The speech service did not return audio.",
  "音频大小异常。": "The audio file size is invalid.",
  完整音频已生成: "Audio is ready.",
  "语音请求超时，请重试。": "The speech request timed out. Please try again.",
};
export function messageText(raw: string) {
  if (getLocale() === "zh") return raw;
  if (messages[raw]) return messages[raw];
  if (/^正在播放 /.test(raw)) return raw.replace("正在播放 ", "Playing ");
  if (/^播放结束 · Ekho /.test(raw))
    return raw.replace("播放结束", "Playback finished");
  if (/^Ekho 原始单音节 · /.test(raw))
    return raw.replace("Ekho 原始单音节", "Ekho syllable recording");
  if (/^完整录音 · /.test(raw))
    return raw.replace("完整录音", "Full recording");
  const missing = raw.match(/^没有 ([a-z]+[1-9]) 的原始录音/);
  if (missing) return `No exact recording is available for ${missing[1]}.`;
  const failed = raw.match(/^录音加载失败：([^。]+)/);
  if (failed)
    return `Could not load ${failed[1]}. Check the audio files and your connection.`;
  const play = raw.match(/^播放失败：([^。]+)/);
  if (play) return `Playback failed: ${play[1]}. Tap to try again.`;
  const http = raw.match(/HTTP (\d+)/);
  if (http)
    return `Translation service unavailable (HTTP ${http[1]}). Please try again later.`;
  return /\p{Script=Han}/u.test(raw)
    ? "The service could not complete this request. Check its settings and try again."
    : raw;
}
