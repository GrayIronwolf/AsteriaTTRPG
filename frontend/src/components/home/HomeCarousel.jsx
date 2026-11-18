import React, { useEffect, useRef, useState } from 'react';
import { createDisposableScope } from '../../runtime/disposableScope.mjs';
import {
  HOME_SLIDES, HOME_CAROUSEL_INTERVAL_MS, wrapSlideIndex
} from '../../home/homeContent.mjs';
import styles from './HomeCarousel.module.css';

/**
 * Standalone React carousel. One state owner, no legacy listeners or global
 * timer. All page/document/observer subscriptions are disposed on unmount.
 */
export function HomeCarousel() {
  const rootRef = useRef(null);
  const gestureStart = useRef(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [announcement, setAnnouncement] = useState('');
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const scope = createDisposableScope();
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(media.matches);
    setPageVisible(!document.hidden);
    scope.listen(media, 'change', event => setReducedMotion(event.matches));
    scope.listen(document, 'visibilitychange', () => setPageVisible(!document.hidden));

    if ('IntersectionObserver' in window && rootRef.current) {
      const observer = new IntersectionObserver(entries => {
        setInView(Boolean(entries[0]?.isIntersecting));
      }, { threshold: 0.1 });
      observer.observe(rootRef.current);
      scope.own(() => observer.disconnect());
    }

    return () => scope.dispose();
  }, []);

  const isPlaying = !reducedMotion && pageVisible && inView && !hovered && !focused;

  useEffect(() => {
    if (!isPlaying || HOME_SLIDES.length < 2) return undefined;
    const timeout = window.setTimeout(() => {
      setSlideIndex(current => wrapSlideIndex(current + 1));
    }, HOME_CAROUSEL_INTERVAL_MS);
    return () => window.clearTimeout(timeout);
  }, [isPlaying, slideIndex]);

  function selectSlide(next) {
    const selected = wrapSlideIndex(next);
    setSlideIndex(selected);
    setAnnouncement('Image ' + (selected + 1) + ' of ' + HOME_SLIDES.length);
  }

  function onKeyboard(event) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      selectSlide(slideIndex + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      selectSlide(slideIndex - 1);
    }
  }

  function onSwipeStart(event) {
    const touch = event.changedTouches?.[0];
    gestureStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function onSwipeEnd(event) {
    const start = gestureStart.current;
    gestureStart.current = null;
    const touch = event.changedTouches?.[0];
    if (!start || !touch) return;
    const x = touch.clientX - start.x;
    const y = touch.clientY - start.y;
    // Ignore vertical scrolling to avoid swallowing mobile-page gestures.
    if (Math.abs(x) > 60 && Math.abs(x) > Math.abs(y)) {
      selectSlide(slideIndex + (x < 0 ? 1 : -1));
    }
  }

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Asteria featured artwork"
      data-testid="site-home-carousel"
      className={styles.carousel}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onKeyDown={onKeyboard}
      onTouchStart={onSwipeStart}
      onTouchEnd={onSwipeEnd}
      style={{ '--home-carousel-duration': HOME_CAROUSEL_INTERVAL_MS + 'ms' }}
    >
      <div className={styles.artwork}>
        {HOME_SLIDES.map((slide, index) => (
          <div
            key={slide.id}
            className={[styles.slide, index === slideIndex ? styles.active : ''].filter(Boolean).join(' ')}
            aria-hidden={index !== slideIndex}
            data-testid={index === 0 ? 'site-hero-image' : 'site-home-slide-' + slide.id}
          >
            <img
              src={slide.src}
              alt={slide.alt}
              decoding="async"
              loading={index === 0 ? 'eager' : 'lazy'}
              fetchpriority={index === 0 ? 'high' : undefined}
              draggable={false}
            />
          </div>
        ))}
      </div>
      <div className={styles.controls} role="group" aria-label="Featured artwork controls">
        <button className={styles.arrow} type="button" aria-label="Previous image"
          onClick={() => selectSlide(slideIndex - 1)} data-testid="site-carousel-prev">
          <span aria-hidden="true">‹</span>
        </button>
        <div className={styles.dots} role="group" aria-label="Choose artwork">
          {HOME_SLIDES.map((slide, index) => (
            <button
              className={styles.dot}
              key={slide.id}
              type="button"
              aria-label={'Show image ' + (index + 1) + ' of ' + HOME_SLIDES.length}
              aria-pressed={index === slideIndex}
              data-testid={'site-carousel-dot-' + index}
              onClick={() => selectSlide(index)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
        <button className={styles.arrow} type="button" aria-label="Next image"
          onClick={() => selectSlide(slideIndex + 1)} data-testid="site-carousel-next">
          <span aria-hidden="true">›</span>
        </button>
        <div className={styles.progress} aria-hidden="true">
          <span
            key={slideIndex + '-' + (isPlaying ? 'running' : 'stopped')}
            className={isPlaying ? styles.progressRunning : styles.progressStopped}
            data-testid="site-carousel-progress"
          />
        </div>
      </div>
      <span className={styles.srOnly} aria-live="polite" aria-atomic="true">{announcement}</span>
    </div>
  );
}
