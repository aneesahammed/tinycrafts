import baseConfig from './playwright.config';

export default {
  ...baseConfig,
  testDir: './tests/performance',
};
