import { config } from '../config.js';

export function ytdlpAuthArgs() {
  const args = [];
  if (config.tools.ytdlpCookiesFile) {
    args.push('--cookies', config.tools.ytdlpCookiesFile, '--no-cookies-update');
  }
  if (config.tools.ytdlpJsRuntime) {
    args.push('--js-runtimes', config.tools.ytdlpJsRuntime);
  }
  return args;
}
