import * as pdfjsLib from 'pdfjs-dist';

// Try to use the local worker first, with a CDN fallback
const LOCAL_WORKER_URL = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

const CDN_WORKER_URL = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

// Set the worker source. We'll start with the local one.
pdfjsLib.GlobalWorkerOptions.workerSrc = LOCAL_WORKER_URL;

export type ThumbnailFormat = 'image/jpeg' | 'image/png';

export interface ThumbnailOptions {
  width: number;
  quality: number;
  style: 'plain' | 'shadow' | 'border' | 'rounded' | 'glossy';
  format: ThumbnailFormat;
}

export type OutputMode = 'thumb' | 'image' | 'both' | 'ai-photo' | 'ai-animation';

export interface PDFThumbnail {
  pageNumber: number;
  dataUrl?: string;
  highResDataUrl?: string;
  aiImageUrl?: string;
  aiVideoUrl?: string;
  aiPrompt?: string;
  fileName: string;
}

export async function getPageCount(file: File): Promise<number> {
  console.log(`[PDFUtils] Getting page count for: ${file.name}`);
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    console.log(`[PDFUtils] Successfully loaded PDF: ${file.name}, pages: ${pdf.numPages}`);
    return pdf.numPages;
  } catch (error) {
    console.warn(`[PDFUtils] Error with primary worker, trying fallback...`, error);
    // Fallback to CDN if local worker fails
    if (pdfjsLib.GlobalWorkerOptions.workerSrc !== CDN_WORKER_URL) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = CDN_WORKER_URL;
      return getPageCount(file);
    }
    console.error(`[PDFUtils] Error reading PDF ${file.name} even with fallback:`, error);
    throw error;
  }
}

export async function generateThumbnails(
  file: File,
  options: ThumbnailOptions & { outputMode: OutputMode },
  onProgress?: (progress: number) => void,
  onPageGenerated?: (thumb: PDFThumbnail) => void
): Promise<PDFThumbnail[]> {
  console.log(`[PDFUtils] Generating thumbnails for: ${file.name}, mode: ${options.outputMode}`);
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const thumbnails: PDFThumbnail[] = [];

    for (let i = 1; i <= numPages; i++) {
      console.log(`[PDFUtils] Rendering page ${i}/${numPages} for ${file.name}`);
      const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    
    let dataUrl: string | undefined;
    let highResDataUrl: string | undefined;

    // Generate standard thumbnail
    if (options.outputMode === 'thumb' || options.outputMode === 'both') {
      const scale = options.width / viewport.width;
      const scaledViewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        await page.render({ canvasContext: context as any, viewport: scaledViewport } as any).promise;
        dataUrl = canvas.toDataURL(options.format, options.format === 'image/jpeg' ? options.quality / 100 : undefined);
      }
    }

    // Generate high-res image
    if (options.outputMode === 'image' || options.outputMode === 'both') {
      const hrScale = 2500 / viewport.width;
      const hrViewport = page.getViewport({ scale: hrScale });
      const hrCanvas = document.createElement('canvas');
      const hrContext = hrCanvas.getContext('2d');
      if (hrContext) {
        hrCanvas.width = hrViewport.width;
        hrCanvas.height = hrViewport.height;
        await page.render({ canvasContext: hrContext as any, viewport: hrViewport } as any).promise;
        highResDataUrl = hrCanvas.toDataURL(options.format, options.format === 'image/jpeg' ? 0.95 : undefined);
      }
    }

    const thumb: PDFThumbnail = { 
      pageNumber: i, 
      dataUrl,
      highResDataUrl,
      fileName: file.name
    };

    thumbnails.push(thumb);
    if (onPageGenerated) {
      onPageGenerated(thumb);
    }

    if (onProgress) {
      onProgress((i / numPages) * 100);
    }
  }

  return thumbnails;
} catch (error) {
  console.warn(`[PDFUtils] Error with primary worker in generation, trying fallback...`, error);
  if (pdfjsLib.GlobalWorkerOptions.workerSrc !== CDN_WORKER_URL) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = CDN_WORKER_URL;
    return generateThumbnails(file, options, onProgress, onPageGenerated);
  }
  console.error(`[PDFUtils] Error generating thumbnails for ${file.name} even with fallback:`, error);
  throw error;
}
}
