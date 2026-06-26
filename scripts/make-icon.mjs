// Builds icon/splash source images for @capacitor/assets from the flowering
// plant art. Output goes to ./assets, which `npx capacitor-assets generate`
// then turns into every Android launcher/splash size.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const SRC = 'flower/Flowering.png';
const ICON = 1024;
const SPLASH = 2732;
const LIGHT = { r: 0xf5, g: 0xe6, b: 0xc5, alpha: 1 }; // warm parchment
const DARK = { r: 0x2b, g: 0x20, b: 0x14, alpha: 1 };  // dark soil
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

await mkdir('assets', { recursive: true });

// Plant scaled to a fraction of the canvas height, preserving aspect ratio.
const plantAt = (canvas, heightFrac) =>
  sharp(SRC).resize({ height: Math.round(canvas * heightFrac) }).toBuffer();

const canvas = (size, bg, composite) => {
  const img = sharp({ create: { width: size, height: size, channels: 4, background: bg } });
  return (composite ? img.composite([{ input: composite, gravity: 'center' }]) : img).png();
};

// Adaptive icon: plant kept within the ~66% center "safe zone" so launcher
// masks (circle/squircle) never clip it.
const iconPlant = await plantAt(ICON, 0.66);
await canvas(ICON, LIGHT).toFile('assets/icon-background.png');
await canvas(ICON, TRANSPARENT, iconPlant).toFile('assets/icon-foreground.png');
await canvas(ICON, LIGHT, iconPlant).toFile('assets/icon-only.png');

// Splash screens (light + dark), plant centered smaller with breathing room.
const splashPlant = await plantAt(SPLASH, 0.30);
await canvas(SPLASH, LIGHT, splashPlant).toFile('assets/splash.png');
await canvas(SPLASH, DARK, splashPlant).toFile('assets/splash-dark.png');

console.log('Wrote icon + splash source images to ./assets');
