import { Platform } from 'react-native';

export const colors = {
  black: '#0a0a0a',
  white: '#f7f5f0',
  grey: '#8a8a86',
  line: 'rgba(247, 245, 240, 0.25)',
  lineDark: 'rgba(10, 10, 10, 0.2)',
  whiteFaint: 'rgba(247, 245, 240, 0.06)',
};

// Times New Roman-esque serif on every platform.
export const serif = Platform.select({
  web: '"Times New Roman", Times, Georgia, serif',
  ios: 'Times New Roman',
  default: 'serif',
});

// Testing / reduced-motion escape hatch: append ?noanim to the web URL
// to render everything in its final state with no entrance animations.
export const SKIP_ANIMATIONS =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  window.location.search.includes('noanim');

// Shared layout constants
export const MOBILE_BREAKPOINT = 880;
export const CONTENT_MAX_WIDTH = 860;
export const TASKBAR_HEIGHT = 58;
