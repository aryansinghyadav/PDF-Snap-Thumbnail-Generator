import * as pdfjsLib from 'pdfjs-dist';

// Set worker path to CDN for simplicity in this environment
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export type ThumbnailFormat = 'image/jpeg' | 'image/png';

export interface ThumbnailOptions {
  width: number;
  quality: number;
  style: 'plain' | 'shadow' | 'border' | 'rounded';
  format: ThumbnailFormat;
}

export type OutputMode = 'thumb' | 'image' | 'both';

export interface PDFThumbnail {
  pageNumber: number;
  dataUrl?: string;
  highResDataUrl?: string;
  fileName: string;
}

export async function getPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  return pdf.numPages;
}

export async function generateThumbnails(
  file: File,
  options: ThumbnailOptions & { outputMode: OutputMode },
  onProgress?: (progress: number) => void,
  onPageGenerated?: (thumb: PDFThumbnail) => void
): Promise<PDFThumbnail[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const thumbnails: PDFThumbnail[] = [];

  for (let i = 1; i <= numPages; i++) {
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
}
