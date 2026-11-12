// Local verification compatibility for Windows native realpath EPERM.
// The fallback still resolves the existing path and respects filesystem access.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const nativeRealpath = fs.promises.realpath;
fs.promises.realpath = async function (path, options) {
  try { return await nativeRealpath(path, options); }
  catch (error) {
    if (process.platform !== 'win32' || error.code !== 'EPERM') throw error;
    return fs.realpathSync(path, options);
  }
};
syncBuiltinESMExports();
