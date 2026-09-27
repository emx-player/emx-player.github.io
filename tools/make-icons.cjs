// Renders icon.svg into the PNG icons the manifest and iOS ask for. Run: node tools/make-icons.cjs
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '..'), svg = fs.readFileSync(path.join(ROOT, 'icon.svg'), 'utf8');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(`<style>html,body{margin:0;background:#0a0e14}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
      await page.screenshot({ path: path.join(ROOT, name) });
      await page.close();
      console.log('wrote', name);
    }
  } finally { await browser.close(); }
})();
