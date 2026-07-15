// Copies the Chart.js UMD build into public/vendor so the frontend can load it
// locally without a CDN (important for offline / self-hosted deployments).
const fs = require('fs');
const path = require('path');

const candidates = [
  'node_modules/chart.js/dist/chart.umd.js',
  'node_modules/chart.js/dist/chart.umd.min.js',
];

const destDir = path.join(__dirname, '..', 'public', 'vendor');
const dest = path.join(destDir, 'chart.umd.js');

try {
  fs.mkdirSync(destDir, { recursive: true });
  const src = candidates
    .map((c) => path.join(__dirname, '..', c))
    .find((p) => fs.existsSync(p));

  if (!src) {
    console.warn('[copy-vendor] chart.js build not found — charts will be disabled until dependencies are installed.');
    process.exit(0);
  }
  fs.copyFileSync(src, dest);
  console.log('[copy-vendor] Chart.js copied to public/vendor/chart.umd.js');
} catch (err) {
  console.warn('[copy-vendor] skipped:', err.message);
}
