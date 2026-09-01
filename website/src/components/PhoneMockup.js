import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, serif } from '../theme';

// Line-drawn phone mockup with a pinging live-map dot.
export default function PhoneMockup() {
  const ping = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(ping, { toValue: 1, duration: 2000, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [ping]);

  return (
    <View style={styles.phone}>
      <View style={styles.notch} />
      <Text style={styles.brand}>Zephyr ⌁</Text>
      <View style={styles.map}>
        <Svg width="100%" height="100%" viewBox="0 0 120 90" preserveAspectRatio="none">
          <Path
            d="M10 80 Q40 70 55 45 T110 12"
            stroke={colors.grey}
            strokeWidth={1.5}
            strokeDasharray="4 5"
            fill="none"
          />
        </Svg>
        <View style={styles.dotWrap}>
          <Animated.View
            style={[
              styles.dotRing,
              {
                opacity: ping.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                transform: [
                  { scale: ping.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.8] }) },
                ],
              },
            ]}
          />
          <View style={styles.dot} />
        </View>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowText}>Battery</Text>
        <Text style={styles.rowText}>87%</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowText}>Status</Text>
        <Text style={styles.rowText}>En route</Text>
      </View>
      <View style={styles.button}>
        <Text style={styles.buttonText}>SUMMON</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  phone: {
    width: 230,
    borderWidth: 1.5,
    borderColor: colors.line,
    borderRadius: 34,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(247, 245, 240, 0.03)',
    gap: 11,
    alignSelf: 'center',
  },
  notch: {
    width: 74,
    height: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    alignSelf: 'center',
  },
  brand: {
    fontFamily: serif,
    fontStyle: 'italic',
    fontSize: 15,
    letterSpacing: 1.5,
    textAlign: 'center',
    color: colors.white,
  },
  map: {
    height: 120,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    overflow: 'hidden',
  },
  dotWrap: {
    position: 'absolute',
    top: '44%',
    left: '46%',
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.white,
  },
  dotRing: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.white,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingBottom: 6,
  },
  rowText: {
    fontFamily: serif,
    fontSize: 13,
    color: colors.grey,
  },
  button: {
    borderWidth: 1,
    borderColor: colors.white,
    borderRadius: 999,
    paddingVertical: 7,
    alignItems: 'center',
    marginTop: 3,
  },
  buttonText: {
    fontFamily: serif,
    fontSize: 14,
    letterSpacing: 2.9,
    color: colors.white,
  },
});
