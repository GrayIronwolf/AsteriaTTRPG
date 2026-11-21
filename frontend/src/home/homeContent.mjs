import spider from '../../../assets/home/asteria-home-spider.webp';
import logo from '../../../assets/home/asteria-home-logo.webp';
import dragon from '../../../assets/home/asteria-home-dragon.webp';
import varkhyn from '../../../assets/home/asteria-home-varkhyn.webp';

export const HOME_CAROUSEL_INTERVAL_MS = 15000;

export const HOME_SLIDES = Object.freeze([
  Object.freeze({
    id: 'spider',
    src: spider,
    alt: 'A giant winged spider surrounded by a swarm over a mountain city'
  }),
  Object.freeze({
    id: 'logo',
    src: logo,
    alt: 'Asteria TTRPG silver logo against a storm-lit blue fantasy sky'
  }),
  Object.freeze({
    id: 'dragon',
    src: dragon,
    alt: 'A blue dragon flying above a moonlit fantasy kingdom'
  }),
  Object.freeze({
    id: 'varkhyn',
    src: varkhyn,
    alt: 'A snow-covered Varkhyn with glowing red eyes in a blizzard'
  })
]);

export const HOME_ACTIONS = Object.freeze([
  Object.freeze({ id: 'explore-world', label: 'Explore the World', href: '#/compendium?group=world&category=worlds' }),
  Object.freeze({ id: 'open-handbook', label: 'Open Handbook', href: '#/compendium?group=rules&category=handbook' }),
  Object.freeze({
    id: 'my-characters',
    label: 'My Characters',
    href: '#/character-forge?view=my-characters',
    requiresAccount: true
  })
]);

export function wrapSlideIndex(index, count = HOME_SLIDES.length) {
  if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1) {
    throw new RangeError('Carousel index and count must be integers with a positive count');
  }
  return ((index % count) + count) % count;
}
