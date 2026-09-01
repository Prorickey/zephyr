import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Section, { Lede, BodyCopy } from '../Section';
import { colors, serif } from '../../theme';

const STATS = [
  { value: '25 km', label: 'RANGE PER CHARGE' },
  { value: 'L4', label: 'TARGET AUTONOMY (GEOFENCED)' },
  { value: '3', label: 'SENSOR MODALITIES' },
  { value: '2', label: 'ENGINEERS, MANY LATE NIGHTS' },
];

export default function Overview() {
  return (
    <Section variant="light" fig="FIG. 01" num="01" title="Project Overview">
      <Lede ink={colors.black}>
        Zephyr is a two-person exploration into what happens when a humble electric scooter
        learns to think for itself. Summon it from across campus, ride it wherever you like,
        and let it quietly return itself to the nearest charging dock.
      </Lede>
      <BodyCopy ink={colors.black}>
        Built from the ground up — frame, drivetrain, perception stack, and companion app —
        Zephyr is equal parts robotics testbed and daily commuter. This page is a living
        document of the project; the copy below is placeholder while we write up the real
        results.
      </BodyCopy>
      <View style={styles.statGrid}>
        {STATS.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: colors.lineDark,
    marginTop: 20,
  },
  stat: {
    flexGrow: 1,
    flexBasis: 160,
    paddingVertical: 26,
    paddingHorizontal: 19,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineDark,
    gap: 5,
  },
  statValue: {
    fontFamily: serif,
    fontSize: 34,
    color: colors.black,
  },
  statLabel: {
    fontFamily: serif,
    fontSize: 13,
    letterSpacing: 1.6,
    color: colors.grey,
  },
});
