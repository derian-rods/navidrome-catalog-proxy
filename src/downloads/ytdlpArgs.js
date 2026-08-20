import { config } from '../config.js';

export function ytdlpAuthArgs() {
  const args = [];
  if (config.tools.ytdlpCookiesFile) {
    args.push('--cookies', config.tools.ytdlpCookiesFile);
  }
  if (config.tools.ytdlpJsRuntime) {
    args.push('--js-runtimes', config.tools.ytdlpJsRuntime);
  }
  return args;
}
