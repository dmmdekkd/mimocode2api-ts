import { VERSION } from './index';

const C = {
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  bold: '\x1b[1m',
  gray: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  white: '\x1b[97m',
  reset: '\x1b[0m',
};

const B = (color: string, text: string) => `${color}${C.bold}${text}${C.reset}`;

const LOGO_LINES = [
  '  ███╗   ███╗██╗ ██████╗ ██████╗  ██████╗ ██████╗  ██████╗',
  '  ████╗ ████║██║██╔════╝██╔═══██╗██╔═══██╗██╔══██╗██╔═══██╗',
  '  ██╔████╔██║██║██║     ██║   ██║██║   ██║██║  ██║██║   ██║',
  '  ██║╚██╔╝██║██║██║     ██║   ██║██║   ██║██║  ██║██║   ██║',
  '  ██║ ╚═╝ ██║██║╚██████╗╚██████╔╝╚██████╔╝██████╔╝╚██████╔╝',
  '  ╚═╝     ╚═╝╚═╝ ╚═════╝ ╚═════╝  ╚═════╝ ╚═════╝  ╚═════╝',
];
export function printBanner(host: string, port: number): void {
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
  const pad = '  ';
  const out = process.stdout;

  out.write('\n');
  // Logo
  for (let i = 0; i < LOGO_LINES.length; i++) {
    out.write(`${B(C.cyan, LOGO_LINES[i])}\n`);
  }
  // TypeScript badge
  out.write('\n');
  out.write(`${pad}${C.gray}OpenAI-compatible reverse proxy for Xiaomi MiMo AI${C.reset}\n`);
  out.write('\n');
  out.write(`${pad}${B(C.yellow, 'Version')}    ${B(C.green, VERSION)}\n`);
  out.write(`${pad}${B(C.yellow, 'Endpoint')}   ${B(C.cyan, url + '/v1')}\n`);
  out.write(`${pad}${B(C.yellow, 'Health')}     ${B(C.cyan, url + '/health')}\n`);
  out.write(`${pad}${B(C.yellow, 'Docs')}       ${B(C.cyan, 'https://github.com/nicepkg/mimocode2api')}\n`);
  out.write('\n');
}
