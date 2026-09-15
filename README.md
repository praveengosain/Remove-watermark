# Watermark Removal Tool

A simple client-side image retouching tool for GitHub Pages.

## Features

- Upload PNG, JPG/JPEG, or WebP images
- Paint over a watermark/unwanted area
- Erase parts of the selection
- OpenCV.js inpainting with Telea or Navier-Stokes methods
- Brush-size and inpainting-radius controls
- Reset and download
- No backend required: image processing happens in the browser

## Deploy on GitHub Pages

1. Create a GitHub repository.
2. Upload `index.html`, `style.css`, `app.js`, and `README.md` to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select your main branch and `/ (root)`.
6. Save and wait for GitHub to publish the site.

Your page will normally be available at:

`https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`

## Important

Use this tool only for images you own or have permission to modify. It is intended for legitimate image restoration/retouching, not for removing ownership or attribution marks from images without permission.

## Dependency

The app loads OpenCV.js from the official OpenCV documentation CDN at runtime, so the repository itself does not need to contain the large OpenCV library.
