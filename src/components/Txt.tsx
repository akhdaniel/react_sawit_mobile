import { Text, type TextProps } from 'react-native';

import { colors, typography } from '@/theme';

type Variant = 'body' | 'small' | 'large' | 'title';

const sizes: Record<Variant, number> = {
  body: typography.base,
  small: typography.small,
  large: typography.large,
  title: typography.title,
};

/** Teks dasar 18 sp; skala font sistem tetap dihormati (allowFontScaling default). */
export function Txt({ variant = 'body', style, ...rest }: TextProps & { variant?: Variant }) {
  return (
    <Text
      style={[
        { color: colors.text, fontSize: sizes[variant], fontWeight: variant === 'title' ? '700' : '400' },
        style,
      ]}
      {...rest}
    />
  );
}
