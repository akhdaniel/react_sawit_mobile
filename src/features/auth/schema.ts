import { z } from 'zod';

import { t } from '../../i18n/id';
import { apiBaseUrlSchema } from '../../lib/config';

export const loginFormSchema = z.object({
  login: z.string().trim().min(1, t('auth.loginRequired')),
  password: z.string().min(1, t('auth.passwordRequired')),
  baseUrl: apiBaseUrlSchema,
});

export type LoginFormInput = z.input<typeof loginFormSchema>;
export type LoginFormValues = z.output<typeof loginFormSchema>;
