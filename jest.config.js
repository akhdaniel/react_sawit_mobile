module.exports = {
  preset: 'jest-expo',
  // watchman lokal bisa rusak (dylib OpenSSL hilang); crawler Node cukup untuk test.
  watchman: false,
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|drizzle-orm|react-native-svg)',
  ],
};
