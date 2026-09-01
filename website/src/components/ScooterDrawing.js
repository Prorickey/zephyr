import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { colors, SKIP_ANIMATIONS } from '../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedLine = Animated.createAnimatedComponent(Line);

const DASH = 1200;
const DRAW_MS = 2000;

// Stagger groups so the silhouette draws in wheels-first.
const GROUP_DELAYS = {
  d1: 600,
  d2: 1000,
  d3: 1400,
  d4: 1800,
  d5: 2200,
  d6: 2600,
  d7: 400,
};

// Simple white line silhouette of a Segway-style performance scooter
// (raked stem, front suspension arm, long deck, swept rear fender),
// stroke-animated so it "draws itself" on load, with trailing zephyr
// wind lines pulsing afterwards.
export default function ScooterDrawing() {
  const { width } = useWindowDimensions();
  const svgWidth = Math.min(620, width * 0.88);

  const groups = useMemo(() => {
    const values = {};
    Object.keys(GROUP_DELAYS).forEach((key) => {
      values[key] = new Animated.Value(SKIP_ANIMATIONS ? 1 : 0);
    });
    return values;
  }, []);
  const dotOpacity = useRef(new Animated.Value(SKIP_ANIMATIONS ? 1 : 0)).current;
  const pulses = useRef([new Animated.Value(1), new Animated.Value(1), new Animated.Value(1)]).current;

  useEffect(() => {
    if (SKIP_ANIMATIONS) return;
    const drawAnimations = Object.entries(GROUP_DELAYS).map(([key, delay]) =>
      Animated.timing(groups[key], {
        toValue: 1,
        duration: DRAW_MS,
        delay,
        useNativeDriver: false,
      })
    );
    drawAnimations.push(
      Animated.timing(dotOpacity, {
        toValue: 1,
        duration: 500,
        delay: 1600,
        useNativeDriver: false,
      })
    );
    Animated.parallel(drawAnimations).start();

    // Breathing pulse on the wind lines once the drawing is complete.
    const loops = pulses.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(4000 + i * 400),
          Animated.timing(value, { toValue: 0.15, duration: 1500, useNativeDriver: false }),
          Animated.timing(value, { toValue: 1, duration: 1500, useNativeDriver: false }),
        ])
      )
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [groups, dotOpacity, pulses]);

  const dash = (key) => ({
    strokeDasharray: [DASH],
    strokeDashoffset: groups[key].interpolate({
      inputRange: [0, 1],
      outputRange: [DASH, 0],
    }),
  });

  const stroke = {
    stroke: colors.white,
    strokeWidth: 2.4,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    fill: 'none',
  };

  return (
    <View style={[styles.wrap, { width: svgWidth }]}>
      <Svg width="100%" height={svgWidth * (400 / 640)} viewBox="0 0 640 400">
        {/* ground */}
        <AnimatedLine x1="50" y1="372" x2="590" y2="372" {...stroke} {...dash('d7')} />
        {/* trailing wind / zephyr lines — these keep pulsing */}
        <AnimatedPath d="M560 250 Q 600 240 634 252" {...stroke} {...dash('d6')} opacity={pulses[0]} />
        <AnimatedPath d="M566 282 Q 606 272 636 286" {...stroke} {...dash('d6')} opacity={pulses[1]} />
        <AnimatedPath d="M572 314 Q 604 306 632 316" {...stroke} {...dash('d6')} opacity={pulses[2]} />

        {/* front wheel — tire, rim, hub */}
        <AnimatedCircle cx="150" cy="320" r="48" {...stroke} {...dash('d1')} />
        <AnimatedCircle cx="150" cy="320" r="26" {...stroke} {...dash('d2')} />
        <AnimatedCircle cx="150" cy="320" r="4" fill={colors.white} opacity={dotOpacity} />

        {/* front suspension arm from axle up to the steering head */}
        <AnimatedPath d="M136 292 L120 234 L124 220 L146 216 L166 296" {...stroke} {...dash('d2')} />

        {/* front fender */}
        <AnimatedPath d="M104 294 A 54 54 0 0 1 198 290" {...stroke} {...dash('d2')} />

        {/* headlight beams */}
        <AnimatedLine x1="112" y1="244" x2="58" y2="236" {...stroke} {...dash('d5')} />
        <AnimatedLine x1="112" y1="252" x2="54" y2="256" {...stroke} {...dash('d5')} />

        {/* raked steering stem */}
        <AnimatedPath d="M156 244 L206 62" {...stroke} {...dash('d3')} />
        <AnimatedPath d="M172 248 L222 66" {...stroke} {...dash('d3')} />

        {/* handlebar with grips */}
        <AnimatedLine x1="144" y1="62" x2="292" y2="56" {...stroke} {...dash('d4')} />
        <AnimatedPath d="M144 55 L174 54 L174 68 L144 69 Z" {...stroke} {...dash('d4')} />
        <AnimatedPath d="M262 52 L292 51 L292 63 L262 64 Z" {...stroke} {...dash('d4')} />

        {/* deck */}
        <AnimatedPath d="M196 262 L430 254 L448 264 L452 300 L200 300 Z" {...stroke} {...dash('d1')} />

        {/* rear swingarm from deck to rear axle */}
        <AnimatedPath d="M432 290 L490 308 L486 320 L428 302 Z" {...stroke} {...dash('d2')} />

        {/* rear fender sweeping over the wheel with kicked-up tail */}
        <AnimatedPath d="M444 260 A 62 62 0 0 1 550 294 L562 286" {...stroke} {...dash('d2')} />

        {/* rear wheel — tire, rim, hub */}
        <AnimatedCircle cx="498" cy="320" r="48" {...stroke} {...dash('d1')} />
        <AnimatedCircle cx="498" cy="320" r="26" {...stroke} {...dash('d2')} />
        <AnimatedCircle cx="498" cy="320" r="4" fill={colors.white} opacity={dotOpacity} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 28,
    alignSelf: 'center',
  },
});
