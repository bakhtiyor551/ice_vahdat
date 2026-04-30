import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ice.vahdat',
  appName: 'Ice Kassa',
  webDir: 'dist',
  // По умолчанию Android грузит WebView с https://localhost — тогда fetch на http://LAN:3847
  // блокируется как mixed content. http-схема origin позволяет HTTP API в локальной сети.
  server: {
    androidScheme: 'http',
  },
};

export default config;
