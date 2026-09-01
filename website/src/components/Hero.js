import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, serif, SKIP_ANIMATIONS } from '../theme';
import ScooterDrawing from './ScooterDrawing';
import OtherWork from './OtherWork';

function FadeUp({ delay, children, style }) {
  const anim = useRef(new Animated.Value(SKIP_ANIMATIONS ? 1 : 0)).current;
  useEffect(() => {
    if (SKIP_ANIMATIONS) return;
    Animated.timing(anim, {
      toValue: 1,
      duration: 1100,
      delay,
      useNativeDriver: true,
    }).start();
  }, [anim, delay]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function ScrollCue({ onPress }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Pressable onPress={onPress} style={styles.scrollCue} accessibilityRole="button">
      <Text style={styles.scrollCueText}>SCROLL</Text>
      <Animated.View
        style={[
          styles.scrollLine,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
            transform: [
              { scaleY: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) },
            ],
          },
        ]}
      />
    </Pressable>
  );
}

export default function Hero({ onScrollCue }) {
  const { width, height } = useWindowDimensions();
  // Fill the viewport, but stay sane on very tall windows.
  const heroHeight = Math.min(Math.max(height, 640), 1200);
  const titleSize = Math.min(160, Math.max(64, width * 0.14));

  return (
    <View style={[styles.hero, { minHeight: heroHeight }]}>
      <FadeUp delay={200}>
        <Text style={styles.kicker}>FIG. 00 — AN AUTONOMOUS MOBILITY PROJECT</Text>
      </FadeUp>
      <FadeUp delay={350}>
        <Text style={[styles.title, { fontSize: titleSize, letterSpacing: titleSize * 0.22 }]}>
          ZEPHYR
        </Text>
      </FadeUp>
      <FadeUp delay={550}>
        <Text style={styles.sub}>
          <Text style={styles.subEm}>n.</Text>
          {'  a soft, gentle breeze — reimagined as a self-driving electric scooter.'}
        </Text>
      </FadeUp>
      <FadeUp delay={700}>
        <ScooterDrawing />
      </FadeUp>
      <FadeUp delay={1000}>
        <OtherWork />
      </FadeUp>
      <ScrollCue onPress={onScrollCue} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 112,
    paddingBottom: 72,
    paddingHorizontal: 24,
  },
  kicker: {
    fontFamily: serif,
    fontSize: 13,
    letterSpacing: 4.5,
    color: colors.grey,
    textAlign: 'center',
  },
  title: {
    fontFamily: serif,
    color: colors.white,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  sub: {
    fontFamily: serif,
    fontSize: 19,
    color: colors.grey,
    textAlign: 'center',
    maxWidth: 560,
  },
  subEm: {
    fontStyle: 'italic',
    color: colors.white,
  },
  scrollCue: {
    position: 'absolute',
    bottom: 26,
    alignItems: 'center',
    gap: 8,
  },
  scrollCueText: {
    fontFamily: serif,
    fontSize: 12,
    letterSpacing: 5,
    color: colors.grey,
  },
  scrollLine: {
    width: 1,
    height: 34,
    backgroundColor: colors.grey,
  },
});
