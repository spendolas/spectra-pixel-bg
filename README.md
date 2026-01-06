# spectra-pixel-bg

Live site: https://www.spendolas.com/

## How to add presets

Edit `presets.js` and add entries to `PRESETS`:

```js
export const PRESETS = [
  {
    name: "My Preset",
    options: {
      mode: "pixel",
      field: { noiseType: "value", fractalType: "fbm" },
    },
  },
];
```
