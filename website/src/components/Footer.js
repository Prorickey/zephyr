import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, serif } from '../theme';

function FooterLink({ label, url }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="link"
    >
      <Text style={[styles.link, hovered && styles.linkHovered]}>{label}</Text>
    </Pressable>
  );
}

export default function Footer() {
  return (
    <View style={styles.footer}>
      <Text style={styles.title}>Zephyr ⌁</Text>
      <View style={styles.byline}>
        <Text style={styles.text}>A project by </Text>
        <FooterLink label="Joshua Chilukuri" url="https://joshuachilukuri.com" />
        <Text style={styles.text}> &amp; </Text>
        <FooterLink label="Trevor Bedson" url="https://bedson.tech" />
      </View>
      <Text style={styles.fine}>
        © 2026 · Fig. 05 — colophon: set in Times, drawn in strokes of white.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: 'center',
    paddingTop: 72,
    paddingBottom: 48,
    paddingHorizontal: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.black,
  },
  title: {
    fontFamily: serif,
    fontStyle: 'italic',
    fontSize: 24,
    color: colors.white,
    marginBottom: 10,
  },
  byline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  text: {
    fontFamily: serif,
    fontSize: 16,
    color: colors.grey,
  },
  link: {
    fontFamily: serif,
    fontSize: 16,
    color: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  linkHovered: {
    borderBottomColor: colors.white,
  },
  fine: {
    fontFamily: serif,
    fontSize: 13,
    letterSpacing: 0.7,
    color: colors.grey,
    marginTop: 22,
    textAlign: 'center',
  },
});
