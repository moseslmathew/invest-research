# Lumina brand assets

## Files
- `prism-icon-dark.svg` / `prism-icon-light.svg` — standalone icon (dark = for dark backgrounds, light = for light backgrounds). Transparent background, scales to any size.
- `lumina-lockup-horizontal-dark.svg` / `-light.svg` — icon + LUMINA + Investment Research, horizontal.
- `lumina-lockup-stacked-dark.svg` / `-light.svg` — stacked/centered lockup.
- `prism-wait-icon.html` — animated wait/loading spinner. Copy the `<style>` block and `<svg>` into your app.

## Font
Lockups use **Manrope** (weights 300 & 500). Load it in your app so the SVG text renders correctly:

```html
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;500&display=swap" rel="stylesheet">
```

Inline the lockup SVGs into your HTML (rather than using `<img>`) for guaranteed font rendering.

## Wait icon usage
```html
<svg class="prism-wait" style="--dur: 2s" ...>  <!-- change --dur to speed up/slow down -->
```
Sizes: works from 24px up; 32–48px recommended inline.
