// Names of device settings and the official Node distribution for each OS.
export const deviceName = (platform = process.platform) =>
  ({darwin: 'macos', win32: 'windows', linux: 'linux'})[platform];
export const nodeRuntimeName = (version, platform = process.platform, arch = process.arch) =>
  `node-v${version}-${platform === 'win32' ? 'win' : platform}-${arch}`;
