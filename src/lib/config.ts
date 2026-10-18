import Constants from 'expo-constants';
import { z } from 'zod';

export const apiBaseUrlSchema = z
  .url({ protocol: /^https?$/, message: 'URL server tidak valid' })
  .transform((u) => u.replace(/\/+$/, ''));

const extraSchema = z.object({
  apiBaseUrl: apiBaseUrlSchema.default('http://10.0.2.2:8080/xsm/v1'),
  /** Offset zona waktu estate untuk tanggal kerja (WIB = 420). */
  estateUtcOffsetMinutes: z.int().min(-720).max(840).default(420),
  /** Kunci aplikasi (minta PIN) setelah di latar belakang selama N menit. */
  autoLockMinutes: z.number().positive().default(5),
});

export type AppConfig = z.infer<typeof extraSchema>;

export const appConfig: AppConfig = extraSchema.parse(Constants.expoConfig?.extra ?? {});
