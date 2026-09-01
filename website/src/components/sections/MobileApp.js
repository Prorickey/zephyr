import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Section, { Lede, BodyCopy } from '../Section';
import PhoneMockup from '../PhoneMockup';
import { colors, serif, MOBILE_BREAKPOINT } from '../../theme';

const FEATURES = [
  ['Summon.', 'Drop a pin; Zephyr rides to you. (Placeholder)'],
  ['Live map.', 'Watch it navigate in real time. (Placeholder)'],
  ['Battery & health.', 'Charge state, diagnostics, firmware. (Placeholder)'],
  ['Ride log.', 'Distance, routes, and the occasional detour. (Placeholder)'],
];

export default function MobileApp() {
  const { width } = useWindowDimensions();
  const stacked = width < MOBILE_BREAKPOINT;

  return (
    <Section variant="dark" fig="FIG. 04" num="04" title="Zephyr Mobile App">
      <View style={[styles.layout, stacked && styles.layoutStacked]}>
        <View style={styles.copy}>
          <Lede ink={colors.white}>The remote control you never need to look at twice.</Lede>
          <View style={styles.features}>
            {FEATURES.map(([title, copy]) => (
              <View key={title} style={styles.feature}>
                <Text style={styles.featureText}>
                  <Text style={styles.featureTitle}>{title}</Text> {copy}
                </Text>
              </View>
            ))}
          </View>
          <BodyCopy ink={colors.white}>
            Placeholder: notes on the app stack, the telemetry link, and the remote-stop
            safety button.
          </BodyCopy>
        </View>
        <PhoneMockup />
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  layout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 48,
  },
  layoutStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  copy: {
    flex: 1,
    minWidth: 260,
  },
  features: {
    marginBottom: 22,
  },
  feature: {
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  featureText: {
    fontFamily: serif,
    fontSize: 16,
    lineHeight: 25,
    color: colors.white,
    opacity: 0.85,
  },
  featureTitle: {
    fontWeight: '700',
  },
});
