import { networkInterfaces } from 'node:os';

import { API_PREFIX, createApp } from './app';
import { Store } from './store';

const port = Number(process.env.PORT ?? 8080);
const store = new Store({
  accessTtlSec: Number(process.env.ACCESS_TTL_SEC ?? 3600),
  postDelayMs: Number(process.env.POST_DELAY_MS ?? 60_000),
});

createApp(store).listen(port, '0.0.0.0', () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i!.address}:${port}${API_PREFIX}`);
  console.log(`Mock Xerpium /xsm/v1 berjalan di port ${port}`);
  console.log(`  Emulator Android : http://10.0.2.2:${port}${API_PREFIX}`);
  for (const url of lan) console.log(`  HP di Wi-Fi sama : ${url}`);
  console.log(`  Akun uji         : mandor.panen | kerani.panen | mandor.rawat | kerani.transport | asisten | asisten2`);
  console.log(`  Password         : lihat TEST_PASSWORD di mock-server/src/seed.ts`);
});
