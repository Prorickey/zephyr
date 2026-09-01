import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Section, { Lede } from '../Section';
import { colors, serif } from '../../theme';

const COLUMNS = [
  {
    title: 'Perception',
    copy: 'Camera and lidar streams are fused into a local occupancy grid. Placeholder: notes on the vision model, obstacle classification, and how Zephyr tells a curb from a shadow.',
  },
  {
    title: 'Planning',
    copy: 'A hybrid A* planner proposes paths; a safety layer vetoes anything that gets within a comfortable margin of pedestrians. Placeholder: replanning cadence and edge cases.',
  },
  {
    title: 'Control',
    copy: 'Steering and throttle are closed-loop at 50 Hz with a graceful fallback: when confidence drops, Zephyr simply stops and phones home. Placeholder: controller details.',
  },
];

const TAGS = ['COMPUTER VISION', 'SLAM', 'PATH PLANNING', 'SENSOR FUSION', 'EMBEDDED', 'ROS 2'];

export default function Autonomy() {
  return (
    <Section variant="dark" fig="FIG. 02" num="02" title="Autonomous AI Implementation">
      <Lede ink={colors.white}>
        A lightweight perception-planning-control loop, tuned to run on hardware that fits
        under a deck plate.
      </Lede>
      <View style={styles.cols}>
        {COLUMNS.map((col) => (
          <View key={col.title} style={styles.col}>
            <Text style={styles.colTitle}>{col.title}</Text>
            <Text style={styles.colCopy}>{col.copy}</Text>
          </View>
        ))}
      </View>
      <View style={styles.tags}>
        {TAGS.map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  cols: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 38,
    marginVertical: 16,
  },
  col: {
    flexGrow: 1,
    flexBasis: 220,
  },
  colTitle: {
    fontFamily: serif,
    fontStyle: 'italic',
    fontSize: 21,
    color: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    paddingBottom: 6,
    marginBottom: 10,
  },
  colCopy: {
    fontFamily: serif,
    fontSize: 15,
    lineHeight: 24,
    color: colors.white,
    opacity: 0.8,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 22,
  },
  tag: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 15,
  },
  tagText: {
    fontFamily: serif,
    fontSize: 12,
    letterSpacing: 1.2,
    color: colors.grey,
  },
});
