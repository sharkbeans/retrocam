// The ProCCD "2000S" recipe — ported 1:1 from proccd.py PARAMS.
// This is the single source of truth for the look. Tweak, reload, compare.
// Every value here maps to a uniform in the WebGL shaders (see filter.js).
export const PARAMS = {
  // 1. low-res softening: render into a short-side=480 buffer, then blow back up
  downres_short_side: 560,
  softness: 0.35,

  // 2. split-tone: RGB nudges pushed into shadows / highlights
  shadow_tint: [-0.04, 0.01, 0.09],
  highlight_tint: [-0.02, 0.0, 0.03],
  shadow_strength: 0.55,
  highlight_strength: 0.35,
  tone_falloff: 1.4,

  // 3. contrast + color
  contrast: 0.16,
  black_point: 0.0,
  lift: 0.05,
  saturation: 1.12,

  // 4. highlight bloom / halation
  bloom_threshold: 0.72,
  bloom_radius: 14,
  bloom_strength: 0.55,

  // 5. chromatic aberration (radial channel separation)
  ca_amount: 0.004,

  // 6. chroma noise (cheap-sensor colored speckle)
  noise_sigma: 0.045,
  noise_scale: 2,
  noise_shadow_bias: 1.3,

  // 7. vignette
  vignette_strength: 0.35,

  // 8. date/time stamp (drawn on the 2D compositor, not in GL)
  stamp_color: [255, 150, 40],
  stamp_scale: 0.038
};

// Master intensity dial (0..1) for the on-screen slider. Scales the "extra"
// effects toward a clean image at 0 and full ProCCD at 1, by interpolating the
// strength-like params from neutral. Structure/order of the pipeline is fixed.
export function scaleParams(p, k) {
  const lerp = (a, b, t) => a + (b - a) * t;
  const s = { ...p };
  s.softness = lerp(0, p.softness, k);
  s.shadow_strength = lerp(0, p.shadow_strength, k);
  s.highlight_strength = lerp(0, p.highlight_strength, k);
  s.contrast = lerp(0, p.contrast, k);
  s.lift = lerp(0, p.lift, k);
  s.saturation = lerp(1, p.saturation, k);
  s.bloom_strength = lerp(0, p.bloom_strength, k);
  s.ca_amount = lerp(0, p.ca_amount, k);
  s.noise_sigma = lerp(0, p.noise_sigma, k);
  s.vignette_strength = lerp(0, p.vignette_strength, k);
  return s;
}
