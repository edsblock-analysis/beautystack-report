const fs = require('fs');
const { default: lighthouse } = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const { buildDashboard } = require('./build-live-dashboard.js');

const REPORTS_DIR = 'live-site-reports';

(async () => {
  const urls = fs.readFileSync('live-site-urls.txt', 'utf-8')
    .split('\n')
    .map(u => u.trim())
    .filter(u => /^https?:\/\//i.test(u));

  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR);
  }

  const chrome = await chromeLauncher.launch({
    chromeFlags: ['--headless']
  });

  for (const url of urls) {
    console.log(`Running Lighthouse for: ${url}`);

    try {
      const result = await lighthouse(url, {
        port: chrome.port,
        output: 'html'
      });

      const safeName = url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filePath = `${REPORTS_DIR}/${safeName}.html`;

      fs.writeFileSync(filePath, result.report);

      console.log(`Saved: ${filePath}`);
    } catch (err) {
      console.error(`Failed for ${url}: ${err.message}`);
    }
  }

  await chrome.kill();

  buildDashboard();
})();
