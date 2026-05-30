import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flowmerce.app',
  appName: 'Flowmerce',
  webDir: 'out',           // dossier fallback, pas vraiment utilisé
  server: {
    url: 'https://flowmerce-web-app.vercel.app/',
    cleartext: false,
    androidScheme: 'https'
  }
};

export default config;