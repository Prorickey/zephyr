import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, serif } from '../theme';

const PEOPLE = [
  { name: 'Joshua Chilukuri', url: 'https://joshuachilukuri.com', hair: false },
  { name: 'Trevor Bedson', url: 'https://bedson.tech', hair: true },
];

function PersonIcon({ person }) {
  const [hovered, setHovered] = useState(false);
  return (
    <View style={styles.personWrap}>
      {hovered && (
        <View style={styles.tooltipWrap} pointerEvents="none">
          <View style={styles.tooltip}>
            <Text style={styles.tooltipText}>{person.name}</Text>
          </View>
          <View style={styles.tooltipArrow} />
        </View>
      )}
      <Pressable
        onPress={() => Linking.openURL(person.url)}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        accessibilityRole="link"
        accessibilityLabel={person.name}
        style={[styles.person, hovered && styles.personHovered]}
      >
        <Svg width={26} height={26} viewBox="0 0 40 40" fill="none">
          <Circle cx="20" cy="15" r="6.5" stroke={colors.white} strokeWidth={1.6} strokeLinecap="round" />
          <Path
            d="M8 33 C8 25.5 13 22.5 20 22.5 C27 22.5 32 25.5 32 33"
            stroke={colors.white}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          {person.hair && (
            <Path d="M13 11 Q20 5 27 11" stroke={colors.white} strokeWidth={1.6} strokeLinecap="round" />
          )}
        </Svg>
      </Pressable>
    </View>
  );
}

export default function OtherWork() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>OUR OTHER WORK</Text>
      <View style={styles.icons}>
        {PEOPLE.map((person) => (
          <PersonIcon key={person.name} person={person} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 38,
    alignItems: 'center',
  },
  label: {
    fontFamily: serif,
    fontSize: 12,
    letterSpacing: 5,
    color: colors.grey,
    marginBottom: 14,
  },
  icons: {
    flexDirection: 'row',
    gap: 22,
  },
  personWrap: {
    position: 'relative',
    alignItems: 'center',
  },
  person: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personHovered: {
    borderColor: colors.white,
    backgroundColor: colors.whiteFaint,
    transform: [{ translateY: -3 }],
  },
  tooltipWrap: {
    position: 'absolute',
    bottom: 62,
    left: -100,
    right: -100,
    alignItems: 'center',
    zIndex: 10,
  },
  tooltip: {
    backgroundColor: colors.white,
    paddingVertical: 5,
    paddingHorizontal: 13,
    borderRadius: 2,
  },
  tooltipText: {
    fontFamily: serif,
    fontStyle: 'italic',
    fontSize: 14,
    letterSpacing: 0.7,
    color: colors.black,
  },
  tooltipArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.white,
  },
});
