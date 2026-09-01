import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, serif, MOBILE_BREAKPOINT, TASKBAR_HEIGHT } from '../theme';

const LINKS = [
  { id: 'overview', num: '01', label: 'Project Overview' },
  { id: 'autonomy', num: '02', label: 'Autonomous AI Implementation' },
  { id: 'design', num: '03', label: 'Electric Scooter Design' },
  { id: 'app', num: '04', label: 'Zephyr Mobile App' },
];

function NavLink({ item, onPress, mobile }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={mobile ? styles.mobileLink : styles.link}
    >
      <Text style={[styles.linkText, hovered && !mobile && styles.linkTextHovered]}>
        <Text style={styles.linkNum}>{item.num}  </Text>
        {item.label}
      </Text>
    </Pressable>
  );
}

export default function Taskbar({ onNavigate }) {
  const { width } = useWindowDimensions();
  const mobile = width < MOBILE_BREAKPOINT;
  const [menuOpen, setMenuOpen] = useState(false);

  const navigate = (id) => {
    setMenuOpen(false);
    onNavigate(id);
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <Pressable onPress={() => navigate('top')}>
          <Text style={styles.brand}>
            Zephyr<Text style={styles.brandMark}> ⌁</Text>
          </Text>
        </Pressable>

        {mobile ? (
          <Pressable
            onPress={() => setMenuOpen((open) => !open)}
            style={styles.menuToggle}
            accessibilityRole="button"
            accessibilityLabel="Toggle menu"
          >
            <View style={[styles.menuBarLine, menuOpen && styles.menuBarTopOpen]} />
            <View style={[styles.menuBarLine, menuOpen && styles.menuBarBottomOpen]} />
          </Pressable>
        ) : (
          <View style={styles.nav}>
            {LINKS.map((item) => (
              <NavLink key={item.id} item={item} onPress={() => navigate(item.id)} />
            ))}
          </View>
        )}
      </View>

      {mobile && menuOpen && (
        <View style={styles.mobileMenu}>
          {LINKS.map((item) => (
            <NavLink key={item.id} item={item} mobile onPress={() => navigate(item.id)} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  bar: {
    height: TASKBAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    backgroundColor: 'rgba(10, 10, 10, 0.88)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  brand: {
    fontFamily: serif,
    fontStyle: 'italic',
    fontSize: 21,
    letterSpacing: 3,
    color: colors.white,
  },
  brandMark: {
    fontStyle: 'normal',
  },
  nav: {
    flexDirection: 'row',
    gap: 34,
  },
  link: {
    paddingBottom: 2,
  },
  linkText: {
    fontFamily: serif,
    fontSize: 15,
    letterSpacing: 1,
    color: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  linkTextHovered: {
    borderBottomColor: colors.white,
  },
  linkNum: {
    fontSize: 11,
    color: colors.grey,
  },
  menuToggle: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 7,
  },
  menuBarLine: {
    width: 26,
    height: 1.5,
    backgroundColor: colors.white,
  },
  menuBarTopOpen: {
    transform: [{ translateY: 4.25 }, { rotate: '45deg' }],
  },
  menuBarBottomOpen: {
    transform: [{ translateY: -4.25 }, { rotate: '-45deg' }],
  },
  mobileMenu: {
    backgroundColor: 'rgba(10, 10, 10, 0.96)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  mobileLink: {
    paddingVertical: 16,
    paddingHorizontal: 26,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
});
