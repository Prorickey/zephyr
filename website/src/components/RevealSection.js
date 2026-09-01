import React, { useEffect, useRef } from 'react';
import { Animated, useWindowDimensions } from 'react-native';
import { SKIP_ANIMATIONS } from '../theme';

// Fades a section up once it scrolls into view (the `.reveal` behavior
// from the original static site). Must be a direct child of the
// ScrollView content so onLayout `y` matches the content offset.
export default function RevealSection({ id, onPosition, scrollY, children }) {
  const { height: winHeight } = useWindowDimensions();
  const anim = useRef(new Animated.Value(SKIP_ANIMATIONS ? 1 : 0)).current;
  const revealed = useRef(SKIP_ANIMATIONS);
  const layoutY = useRef(null);
  const lastOffset = useRef(0);

  const maybeReveal = () => {
    if (revealed.current || layoutY.current == null) return;
    if (lastOffset.current + winHeight > layoutY.current + 120) {
      revealed.current = true;
      Animated.timing(anim, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      }).start();
    }
  };

  useEffect(() => {
    const sub = scrollY.addListener(({ value }) => {
      lastOffset.current = value;
      maybeReveal();
    });
    return () => scrollY.removeListener(sub);
  }, [scrollY, winHeight]);

  const onLayout = (e) => {
    layoutY.current = e.nativeEvent.layout.y;
    onPosition?.(id, layoutY.current);
    maybeReveal();
  };

  return (
    <Animated.View
      onLayout={onLayout}
      style={{
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [30, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
