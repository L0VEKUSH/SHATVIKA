const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;
const HTML_TAG_PATTERN = /<\/?[A-Za-z][^>]*>/g;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const WHITESPACE_PATTERN = /\s+/gu;

export function toPlainText(input: string): string {
  return input
    .replace(HTML_COMMENT_PATTERN, '')
    .replace(HTML_TAG_PATTERN, '')
    .replace(CONTROL_CHARACTER_PATTERN, '')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim();
}
