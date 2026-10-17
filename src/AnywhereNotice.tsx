import { t } from "./i18n";
import type { SharedContent, ShareError } from "./anywhere";
const errors: Record<ShareError, [string, string]> = {
  length: ["分享文字超过 3,000 个字符，请选取较短的段落重新分享。内容没有被截断或发送。", "Shared text exceeds 3,000 characters. Share a shorter passage. Nothing was truncated or sent."],
  encoding: ["分享文字的 URL 编码无效，请检查快捷指令中的 URL 编码操作。", "Invalid URL encoding. Check the URL Encode action in your shortcut."],
  empty: ["没有收到文字，请选中文字后重新分享。", "No text received. Select text and share again."],
  format: ["分享链接格式不正确，请按安装教程检查网址前缀。", "Invalid share link. Check the URL prefix in the setup guide."],
  control: ["文字包含不支持的控制字符，请复制为纯文本后重试。", "The text contains unsupported control characters. Try plain text."],
  cleanup: ["无法清理分享网址，已阻止导入。请关闭此页面并重新分享。", "Could not clear the share URL. Import was blocked. Close this page and share again."],
};
export function AnywhereNotice({ value, discard }: { value: SharedContent; discard: () => void }) {
  return <section className="anywhere-notice" aria-label="Vokawa Anywhere" role="status">
    <div><strong>Vokawa Anywhere</strong><p>{value.kind === "ready"
      ? t("文字已接收，尚未发送。请检查原文、选择语言，再点击「确认并翻译」。", "Text received, not sent. Review the text and languages, then select Confirm and translate.")
      : t(...errors[value.error])}</p></div>
    <button className="text-button" onClick={discard}>{value.kind === "ready" ? t("放弃分享", "Discard shared text") : t("关闭提示", "Dismiss")}</button>
  </section>;
}
