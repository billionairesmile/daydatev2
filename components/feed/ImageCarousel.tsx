import React, { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  View,
  ViewToken,
} from 'react-native';
import { Image } from 'expo-image';
import { COLORS, SP, RD, SCREEN_WIDTH } from '@/constants/design';

interface ImageCarouselProps {
  images: string[];
  onPress?: () => void;
  height?: number;
}

const IMAGE_WIDTH = SCREEN_WIDTH;
const DEFAULT_HEIGHT = IMAGE_WIDTH * (3 / 4);

export function ImageCarousel({ images, onPress, height }: ImageCarouselProps) {
  const imageHeight = height ?? DEFAULT_HEIGHT;
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<string>>(null);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    },
    [],
  );

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 50,
  }).current;

  const renderItem = useCallback(
    ({ item }: { item: string }) => (
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={[styles.imageWrapper, { height: imageHeight }]}
      >
        <Image
          source={{ uri: item }}
          style={styles.image}
          contentFit="contain"
          transition={200}
          recyclingKey={item}
        />
      </Pressable>
    ),
    [onPress, imageHeight],
  );

  const keyExtractor = useCallback((_: string, index: number) => `carousel-${index}`, []);

  if (images.length === 0) {
    return (
      <View style={[styles.imageWrapper, { height: imageHeight }, styles.placeholder]}>
        <View style={styles.placeholderInner} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={images}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: IMAGE_WIDTH,
          offset: IMAGE_WIDTH * index,
          index,
        })}
      />
      {images.length > 1 && (
        <View style={styles.dotContainer}>
          {images.map((_, index) => (
            <View
              key={`dot-${index}`}
              style={[
                styles.dot,
                index === activeIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: IMAGE_WIDTH,
    position: 'relative',
  },
  imageWrapper: {
    width: IMAGE_WIDTH,
    height: DEFAULT_HEIGHT,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    backgroundColor: COLORS.glass.white08,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.glass.white10,
  },
  dotContainer: {
    position: 'absolute',
    bottom: SP.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SP.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: COLORS.foreground,
    width: 18,
    borderRadius: 3,
  },
  dotInactive: {
    backgroundColor: COLORS.glass.white40,
  },
});
