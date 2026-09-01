import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Section, { Lede, BodyCopy } from '../Section';
import { colors, serif } from '../../theme';

const SPECS = [
  ['Motor', '500 W rear-hub BLDC (placeholder)'],
  ['Battery', '48 V 13 Ah lithium-ion, swappable (placeholder)'],
  ['Frame', '6061 aluminum, reinforced steering column (placeholder)'],
  ['Steering', 'Servo-actuated column for autonomous mode (placeholder)'],
  ['Sensors', 'Solid-state lidar, stereo camera, wheel encoders (placeholder)'],
  ['Compute', 'Embedded SoC under the deck, passively cooled (placeholder)'],
];

export default function ScooterDesign() {
  return (
    <Section variant="light" fig="FIG. 03" num="03" title="Electric Scooter Design">
      <Lede ink={colors.black}>
        Off-the-shelf where it can be, custom where it must be. The frame carries the compute;
        the compute never gets in the rider's way.
      </Lede>
      <View style={styles.table}>
        {SPECS.map(([label, value]) => (
          <View key={label} style={styles.row}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
          </View>
        ))}
      </View>
      <BodyCopy ink={colors.black}>
        Placeholder: design write-up covering weight distribution with the sensor mast,
        waterproofing, and why the kickstand turned out to be the hardest part.
      </BodyCopy>
    </Section>
  );
}

const styles = StyleSheet.create({
  table: {
    marginTop: 10,
    marginBottom: 26,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineDark,
    gap: 12,
  },
  rowLabel: {
    fontFamily: serif,
    fontStyle: 'italic',
    fontSize: 16,
    color: colors.grey,
    width: 120,
  },
  rowValue: {
    fontFamily: serif,
    fontSize: 16,
    color: colors.black,
    flex: 1,
  },
});
