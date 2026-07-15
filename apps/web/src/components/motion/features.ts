// Separate module so the animation renderer code-splits out of the main bundle
// (LazyMotion async features pattern).
export { domAnimation as default } from 'motion/react';
