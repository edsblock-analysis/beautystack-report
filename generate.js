const fs = require('fs');
const { default: lighthouse } = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const { buildDashboard } = require('./build-dashboard.js');

(async () => {
  const urls = fs.readFileSync('urls.txt', 'utf-8')
    .split('\n')
    .map(u => u.trim())
    .filter(Boolean);

  if (!fs.existsSync('reports')) {
    fs.mkdirSync('reports');
  }

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless']
  });

  for (const url of urls) {
    console.log(`Running Lighthouse for: ${url}`);

    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'html'
    });

    const safeName = url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filePath = `reports/${safeName}.html`;

    fs.writeFileSync(filePath, result.report);

    console.log(`Saved: ${filePath}`);
  }

  await chrome.kill();

  buildDashboard();
})();