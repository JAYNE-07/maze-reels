// Per-reel color schemes so every post is visually distinct.

export interface Palette {
  name: string;
  bg: string;      // background gradient stop A
  bgEnd: string;   // background gradient stop B
  wall: string;    // maze line color
  trail: string;   // solution trail behind the mascot
  text: string;    // headline text
  ctaBg: string;   // CTA card background
  ctaText: string; // CTA card text
}

export const PALETTES: Palette[] = [
  { name: 'Navy Cyan', bg: '#0a1a3a', bgEnd: '#15356b', wall: '#e6f4ff', trail: 'rgba(56,189,248,0.85)', text: '#ffffff', ctaBg: '#38bdf8', ctaText: '#062033' },
  { name: 'Sunset', bg: '#4a1d27', bgEnd: '#c25032', wall: '#fff4e0', trail: 'rgba(255,206,84,0.9)', text: '#fff4e0', ctaBg: '#ffce54', ctaText: '#3a1010' },
  { name: 'Mint Sage', bg: '#0f3a32', bgEnd: '#3d8c75', wall: '#f0fff4', trail: 'rgba(255,255,255,0.9)', text: '#f0fff4', ctaBg: '#a3f0c4', ctaText: '#0a2a24' },
  { name: 'Magenta Pop', bg: '#2c0a3d', bgEnd: '#a32fc5', wall: '#fff', trail: 'rgba(255,209,102,0.95)', text: '#fff', ctaBg: '#ffd166', ctaText: '#3a0e4a' },
  { name: 'Cream Ink', bg: '#f3ead8', bgEnd: '#e8dcb5', wall: '#1d1d1d', trail: 'rgba(255,71,71,0.8)', text: '#1d1d1d', ctaBg: '#1d1d1d', ctaText: '#f3ead8' },
  { name: 'Neon Night', bg: '#0a0a0f', bgEnd: '#191930', wall: '#34d399', trail: 'rgba(244,114,182,0.9)', text: '#f5d3ff', ctaBg: '#f472b6', ctaText: '#0a0a0f' },
  { name: 'Coral Teal', bg: '#0d3a3e', bgEnd: '#1b6a72', wall: '#ffe2d6', trail: 'rgba(255,138,118,0.95)', text: '#ffe2d6', ctaBg: '#ff8a76', ctaText: '#0d3a3e' },
  { name: 'Sky Cloud', bg: '#b3dffc', bgEnd: '#e2f2ff', wall: '#0b3a6b', trail: 'rgba(255,255,255,0.9)', text: '#0b3a6b', ctaBg: '#0b3a6b', ctaText: '#fff' },
  { name: 'Bold Red', bg: '#7a0014', bgEnd: '#c01024', wall: '#ffffff', trail: 'rgba(255,210,80,0.95)', text: '#ffffff', ctaBg: '#ffe34d', ctaText: '#7a0014' },
  { name: 'Purple Haze', bg: '#1a0938', bgEnd: '#5a2ba8', wall: '#e9d8ff', trail: 'rgba(167,243,208,0.9)', text: '#fff0ff', ctaBg: '#a7f3d0', ctaText: '#1a0938' },
  { name: 'Banana Berry', bg: '#2a0d3b', bgEnd: '#6e2b89', wall: '#fff7c2', trail: 'rgba(255,247,194,0.9)', text: '#fff7c2', ctaBg: '#fff7c2', ctaText: '#2a0d3b' },
  { name: 'Ocean Pop', bg: '#03252e', bgEnd: '#0e6471', wall: '#a7f3d0', trail: 'rgba(255,255,255,0.9)', text: '#e6fff7', ctaBg: '#facc15', ctaText: '#03252e' },
];

export const pick = <T,>(arr: T[], i: number): T => arr[((i % arr.length) + arr.length) % arr.length];
