# PixelGrid Cloud tool

This tool takes truecolor images of arbitrary size and resizes them to target dimension(s) and then reduces them to a predetermined palette, optionally using dithering.
It can also then make a reference image for hand pixeling (without an overlay tool like Blue Marble) buy enlarging every pixel by a multiplier, and overlaying a contrasting grid to make it easier to see pixel boundaries in large constant color areas.

This is not a script to draw the image on wplace for you. We don't do botting. It's just a tool to help you create a reference image that humans can follow to design an image to draw by hand.

It's entirely Javascript and runs only in your browser. There's no server processing. It's hosted on Cloudflare Pages.

# URLs

## Live site
[ https://pixelgrid.cloud/ ] ( https://pixelgrid.cloud/ )

## Staging site (staging branch, preparing for deployment to live)
[ https://staging.pixelgrid.cloud/ ] ( https://staging.pixelgrid.cloud/ )

## Dev Site (dev branch -- beware of dragons)
[ https://dev.pixelgrid.cloud/ ] ( https://dev.pixelgrid.cloud/ )


# Instructions

1. Choose a file (PNG or JPG supported).

2. Set the X and/or Y pixel output size (if you only set one, the other will be computed proportionally). Defaults to 512 wide, which is pretty big to draw by hand.

3. Choose the resize filtering method (bilinear or bicubic). Either should be fine.

4. Choose the palette. Basic is the "free" wplace 32-color palette. Extended is the 64-color palette that's not free.

5. Choose dithering, or not. Dithering can make true-color images look a lot better but approximating missing colors with regular or noise-based patterns of available colors.

6. Choose whether you want blocky upscaling and a grid, and set the scale/grid size and overlay grid color. This blows up each final pixel using nearest neighbor (non-interpolated) enlarge by a factor of x (defaults to 5) and then overlays a grid of user-defined color (defaults to magenta) to help you see individual pixels in a large mass of common color. You do not want this step if you're using Blue Marble ( https://github.com/erickcastillovillegas-hub/wplace-bluemarble )

7. Click the Download PNG button to download an image locally (with the optional upscaling/grid).

