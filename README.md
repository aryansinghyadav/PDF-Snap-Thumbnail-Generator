<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>



The PDF Snap Thumbnail Generator has been upgraded to a powerful batch processing tool with advanced format and resolution controls.
I have updated the application to include the requested visual styles and added a new 'Glossy' option for even more customization.
Visual Styles Implemented:
Plain: Standard, clean look.
Shadow: Adds a deep, professional 2D shadow.
Border: Adds a subtle stroke around the thumbnail.
Rounded: Softens the corners for a modern feel.
Glossy (New): Adds a high-end reflective effect with a subtle ring and gradient.
Unique Features of PDF Snap:
Local-First Privacy: Unlike other tools, PDF Snap processes everything entirely in your browser. Your sensitive PDF documents are never uploaded to a server, ensuring 100% data privacy.
Experimental "Direct Save": Leverages the modern File System Access API to save generated images directly into a folder on your computer, bypassing the need to manually download ZIP files or individual images.
Interactive "Think Mode": A unique visualization of the rendering pipeline that shows you the internal steps (analyzing, rendering, optimizing) as the app processes your files.
Power-User Keyboard Shortcuts: Control the entire app without a mouse. Use Ctrl+Enter to process, Esc to reset, and Alt + Arrow Keys to adjust size and quality on the fly.
High-Resolution Rendering: Supports professional-grade outputs up to 4K resolution, with intelligent presets for Mobile and HD.
Real-Time Incremental Previews: Thumbnails appear as they are generated, allowing you to preview and download specific pages even before the entire batch is finished.
Structured ZIP Export: Automatically organizes your assets into a clean folder structure within a single ZIP file, separated by PDF name and resolution.
Reorderable Queue: Easily change the processing order of your files using a smooth drag-and-drop interface powered by motion/react.


# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/66fa8d8e-d6a1-4f95-8bfb-8669e0c4f9a0

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
