/**
 * @deprecated Use fix-locality-misclassified-as-city.js --locality=Adibatla instead.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const script = path.join(__dirname, 'fix-locality-misclassified-as-city.js');
const args = ['--locality=Adibatla', ...process.argv.slice(2)];
const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);