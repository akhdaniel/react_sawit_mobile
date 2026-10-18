import { forwardRef, useImperativeHandle, useRef, useState, type ComponentRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { colors, radius } from '@/theme';

export interface SignaturePadRef {
  clear(): void;
  isEmpty(): boolean;
  /** Simpan sebagai PNG sementara; mengembalikan URI file. */
  capture(): Promise<string>;
}

/** Bidang tanda tangan (jari) — garis SVG, diekspor PNG lewat react-native-view-shot. */
export const SignaturePad = forwardRef<SignaturePadRef, { height?: number }>(function SignaturePad({ height = 200 }, ref) {
  const [paths, setPaths] = useState<string[]>([]);
  const current = useRef('');
  const [, force] = useState(0);
  const view = useRef<ComponentRef<typeof View>>(null);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Jangan lepaskan gestur ke ScrollView induk saat sedang menggores.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        current.current = `M${x.toFixed(1)},${y.toFixed(1)}`;
        force((n) => n + 1);
      },
      onPanResponderMove: (e) => {
        const { locationX: x, locationY: y } = e.nativeEvent;
        current.current += ` L${x.toFixed(1)},${y.toFixed(1)}`;
        force((n) => n + 1);
      },
      onPanResponderRelease: () => {
        const p = current.current;
        current.current = '';
        if (p) setPaths((ps) => [...ps, p]);
      },
    }),
  ).current;

  useImperativeHandle(ref, () => ({
    clear: () => setPaths([]),
    isEmpty: () => paths.length === 0,
    // RN 0.88: View adalah elemen host (ReactNativeElement); view-shot menerima ref host.
    capture: () => captureRef(view as unknown as Parameters<typeof captureRef>[0], { format: 'png', quality: 1, result: 'tmpfile' }),
  }));

  return (
    <View ref={view} collapsable={false} style={[styles.pad, { height }]} {...responder.panHandlers}>
      <Svg width="100%" height="100%">
        {[...paths, current.current].filter(Boolean).map((d, i) => (
          <Path key={i} d={d} stroke={colors.text} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  pad: { backgroundColor: '#FFFFFF', borderRadius: radius.md, borderWidth: 2, borderColor: colors.borderStrong, borderStyle: 'dashed' },
});
