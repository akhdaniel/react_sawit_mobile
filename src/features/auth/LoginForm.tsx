import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { TextField, type TextInputRef } from '@/components/TextField';
import { Txt } from '@/components/Txt';
import { t } from '@/i18n/id';
import { colors, spacing, touch } from '@/theme';

import { loginFormSchema, type LoginFormInput, type LoginFormValues } from './schema';

export function LoginForm({
  defaultBaseUrl,
  onSubmit,
  error,
}: {
  defaultBaseUrl: string;
  onSubmit: (values: LoginFormValues) => Promise<void>;
  error?: string | null;
}) {
  const [showServer, setShowServer] = useState(false);
  const passwordRef = useRef<TextInputRef>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormInput, unknown, LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { login: '', password: '', baseUrl: defaultBaseUrl },
  });
  const submit = () => void handleSubmit(onSubmit)();

  return (
    <View style={{ gap: spacing.md }}>
      <Controller
        control={control}
        name="login"
        render={({ field }) => (
          <TextField
            label={t('auth.login')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            error={errors.login?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            ref={passwordRef}
            label={t('auth.password')}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            secureTextEntry
            returnKeyType="go"
            onSubmitEditing={submit}
            error={errors.password?.message}
          />
        )}
      />

      <Pressable
        accessibilityRole="button"
        onPress={() => setShowServer((v) => !v)}
        style={{ minHeight: touch.minSize, justifyContent: 'center' }}
      >
        <Txt style={{ textDecorationLine: 'underline' }}>
          {showServer ? '▾' : '▸'} {t('auth.serverToggle')}
        </Txt>
      </Pressable>
      {(showServer || !!errors.baseUrl) && (
        <Controller
          control={control}
          name="baseUrl"
          render={({ field }) => (
            <TextField
              label={t('auth.serverUrl')}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              error={errors.baseUrl?.message}
            />
          )}
        />
      )}

      {!!error && (
        <View accessibilityRole="alert" style={{ backgroundColor: colors.danger, padding: spacing.md, borderRadius: touch.radius }}>
          <Txt style={{ color: colors.onDanger, fontWeight: '700' }}>{error}</Txt>
        </View>
      )}
      <Button label={t('auth.submit')} busy={isSubmitting} onPress={submit} />
    </View>
  );
}
