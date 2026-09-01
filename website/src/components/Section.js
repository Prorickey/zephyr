import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, serif, CONTENT_MAX_WIDTH, MOBILE_BREAKPOINT } from '../theme';

// Shared section shell: alternating light/dark background, "Fig. 0X"
// kicker, and the "0X — Title" heading with a rule underneath.
export default function Section({ variant, fig, num, title, children }) {
  const { width } = useWindowDimensions();
  const mobile = width < MOBILE_BREAKPOINT;
  const light = variant === 'light';
  const ink = light ? colors.black : colors.white;

  return (
    <View style={[styles.section, light ? styles.light : styles.dark, mobile && styles.sectionMobile]}>
      <View style={styles.inner}>
        <Text style={styles.fig}>{fig}</Text>
        <View style={[styles.headingRule, { borderBottomColor: ink }]}>
          <Text style={[styles.heading, { color: ink }, mobile && styles.headingMobile]}>
            <Text style={styles.headingNum}>{num} — </Text>
            {title}
          </Text>
        </View>
        {children}
      </View>
    </View>
  );
}

// Text helpers shared by all sections
export function Lede({ ink, children }) {
  return <Text style={[textStyles.lede, { color: ink }]}>{children}</Text>;
}

export function BodyCopy({ ink, children }) {
  return <Text style={[textStyles.body, { color: ink }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  section: {
    paddingVertical: 112,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  sectionMobile: {
    paddingVertical: 72,
    paddingHorizontal: 22,
  },
  light: {
    backgroundColor: colors.white,
  },
  dark: {
    backgroundColor: colors.black,
  },
  inner: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
  },
  fig: {
    fontFamily: serif,
    fontSize: 13,
    letterSpacing: 4.5,
    color: colors.grey,
    marginBottom: 13,
  },
  headingRule: {
    borderBottomWidth: 1,
    paddingBottom: 14,
    marginBottom: 26,
  },
  heading: {
    fontFamily: serif,
    fontSize: 51,
    letterSpacing: 1,
  },
  headingMobile: {
    fontSize: 34,
  },
  headingNum: {
    fontSize: 30,
    letterSpacing: 3,
    color: colors.grey,
  },
});

const textStyles = StyleSheet.create({
  lede: {
    fontFamily: serif,
    fontStyle: 'italic',
    fontSize: 22,
    lineHeight: 34,
    marginBottom: 22,
    maxWidth: 700,
  },
  body: {
    fontFamily: serif,
    fontSize: 16,
    lineHeight: 26,
    opacity: 0.75,
    maxWidth: 700,
    marginBottom: 19,
  },
});
