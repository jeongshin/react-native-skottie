import '@shopify/react-native-skia'; // Important: register skia module
import type { NativeSkiaViewProps } from '@shopify/react-native-skia/lib/typescript/src';
import { SkiaViewNativeId } from '@shopify/react-native-skia/src/views/SkiaViewNativeId';
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { SkiaViewApi } from './SkiaViewApi';

import type { SkottieViewSource, SkSkottie } from './types';
import { NativeSkiaSkottieView } from './NativeSkiaSkottieView';
import { SkottieAPI } from './NativeSkottieModule';
import { SharedValue, startMapper, stopMapper } from './reanimatedWrapper';

export type ResizeMode = 'cover' | 'contain' | 'stretch';

export type SkottieViewProps = NativeSkiaViewProps & {
  source: SkottieViewSource;

  /**
   * A boolean flag indicating whether or not the animation should start automatically when
   * mounted.
   */
  autoPlay?: boolean;

  /**
   * The speed the animation will progress. This only affects the imperative API. The
   * default value is 1.
   */
  speed?: number;

  /**
   * The duration of the animation in ms. Takes precedence over speed when set.
   * This only works when source is an actual JS object of an animation.
   */
  duration?: number;

  /**
   * A boolean flag indicating whether or not the animation should loop.
   * @default true
   */
  loop?: boolean;

  /**
   * Provide a reanimated shared value between 0 and 1 to control the animation progress.
   */
  progress?: SharedValue<number>;

  /**
   * @default contain
   */
  resizeMode?: ResizeMode;

  /**
   * Called when the animation is finished playing.
   * Note: this will be called multiple times if the animation is looping.
   */
  onAnimationFinish?: (isCancelled?: boolean) => void;
};

export type SkottieViewRef = {
  play: (onAnimationFinish?: (isCancelled?: boolean) => void) => void;
  pause: () => void;
  reset: () => void;
};

export const Skottie = React.forwardRef<SkottieViewRef, SkottieViewProps>(
  (props, ref) => {
    const nativeId = useRef(SkiaViewNativeId.current++).current;
    const loop = props.loop ?? true;

    const skottieAnimation = useMemo(() => {
      if (typeof props.source === 'object' && 'fps' in props.source) {
        // Case: the user passed a SkSkottie instance
        return props.source;
      }

      return SkottieAPI.createFrom(props.source);
    }, [props.source]);

    const progress = props.progress;

    // Handle animation updates
    useEffect(() => {
      const _progress = progress;
      if (_progress == null) {
        return;
      }

      assertSkiaViewApi();
      const mapperId = startMapper(() => {
        'worklet';
        try {
          SkiaViewApi.setJsiProperty(nativeId, 'setProgress', _progress.value);
        } catch (e) {
          // ignored, view might not be ready yet
          if (props.debug) {
            console.warn(e);
          }
        }
      }, [progress]);

      return () => {
        stopMapper(mapperId);
      };
    }, [nativeId, progress, props.debug]);

    //#region Callbacks / Imperative API
    const start = useCallback(
      (onAnimationFinish?: (isCancelled?: boolean) => void) => {
        assertSkiaViewApi();
        SkiaViewApi.setJsiProperty(nativeId, 'start', {
          onAnimationFinish,
        });
      },
      [nativeId]
    );

    const pause = useCallback(() => {
      assertSkiaViewApi();
      SkiaViewApi.setJsiProperty(nativeId, 'pause', null);
    }, [nativeId]);

    const updateAnimation = useCallback(
      (animation: SkSkottie) => {
        assertSkiaViewApi();
        SkiaViewApi.setJsiProperty(nativeId, 'src', animation);
      },
      [nativeId]
    );

    const updateResizeMode = useCallback(
      (resizeMode: ResizeMode) => {
        assertSkiaViewApi();
        SkiaViewApi.setJsiProperty(nativeId, 'scaleType', resizeMode);
      },
      [nativeId]
    );

    useImperativeHandle(
      ref,
      () => ({
        play: start,
        pause: pause,
        reset: () => {
          assertSkiaViewApi();
          SkiaViewApi.setJsiProperty(nativeId, 'reset', null);
        },
      }),
      [nativeId, start, pause]
    );
    //#endregion

    useLayoutEffect(() => {
      updateResizeMode(props.resizeMode ?? 'contain');
    }, [nativeId, props.resizeMode, updateResizeMode]);

    useLayoutEffect(() => {
      updateAnimation(skottieAnimation);
    }, [nativeId, skottieAnimation, updateAnimation]);

    // #region Prop controlled animation
    // Start the animation
    const shouldPlay = progress == null && props.autoPlay;
    const initialShouldPlayRef = useRef(shouldPlay);
    useEffect(() => {
      if (shouldPlay) {
        start(loop ? undefined : props.onAnimationFinish);
      }

      // TODO: support speed prop
      // const speed = props.speed ?? 1;
      // const duration = (skottieAnimation.duration * 1000) / speed;
    }, [loop, props.onAnimationFinish, shouldPlay, start]);

    // Pause the animation
    const shouldPause = progress == null && !props.autoPlay;
    useEffect(() => {
      if (shouldPause) {
        pause();
      }
    }, [shouldPause, pause]);

    // Toggle loop mode
    useEffect(() => {
      assertSkiaViewApi();
      SkiaViewApi.setJsiProperty(nativeId, 'loop', loop);
    }, [nativeId, loop]);
    //#endregion

    const { debug = false, ...viewProps } = props;

    return (
      <NativeSkiaSkottieView
        collapsable={false}
        nativeID={`${nativeId}`}
        debug={debug}
        {...viewProps}
        mode={initialShouldPlayRef.current ? 'continuous' : undefined}
      />
    );
  }
);

const assertSkiaViewApi = () => {
  if (
    SkiaViewApi === null ||
    SkiaViewApi.setJsiProperty === null ||
    SkiaViewApi.callJsiMethod === null ||
    SkiaViewApi.requestRedraw === null ||
    SkiaViewApi.makeImageSnapshot === null
  ) {
    throw Error('Skia View Api was not found.');
  }
};
