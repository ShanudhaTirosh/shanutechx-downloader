# Icon Setup

## Current Status
An SVG icon has been created at `build/icon.svg`. You need to convert it to ICO format for Windows.

## How to Generate ICO File

### Option 1: Online Converter (Easiest)
1. Go to https://convertico.com/ or https://icoconvert.com/
2. Upload the `icon.svg` file
3. Select sizes: 256x256, 128x128, 64x64, 48x48, 32x32, 16x16
4. Download as `icon.ico`
5. Place the `icon.ico` file in this `build/` directory

### Option 2: Using ImageMagick (If installed)
```bash
magick convert icon.svg -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```

### Option 3: Using Inkscape (If installed)
1. Open `icon.svg` in Inkscape
2. Export as PNG at 256x256
3. Use an online ICO converter to convert the PNG to ICO

## Required Files for electron-builder

- **Windows**: `build/icon.ico` (multi-size ICO file)
- The electron-builder.yml already references this file

## Temporary Workaround

Until you create the ICO file, the build might fail. You can:
1. Comment out the `icon:` line in electron-builder.yml temporarily
2. Or use a default Windows icon

## Icon Design

The current icon features:
- Purple gradient background
- White download arrow pointing down
- Motion lines for speed effect
- Download tray/platform at bottom
- Modern, clean design
