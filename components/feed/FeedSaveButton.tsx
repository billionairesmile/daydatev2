import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bookmark } from 'lucide-react-native';
import { COLORS, FS, SP, SZ } from '@/constants/design';

interface FeedSaveButtonProps {
  isSaved: boolean;
  onToggle: () => void;
  saveCount?: number;
}

export function FeedSaveButton({ isSaved, onToggle, saveCount }: FeedSaveButtonProps) {
  const handlePress = useCallback(() => {
    onToggle();
  }, [onToggle]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={isSaved ? 'Remove from saved' : 'Save post'}
      accessibilityState={{ selected: isSaved }}
    >
      <Bookmark
        size={SZ.iconMd}
        color={isSaved ? COLORS.accent : COLORS.glass.white60}
        fill={isSaved ? COLORS.accent : 'transparent'}
        strokeWidth={1.8}
      />
      {saveCount != null && saveCount > 0 && (
        <Text style={styles.count}>{saveCount}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP.xs,
    paddingVertical: SP.xs,
    paddingHorizontal: SP.sm,
    borderRadius: 20,
    backgroundColor: COLORS.glass.white08,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pressed: {
    opacity: 0.7,
  },
  count: {
    fontSize: FS.sm,
    fontWeight: '600',
    color: COLORS.glass.white60,
  },
});
