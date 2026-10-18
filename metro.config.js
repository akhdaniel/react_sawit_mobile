const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.sourceExts.push('sql');
// mock-server adalah proyek Node terpisah; jangan ikut dibundel.
config.resolver.blockList = [/mock-server\/.*/];

module.exports = config;
