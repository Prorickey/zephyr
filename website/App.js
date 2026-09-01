import React, { useRef, useCallback } from 'react';
import { Animated, StatusBar, StyleSheet, View } from 'react-native';

import { colors, TASKBAR_HEIGHT } from './src/theme';
import Taskbar from './src/components/Taskbar';
import Hero from './src/components/Hero';
import RevealSection from './src/components/RevealSection';
import Overview from './src/components/sections/Overview';
import Autonomy from './src/components/sections/Autonomy';
import ScooterDesign from './src/components/sections/ScooterDesign';
import MobileApp from './src/components/sections/MobileApp';
import Footer from './src/components/Footer';

export default function App() {
  const scrollRef = useRef(null);
  const sectionPositions = useRef({});
  const scrollY = useRef(new Animated.Value(0)).current;

  const handlePosition = useCallback((id, y) => {
    sectionPositions.current[id] = y;
  }, []);

  const scrollToSection = useCallback((id) => {
    const y = sectionPositions.current[id] ?? 0;
    scrollRef.current?.scrollTo({ y: Math.max(y - TASKBAR_HEIGHT, 0), animated: true });
  }, []);

  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false }
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.black} />
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
      >
        <Hero onScrollCue={() => scrollToSection('overview')} />
        <RevealSection id="overview" onPosition={handlePosition} scrollY={scrollY}>
          <Overview />
        </RevealSection>
        <RevealSection id="autonomy" onPosition={handlePosition} scrollY={scrollY}>
          <Autonomy />
        </RevealSection>
        <RevealSection id="design" onPosition={handlePosition} scrollY={scrollY}>
          <ScooterDesign />
        </RevealSection>
        <RevealSection id="app" onPosition={handlePosition} scrollY={scrollY}>
          <MobileApp />
        </RevealSection>
        <Footer />
      </Animated.ScrollView>
      <Taskbar onNavigate={scrollToSection} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.black,
  },
  content: {
    backgroundColor: colors.black,
  },
});
