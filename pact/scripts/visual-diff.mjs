#!/usr/bin/env node
// visual-diff: 渲染页面→截图→对设计基准图做 pixelmatch，输出不匹配像素占比。
// 用法: node visual-diff.mjs <页面URL> <基准图.png> [--threshold=0.02] [--out=diff.png] [--width=1440]
// 依赖: playwright, pixelmatch, pngjs  (npx playwright install chromium 一次)
// 退出码 0 = 达标；1 = 超阈值；2 = 运行/依赖错误。
import fs from 'node:fs';

function arg(name, def) {
  const m = process.argv.find((a) => a.startsWith(`--${name}=`));
  return m ? m.split('=').slice(1).join('=') : def;
}

const url = process.argv[2];
const baseline = process.argv[3];
if (!url || !baseline) {
  console.error('用法: node visual-diff.mjs <页面URL> <基准图.png> [--threshold=0.02]');
  process.exit(2);
}
const threshold = parseFloat(arg('threshold', '0.02'));
const out = arg('out', 'diff.png');
const width = parseInt(arg('width', '1440'), 10);

let chromium, pixelmatch, PNG;
try {
  ({ chromium } = await import('playwright'));
  pixelmatch = (await import('pixelmatch')).default;
  ({ PNG } = await import('pngjs'));
} catch (e) {
  console.error('ERROR 缺少依赖，请先: npm i -D playwright pixelmatch pngjs && npx playwright install chromium');
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle' });
const shotBuf = await page.screenshot({ fullPage: true });
await browser.close();

const actual = PNG.sync.read(shotBuf);
const expected = PNG.sync.read(fs.readFileSync(baseline));

const w = Math.min(actual.width, expected.width);
const h = Math.min(actual.height, expected.height);
const diff = new PNG({ width: w, height: h });

// 尺寸不一致时按左上角裁剪比较，并提示
if (actual.width !== expected.width || actual.height !== expected.height) {
  console.error(`WARN 尺寸不一致 actual=${actual.width}x${actual.height} baseline=${expected.width}x${expected.height}，按 ${w}x${h} 裁剪比较`);
}

const crop = (img) => {
  const o = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const s = (img.width * y + x) << 2;
      const d = (w * y + x) << 2;
      o.data[d] = img.data[s];
      o.data[d + 1] = img.data[s + 1];
      o.data[d + 2] = img.data[s + 2];
      o.data[d + 3] = img.data[s + 3];
    }
  return o;
};

const a = crop(actual), b = crop(expected);
const mismatched = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.1 });
fs.writeFileSync(out, PNG.sync.write(diff));

const ratio = mismatched / (w * h);
const pct = (ratio * 100).toFixed(2);
if (ratio <= threshold) {
  console.log(`PASS visual-diff: ${pct}% 不匹配 ≤ ${(threshold * 100).toFixed(2)}%  (diff→${out})`);
  process.exit(0);
} else {
  console.log(`FAIL visual-diff: ${pct}% 不匹配 > ${(threshold * 100).toFixed(2)}%  (diff→${out})`);
  process.exit(1);
}
