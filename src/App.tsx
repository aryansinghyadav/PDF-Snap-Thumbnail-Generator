import React, { useState, useRef, useEffect } from 'react';
import { 
  FileUp, 
  Download, 
  Settings2, 
  Trash2, 
  FileText, 
  Loader2, 
  Image as ImageIcon,
  Layers,
  X,
  Eye,
  Sparkles,
  Zap,
  GripVertical,
  Github,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Video,
  Camera,
  BrainCircuit
} from 'lucide-react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import confetti from 'canvas-confetti';
import JSZip from 'jszip';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { generateThumbnails, getPageCount, type PDFThumbnail, type ThumbnailOptions, type ThumbnailFormat, type OutputMode } from '@/src/lib/pdf-utils';
import { generateAICreative } from '@/src/lib/ai-utils';
import { cn } from '@/lib/utils';

interface QueuedFile {
  id: string;
  file: File;
  pageCount?: number;
}

export default function App() {
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [thumbnails, setThumbnails] = useState<PDFThumbnail[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedThumb, setSelectedThumb] = useState<PDFThumbnail | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkSteps, setThinkSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showLegal, setShowLegal] = useState<'privacy' | 'terms' | 'support' | null>(null);
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  
  const isBusy = isProcessing || isZipping;
  const abortControllerRef = useRef<boolean>(false);

  const [options, setOptions] = useState<ThumbnailOptions & { outputMode: OutputMode }>({
    width: 300,
    quality: 85,
    style: 'shadow',
    format: 'image/jpeg',
    outputMode: 'ai-photo',
  });
  const [resolutionPreset, setResolutionPreset] = useState('custom');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Enter to Process
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (files.length > 0 && !isBusy) {
          processBatch();
        }
      }
      // Esc to clear selection or close modal
      if (e.key === 'Escape') {
        if (selectedThumb) {
          setSelectedThumb(null);
        } else if (files.length > 0 && !isBusy) {
          reset();
        }
      }

      // Alt + Arrows for Size and Quality
      if (e.altKey && !isBusy) {
        const step = e.shiftKey ? 4 : 1; // 4x step if shift is held

        // Size (Alt + Up/Down)
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setOptions(prev => ({ ...prev, width: Math.min(1200, prev.width + (50 * step)) }));
          setResolutionPreset('custom');
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setOptions(prev => ({ ...prev, width: Math.max(100, prev.width - (50 * step)) }));
          setResolutionPreset('custom');
        }

        // Quality (Alt + Left/Right) - Only for JPEG
        if (options.format === 'image/jpeg') {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            setOptions(prev => ({ ...prev, quality: Math.min(100, prev.quality + (5 * step)) }));
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setOptions(prev => ({ ...prev, quality: Math.max(10, prev.quality - (5 * step)) }));
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [files, isBusy, selectedThumb, options.format]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []) as File[];
    const pdfFiles = selectedFiles.filter(f => f.type === 'application/pdf');
    
    if (pdfFiles.length > 0) {
      setError(null);
      const newQueuedFiles: QueuedFile[] = await Promise.all(
        pdfFiles.map(async (f) => {
          try {
            const pageCount = await getPageCount(f);
            return {
              id: `${f.name}-${Date.now()}-${Math.random()}`,
              file: f,
              pageCount
            };
          } catch (err) {
            setError(`Failed to read ${f.name}. It might be corrupted or protected.`);
            return {
              id: `${f.name}-${Date.now()}-${Math.random()}`,
              file: f,
              pageCount: undefined
            };
          }
        })
      );
      setFiles(prev => [...prev, ...newQueuedFiles]);
      setThumbnails([]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files || []) as File[];
    const pdfFiles = droppedFiles.filter(f => f.type === 'application/pdf');
    
    if (pdfFiles.length > 0) {
      setError(null);
      const newQueuedFiles: QueuedFile[] = await Promise.all(
        pdfFiles.map(async (f) => {
          try {
            const pageCount = await getPageCount(f);
            return {
              id: `${f.name}-${Date.now()}-${Math.random()}`,
              file: f,
              pageCount
            };
          } catch (err) {
            setError(`Failed to read ${f.name}. It might be corrupted or protected.`);
            return {
              id: `${f.name}-${Date.now()}-${Math.random()}`,
              file: f,
              pageCount: undefined
            };
          }
        })
      );
      setFiles(prev => [...prev, ...newQueuedFiles]);
      setThumbnails([]);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    setThumbnails([]);
  };

  const processBatch = async () => {
    if (files.length === 0) return;
    
    abortControllerRef.current = false;
    setIsProcessing(true);
    setBatchProgress(0);
    setIsThinking(true);
    setThinkSteps([]);

    const addStep = (step: string) => {
      setThinkSteps(prev => [...prev, step]);
    };

    addStep("Initializing batch processing engine...");
    await new Promise(r => setTimeout(r, 600));
    if (abortControllerRef.current) return;
    
    // Step 1: Initialize placeholders for all pages
    addStep("Analyzing PDF structures and counting pages...");
    const initialThumbnails: PDFThumbnail[] = [];
    for (const queued of files) {
      if (abortControllerRef.current) break;
      try {
        const pageCount = queued.pageCount || await getPageCount(queued.file);
        addStep(`Found ${pageCount} pages in ${queued.file.name}`);
        for (let p = 1; p <= pageCount; p++) {
          initialThumbnails.push({
            pageNumber: p,
            fileName: queued.file.name,
            dataUrl: undefined,
            highResDataUrl: undefined
          });
        }
      } catch (err) {
        console.error(`Error getting page count for ${queued.file.name}:`, err);
      }
    }
    if (abortControllerRef.current) {
      setIsThinking(false);
      setIsProcessing(false);
      return;
    }
    setThumbnails(initialThumbnails);
    await new Promise(r => setTimeout(r, 400));
    if (abortControllerRef.current) return;
    
    // Step 2: Process each file and update state incrementally
    addStep(`Starting rendering pipeline for ${files.length} files...`);
    for (let i = 0; i < files.length; i++) {
      if (abortControllerRef.current) break;
      setCurrentFileIndex(i);
      addStep(`Processing ${files[i].file.name} (${options.outputMode} mode)...`);
      
      try {
        if (options.outputMode === 'ai-photo' || options.outputMode === 'ai-animation') {
          addStep(`Analyzing document content with Gemini AI...`);
          // For AI modes, we just use the first page as context
          const firstPageThumbs = await generateThumbnails(files[i].file, { ...options, outputMode: 'thumb', width: 800 });
          const firstPageBase64 = firstPageThumbs[0].dataUrl?.split(',')[1];
          
          if (firstPageBase64) {
            addStep(`Generating ${options.outputMode === 'ai-photo' ? 'real photo' : 'cinematic animation'}...`);
            const aiResult = await generateAICreative(firstPageBase64, options.outputMode === 'ai-photo' ? 'photo' : 'animation');
            
            const newThumb: PDFThumbnail = {
              pageNumber: 1,
              fileName: files[i].file.name,
              aiImageUrl: aiResult.imageUrl,
              aiVideoUrl: aiResult.videoUrl,
              aiPrompt: aiResult.prompt
            };

            setThumbnails(prev => prev.map(t => 
              (t.fileName === newThumb.fileName && t.pageNumber === 1) 
                ? newThumb 
                : t
            ));

            if (directoryHandle) {
              await saveToDirectory(newThumb);
            }
          }
        } else {
          await generateThumbnails(
            files[i].file, 
            options, 
            undefined, 
            async (newThumb) => {
              if (abortControllerRef.current) return;
              setThumbnails(prev => prev.map(t => 
                (t.fileName === newThumb.fileName && t.pageNumber === newThumb.pageNumber) 
                  ? newThumb 
                  : t
              ));
              if (directoryHandle) {
                await saveToDirectory(newThumb);
              }
            }
          );
        }
        setBatchProgress(Math.round(((i + 1) / files.length) * 100));
      } catch (error) {
        console.error(`Error processing ${files[i].file.name}:`, error);
        addStep(`Error: Failed to process ${files[i].file.name}`);
      }
    }
    
    if (!abortControllerRef.current) {
      addStep("Finalizing assets and optimizing output...");
      await new Promise(r => setTimeout(r, 800));
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#3b82f6', '#2dd4bf', '#f59e0b', '#ef4444']
      });
    }

    setIsThinking(false);
    setIsProcessing(false);
  };

  const cancelProcess = () => {
    abortControllerRef.current = true;
    setIsThinking(false);
    setIsProcessing(false);
    setBatchProgress(0);
    setThinkSteps(prev => [...prev, "Process cancelled by user."]);
  };

  const downloadAllAsZip = async () => {
    if (thumbnails.length === 0) return;
    setIsZipping(true);
    const zip = new JSZip();
    const ext = options.format === 'image/jpeg' ? 'jpg' : 'png';

    for (const thumb of thumbnails) {
      const baseName = thumb.fileName.replace('.pdf', '');
      
      if (thumb.dataUrl) {
        const base64Data = thumb.dataUrl.split(',')[1];
        zip.file(`${baseName}/thumbnails/page_${thumb.pageNumber}.${ext}`, base64Data, { base64: true });
      }
      
      if (thumb.highResDataUrl) {
        const base64Data = thumb.highResDataUrl.split(',')[1];
        zip.file(`${baseName}/high-res/page_${thumb.pageNumber}_highres.${ext}`, base64Data, { base64: true });
      }

      if (thumb.aiImageUrl) {
        const base64Data = thumb.aiImageUrl.split(',')[1];
        zip.file(`${baseName}/ai-creative/photo_${thumb.pageNumber}.png`, base64Data, { base64: true });
      }

      if (thumb.aiVideoUrl) {
        try {
          const response = await fetch(thumb.aiVideoUrl);
          const blob = await response.blob();
          zip.file(`${baseName}/ai-creative/animation_${thumb.pageNumber}.mp4`, blob);
        } catch (err) {
          console.error("Failed to include video in zip:", err);
        }
      }
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `pdf_snap_export_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsZipping(false);
  };

  const downloadThumbnail = async (url: string, fileName: string, page: number, type: 'thumb' | 'highres' | 'ai-photo' | 'ai-video' = 'thumb') => {
    const link = document.createElement('a');
    
    if (type === 'ai-video') {
      const response = await fetch(url);
      const blob = await response.blob();
      link.href = URL.createObjectURL(blob);
    } else {
      link.href = url;
    }

    const ext = type === 'ai-video' ? 'mp4' : (options.format === 'image/jpeg' ? 'jpg' : 'png');
    const suffix = type === 'highres' ? '_highres' : (type === 'ai-photo' ? '_ai_photo' : (type === 'ai-video' ? '_ai_anim' : ''));
    link.download = `${fileName.replace('.pdf', '')}_page_${page}${suffix}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (type === 'ai-video') URL.revokeObjectURL(link.href);
  };

  const reset = () => {
    setFiles([]);
    setThumbnails([]);
    setBatchProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const selectDirectory = async () => {
    try {
      // @ts-ignore - File System Access API
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      setDirectoryHandle(handle);
    } catch (err) {
      console.error("Directory selection failed:", err);
    }
  };

  const saveToDirectory = async (thumb: PDFThumbnail) => {
    if (!directoryHandle) return;

    try {
      const baseName = thumb.fileName.replace('.pdf', '');
      const ext = options.format === 'image/jpeg' ? 'jpg' : 'png';
      
      // Create folder for the file
      const fileFolder = await directoryHandle.getDirectoryHandle(baseName, { create: true });
      
      if (thumb.dataUrl) {
        const thumbFolder = await fileFolder.getDirectoryHandle('thumbnails', { create: true });
        const fileName = `page_${thumb.pageNumber}.${ext}`;
        const fileHandle = await thumbFolder.getFileHandle(fileName, { create: true });
        // @ts-ignore
        const writable = await fileHandle.createWritable();
        const response = await fetch(thumb.dataUrl);
        const blob = await response.blob();
        await writable.write(blob);
        await writable.close();
      }

      if (thumb.highResDataUrl) {
        const hrFolder = await fileFolder.getDirectoryHandle('high-res', { create: true });
        const fileName = `page_${thumb.pageNumber}_highres.${ext}`;
        const fileHandle = await hrFolder.getFileHandle(fileName, { create: true });
        // @ts-ignore
        const writable = await fileHandle.createWritable();
        const response = await fetch(thumb.highResDataUrl);
        const blob = await response.blob();
        await writable.write(blob);
        await writable.close();
      }
    } catch (err) {
      console.error("Error saving to directory:", err);
    }
  };

  const handleResolutionChange = (val: string) => {
    setResolutionPreset(val);
    if (val === 'hd') setOptions(prev => ({ ...prev, width: 1920 }));
    else if (val === '4k') setOptions(prev => ({ ...prev, width: 3840 }));
    else if (val === 'mobile') setOptions(prev => ({ ...prev, width: 400 }));
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans selection:bg-blue-100">
        {/* Header */}
        <header className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                <FileText className="text-white w-6 h-6" />
              </div>
              <div>
                <h1 className="font-bold text-lg tracking-tight">PDF Snap</h1>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Batch Thumbnail Generator</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {files.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={reset} 
                      disabled={isBusy}
                      className="text-slate-500 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Clear All
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset queue and previews (Esc)</TooltipContent>
                </Tooltip>
              )}
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 font-medium">
                v1.3.0
              </Badge>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8">
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl flex items-center gap-3 shadow-sm"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{error}</p>
              <Button 
                variant="ghost" 
                size="icon-xs" 
                onClick={() => setError(null)}
                className="ml-auto text-red-600 hover:bg-red-100"
              >
                <X className="w-4 h-4" />
              </Button>
            </motion.div>
          )}
          <div className="grid lg:grid-cols-[350px_1fr] gap-8">
            
            {/* Sidebar Settings */}
            <aside className="space-y-6">
              <Card className="border-slate-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b pb-4">
                  <div className="flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-blue-600" />
                    <CardTitle className="text-sm font-semibold uppercase tracking-wider text-slate-700">Configuration</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Output Mode */}
                  <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-2">
                      <Sparkles className="w-3 h-3" />
                      Generation Mode
                    </Label>
                    <Tabs 
                      value={options.outputMode} 
                      onValueChange={(val) => setOptions(prev => ({ ...prev, outputMode: val as OutputMode }))}
                      className="w-full"
                      disabled={isBusy}
                    >
                      <TabsList className="grid w-full grid-cols-5 h-auto p-1 gap-1 bg-slate-100/50">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <TabsTrigger value="thumb" className="text-[9px] py-2">
                              <ImageIcon className="w-3 h-3 mb-1 block mx-auto" />
                              Thumb
                            </TabsTrigger>
                          </TooltipTrigger>
                          <TooltipContent>Standard previews</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <TabsTrigger value="image" className="text-[9px] py-2">
                              <ImageIcon className="w-3 h-3 mb-1 block mx-auto" />
                              Image
                            </TabsTrigger>
                          </TooltipTrigger>
                          <TooltipContent>High-res images</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <TabsTrigger value="both" className="text-[9px] py-2">
                              <Layers className="w-3 h-3 mb-1 block mx-auto" />
                              Both
                            </TabsTrigger>
                          </TooltipTrigger>
                          <TooltipContent>Both formats</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <TabsTrigger value="ai-photo" className="text-[9px] py-2 bg-blue-50 data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                              <Camera className="w-3 h-3 mb-1 block mx-auto" />
                              AI Photo
                            </TabsTrigger>
                          </TooltipTrigger>
                          <TooltipContent>AI-generated "real" photo</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <TabsTrigger value="ai-animation" className="text-[9px] py-2 bg-purple-50 data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                              <Video className="w-3 h-3 mb-1 block mx-auto" />
                              AI Anim
                            </TabsTrigger>
                          </TooltipTrigger>
                          <TooltipContent>AI-generated cinematic video</TooltipContent>
                        </Tooltip>
                      </TabsList>
                    </Tabs>
                  </div>

                  {/* Format Selection */}
                  <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase text-slate-500">Output Format</Label>
                    <Tabs 
                      defaultValue="image/jpeg" 
                      onValueChange={(val) => setOptions(prev => ({ ...prev, format: val as ThumbnailFormat }))}
                      className="w-full"
                      disabled={isBusy}
                    >
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="image/jpeg">JPEG</TabsTrigger>
                        <TabsTrigger value="image/png">PNG</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>

                  {/* Resolution Preset */}
                  <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase text-slate-500">Resolution Preset</Label>
                    <Select 
                      value={resolutionPreset} 
                      onValueChange={handleResolutionChange}
                      disabled={isBusy}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select resolution" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="custom">Custom Size</SelectItem>
                        <SelectItem value="mobile">Mobile (400px)</SelectItem>
                        <SelectItem value="hd">HD (1920px)</SelectItem>
                        <SelectItem value="4k">4K (3840px)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Size Slider (only if custom) */}
                  {resolutionPreset === 'custom' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <Label className="text-sm font-medium">Width</Label>
                        <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded">{options.width}px</span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="pt-2">
                            <Slider 
                              value={[options.width]} 
                              min={100} 
                              max={1200} 
                              step={10}
                              onValueChange={(val: number[]) => setOptions(prev => ({ ...prev, width: val[0] }))}
                              disabled={isBusy}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="text-[10px]">Use <kbd className="bg-slate-800 text-white px-1 rounded">Alt + ↑/↓</kbd> to adjust</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}

                  {/* Quality Slider (only for JPEG) */}
                  {options.format === 'image/jpeg' && (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <Label className="text-sm font-medium">JPEG Quality</Label>
                        <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded">{options.quality}%</span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="pt-2">
                            <Slider 
                              value={[options.quality]} 
                              min={10} 
                              max={100} 
                              step={1}
                              onValueChange={(val: number[]) => setOptions(prev => ({ ...prev, quality: val[0] }))}
                              disabled={isBusy}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="text-[10px]">Use <kbd className="bg-slate-800 text-white px-1 rounded">Alt + ←/→</kbd> to adjust</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}

                  {/* Style Selection */}
                  <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase text-slate-500">Visual Style</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['plain', 'shadow', 'border', 'rounded', 'glossy'] as const).map((style) => (
                        <Button
                          key={style}
                          variant={options.style === style ? 'default' : 'outline'}
                          size="sm"
                          className="capitalize text-xs h-9"
                          onClick={() => setOptions(prev => ({ ...prev, style }))}
                          disabled={isBusy}
                        >
                          {style}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {/* Direct Save Option */}
                  <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase text-slate-500 flex items-center gap-2">
                      <FolderOpen className="w-3 h-3" />
                      Direct Save (Experimental)
                    </Label>
                    <div className="space-y-2">
                      {directoryHandle ? (
                        <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 p-2 rounded-lg">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span className="text-[10px] font-medium text-emerald-800 truncate">
                              Saving to: {directoryHandle.name}
                            </span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon-xs" 
                            onClick={() => setDirectoryHandle(null)}
                            disabled={isBusy}
                            className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full text-xs border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/50"
                          onClick={selectDirectory}
                          disabled={isBusy}
                        >
                          <FolderOpen className="w-3.5 h-3.5 mr-2 text-slate-400" />
                          Select Output Directory
                        </Button>
                      )}
                      <p className="text-[9px] text-slate-400 leading-tight">
                        Files will be saved automatically as they are generated. Requires a Chromium-based browser.
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        className="w-full bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-100" 
                        disabled={files.length === 0 || isBusy}
                        onClick={processBatch}
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing {batchProgress}%
                          </>
                        ) : (
                          <>
                            <Layers className="w-4 h-4 mr-2" />
                            Process {files.length} {files.length === 1 ? 'File' : 'Files'}
                          </>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Start generation (Ctrl+Enter)</TooltipContent>
                  </Tooltip>
                </CardContent>
              </Card>

              {/* Files List */}
              {files.length > 0 && (
                <Card className="border-slate-200 shadow-sm">
                  <CardHeader className="py-3 border-b bg-slate-50/30">
                    <CardTitle className="text-xs font-bold uppercase text-slate-500">Queue ({files.length})</CardTitle>
                  </CardHeader>
                  <ScrollArea className="max-h-[300px]">
                    <Reorder.Group axis="y" values={files} onReorder={setFiles} className="p-2 space-y-1">
                      {files.map((f) => (
                        <Reorder.Item 
                          key={f.id} 
                          value={f}
                          className="flex items-center justify-between p-2 rounded-lg bg-white border border-transparent hover:border-slate-200 hover:bg-slate-50 group text-xs cursor-grab active:cursor-grabbing"
                        >
                          <div className="flex items-center gap-2 truncate pr-4">
                            <GripVertical className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                            <FileText className="w-3 h-3 text-red-400 shrink-0" />
                            <div className="flex flex-col truncate">
                              <span className="truncate font-medium">{f.file.name}</span>
                              {f.pageCount !== undefined && (
                                <span className="text-[9px] text-slate-400 uppercase tracking-wider font-bold">
                                  {f.pageCount} {f.pageCount === 1 ? 'page' : 'pages'}
                                </span>
                              )}
                            </div>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button 
                                onClick={() => removeFile(f.id)}
                                disabled={isBusy}
                                className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 hover:text-red-500 rounded transition-all disabled:pointer-events-none"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Remove from queue</TooltipContent>
                          </Tooltip>
                        </Reorder.Item>
                      ))}
                    </Reorder.Group>
                  </ScrollArea>
                  <CardFooter className="p-2 bg-slate-50/50 border-t">
                    <p className="text-[10px] text-slate-400 text-center w-full">Drag files to reorder processing</p>
                  </CardFooter>
                </Card>
              )}
            </aside>

            {/* Main Content Area */}
            <div className="space-y-6">
              {files.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "h-[500px] border-2 border-dashed rounded-3xl bg-white flex flex-col items-center justify-center p-12 text-center group transition-all duration-300 cursor-pointer",
                    isDragging ? "border-blue-600 bg-blue-50/80 scale-[0.98] ring-8 ring-blue-500/5" : "border-slate-200 hover:border-blue-400",
                    isBusy && "opacity-50 pointer-events-none"
                  )}
                  onDragOver={(e) => !isBusy && handleDragOver(e)}
                  onDragLeave={(e) => !isBusy && handleDragLeave(e)}
                  onDrop={(e) => !isBusy && handleDrop(e)}
                  onClick={() => !isBusy && fileInputRef.current?.click()}
                >
                  <div className={cn(
                    "w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-all duration-300",
                    isDragging ? "bg-blue-100 scale-110" : "bg-slate-50 group-hover:scale-110"
                  )}>
                    <FileUp className={cn(
                      "w-10 h-10 transition-colors",
                      isDragging ? "text-blue-600" : "text-slate-400 group-hover:text-blue-500"
                    )} />
                  </div>
                  <h3 className="text-xl font-bold mb-2">
                    {isDragging ? "Drop your PDFs here" : "Upload PDFs for Batch Processing"}
                  </h3>
                  <p className="text-slate-500 max-w-xs mx-auto mb-8">
                    {isDragging ? "Release to add files to queue" : "Select multiple files to generate thumbnails in one go."}
                  </p>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept=".pdf" 
                    multiple
                    className="hidden" 
                  />
                  <Button variant={isDragging ? "default" : "outline"} className="rounded-full px-8 pointer-events-none">
                    {isDragging ? "Ready to drop" : "Select Files"}
                  </Button>
                </motion.div>
              ) : (
                <div className="space-y-6">
                  {/* Batch Status Bar */}
                  {isProcessing && (
                    <div className="bg-white p-6 rounded-2xl border shadow-sm space-y-4">
                      <div className="flex justify-between items-end">
                        <div>
                          <h3 className="font-bold text-slate-900">Processing Batch...</h3>
                          <p className="text-xs text-slate-500">File {currentFileIndex + 1} of {files.length}: {files[currentFileIndex].file.name}</p>
                        </div>
                        <span className="text-sm font-bold text-blue-600">{batchProgress}%</span>
                      </div>
                      <Progress value={batchProgress} className="h-2" />
                    </div>
                  )}

                  {/* Previews Grid */}
                  <ScrollArea className="h-[calc(100vh-200px)] rounded-2xl border bg-slate-50/50 p-6">
                    {thumbnails.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
                        {!isProcessing && (
                          <div className="flex flex-col items-center gap-4">
                            <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
                            <p className="text-sm font-medium">Click "Process Files" to start generating thumbnails</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-12">
                        {/* Batch Actions */}
                        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border shadow-sm sticky top-0 z-10">
                          <div className="flex flex-col">
                            <h3 className="text-sm font-bold text-slate-900">Generated Assets</h3>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">{thumbnails.length} items ready</p>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button 
                                onClick={downloadAllAsZip} 
                                disabled={isZipping || isProcessing}
                                className="bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100 px-6"
                              >
                                {isZipping ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <Download className="w-4 h-4 mr-2" />
                                )}
                                Download All (.zip)
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Bundle all assets into a ZIP file</TooltipContent>
                          </Tooltip>
                        </div>

                        {/* Group by filename */}
                        {Array.from(new Set(thumbnails.map(t => t.fileName))).map(fileName => (
                          <div key={fileName} className="space-y-4">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="bg-white px-3 py-1 border-slate-200 text-slate-600 font-bold">
                                {fileName}
                              </Badge>
                              <div className="h-px grow bg-slate-200" />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                              <AnimatePresence>
                                {thumbnails.filter(t => t.fileName === fileName).map((thumb, idx) => (
                                  <motion.div
                                    key={`${fileName}-${thumb.pageNumber}`}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: idx * 0.02 }}
                                  >
                                    <Card 
                                      className={cn(
                                        "group overflow-hidden border-slate-200 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/5 cursor-pointer",
                                        (thumb.dataUrl || thumb.highResDataUrl || thumb.aiImageUrl || thumb.aiVideoUrl) ? "hover:border-blue-300" : "opacity-70 grayscale pointer-events-none"
                                      )}
                                      onClick={() => (thumb.dataUrl || thumb.highResDataUrl || thumb.aiImageUrl || thumb.aiVideoUrl) && setSelectedThumb(thumb)}
                                    >
                                      <div className="aspect-[3/4] bg-white relative flex items-center justify-center p-4">
                                        {(thumb.dataUrl || thumb.highResDataUrl || thumb.aiImageUrl || thumb.aiVideoUrl) ? (
                                          <>
                                            {thumb.aiVideoUrl ? (
                                              <video 
                                                src={thumb.aiVideoUrl} 
                                                autoPlay 
                                                loop 
                                                muted 
                                                playsInline
                                                className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                                              />
                                            ) : (
                                              <img 
                                                src={thumb.aiImageUrl || thumb.dataUrl || thumb.highResDataUrl} 
                                                alt={`Page ${thumb.pageNumber}`}
                                                className={cn(
                                                  "max-w-full max-h-full transition-transform duration-500 group-hover:scale-105",
                                                  options.style === 'shadow' && "shadow-2xl shadow-black/20",
                                                  options.style === 'border' && "border border-slate-200",
                                                  options.style === 'rounded' && "rounded-lg shadow-lg",
                                                  options.style === 'glossy' && "rounded-lg shadow-xl ring-1 ring-white/20 bg-gradient-to-tr from-white/10 to-white/30"
                                                )}
                                              />
                                            )}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Button 
                                                    size="icon" 
                                                    variant="secondary" 
                                                    className="rounded-full"
                                                    disabled={isBusy}
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      setSelectedThumb(thumb);
                                                    }}
                                                  >
                                                    <Eye className="w-4 h-4" />
                                                  </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Preview large version</TooltipContent>
                                              </Tooltip>
                                            </div>
                                            {thumb.aiPrompt && (
                                              <div className="absolute bottom-2 right-2">
                                                <Badge className="bg-blue-600/90 text-[8px] uppercase tracking-tighter">AI Generated</Badge>
                                              </div>
                                            )}
                                          </>
                                        ) : (
                                          <div className="flex flex-col items-center gap-3">
                                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">Rendering...</span>
                                          </div>
                                        )}
                                        <div className="absolute top-2 left-2">
                                          <Badge variant="secondary" className="bg-white/90 backdrop-blur-sm text-[10px] font-bold">
                                            PAGE {thumb.pageNumber}
                                          </Badge>
                                        </div>
                                      </div>
                                      <CardFooter className="p-3 bg-white border-t flex justify-between items-center">
                                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
                                          {thumb.aiVideoUrl ? 'MP4' : (thumb.aiImageUrl ? 'PNG' : options.format.split('/')[1].toUpperCase())}
                                        </span>
                                        <div className="flex gap-1">
                                          {thumb.aiImageUrl && (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button 
                                                  variant="ghost" 
                                                  size="sm" 
                                                  className="h-7 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                  disabled={isBusy}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    downloadThumbnail(thumb.aiImageUrl!, thumb.fileName, thumb.pageNumber, 'ai-photo');
                                                  }}
                                                >
                                                  Photo
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>Download AI Photo</TooltipContent>
                                            </Tooltip>
                                          )}
                                          {thumb.aiVideoUrl && (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button 
                                                  variant="ghost" 
                                                  size="sm" 
                                                  className="h-7 text-[10px] font-bold uppercase tracking-wider text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                                  disabled={isBusy}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    downloadThumbnail(thumb.aiVideoUrl!, thumb.fileName, thumb.pageNumber, 'ai-video');
                                                  }}
                                                >
                                                  Anim
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>Download AI Animation</TooltipContent>
                                            </Tooltip>
                                          )}
                                          {thumb.dataUrl && (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button 
                                                  variant="ghost" 
                                                  size="sm" 
                                                  className="h-7 text-[10px] font-bold uppercase tracking-wider text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                  disabled={isBusy}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    downloadThumbnail(thumb.dataUrl!, thumb.fileName, thumb.pageNumber);
                                                  }}
                                                >
                                                  Thumb
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>Download standard thumbnail</TooltipContent>
                                            </Tooltip>
                                          )}
                                          {thumb.highResDataUrl && (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button 
                                                  variant="ghost" 
                                                  size="sm" 
                                                  className="h-7 text-[10px] font-bold uppercase tracking-wider text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                                  disabled={isBusy}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    downloadThumbnail(thumb.highResDataUrl!, thumb.fileName, thumb.pageNumber, 'highres');
                                                  }}
                                                >
                                                  HD
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>Download high-res image</TooltipContent>
                                            </Tooltip>
                                          )}
                                        </div>
                                      </CardFooter>
                                    </Card>
                                  </motion.div>
                                ))}
                              </AnimatePresence>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Preview Modal */}
        <Dialog open={!!selectedThumb} onOpenChange={(open) => !open && setSelectedThumb(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden border-none bg-transparent shadow-none">
            <div className="relative w-full h-full flex flex-col items-center justify-center gap-4">
              <div className="bg-white rounded-2xl p-4 shadow-2xl max-h-[80vh] overflow-auto w-full max-w-3xl">
                {selectedThumb?.aiVideoUrl ? (
                  <video 
                    src={selectedThumb.aiVideoUrl} 
                    controls 
                    autoPlay 
                    loop 
                    className="w-full h-auto rounded-lg shadow-lg"
                  />
                ) : (
                  <img 
                    src={selectedThumb?.aiImageUrl || selectedThumb?.highResDataUrl || selectedThumb?.dataUrl} 
                    alt="Preview" 
                    className="w-full h-auto rounded-lg"
                  />
                )}
                
                {selectedThumb?.aiPrompt && (
                  <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2 mb-2 text-blue-600">
                      <BrainCircuit className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">AI Creative Prompt</span>
                    </div>
                    <p className="text-sm text-slate-600 italic leading-relaxed">
                      "{selectedThumb.aiPrompt}"
                    </p>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap justify-center gap-3 bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-white/20">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Page {selectedThumb?.pageNumber}</span>
                  <span className="text-xs font-medium truncate max-w-[200px]">{selectedThumb?.fileName}</span>
                </div>
                <Separator orientation="vertical" className="h-8 hidden sm:block" />
                
                {selectedThumb?.aiImageUrl && (
                  <Button 
                    size="sm" 
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => selectedThumb && downloadThumbnail(selectedThumb.aiImageUrl!, selectedThumb.fileName, selectedThumb.pageNumber, 'ai-photo')}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    AI Photo
                  </Button>
                )}

                {selectedThumb?.aiVideoUrl && (
                  <Button 
                    size="sm" 
                    className="bg-purple-600 hover:bg-purple-700"
                    onClick={() => selectedThumb && downloadThumbnail(selectedThumb.aiVideoUrl!, selectedThumb.fileName, selectedThumb.pageNumber, 'ai-video')}
                  >
                    <Video className="w-4 h-4 mr-2" />
                    AI Animation
                  </Button>
                )}

                {selectedThumb?.dataUrl && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => selectedThumb && downloadThumbnail(selectedThumb.dataUrl!, selectedThumb.fileName, selectedThumb.pageNumber)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Thumbnail
                  </Button>
                )}
                {selectedThumb?.highResDataUrl && (
                  <Button 
                    size="sm" 
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => selectedThumb && downloadThumbnail(selectedThumb.highResDataUrl!, selectedThumb.fileName, selectedThumb.pageNumber, 'highres')}
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    HD Image
                  </Button>
                )}
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="rounded-full"
                  onClick={() => setSelectedThumb(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Footer */}
        <footer className="mt-auto border-t py-8 bg-white">
          <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-slate-400">
                <FileText className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-widest">PDF Snap © 2026</span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                Developed by 
                <a 
                  href="https://github.com/aryansinghyadav" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline flex items-center gap-1"
                >
                  Aryan Singh
                  <Github className="w-3 h-3" />
                </a>
              </p>
            </div>
            <div className="flex items-center gap-6">
              <button 
                onClick={() => setShowLegal('privacy')}
                className="text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors uppercase tracking-wider"
              >
                Privacy
              </button>
              <button 
                onClick={() => setShowLegal('terms')}
                className="text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors uppercase tracking-wider"
              >
                Terms
              </button>
              <button 
                onClick={() => setShowLegal('support')}
                className="text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors uppercase tracking-wider"
              >
                Support
              </button>
            </div>
          </div>
        </footer>

        {/* Legal Modals */}
        <Dialog open={!!showLegal} onOpenChange={(open) => !open && setShowLegal(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="capitalize">{showLegal} Policy</DialogTitle>
              <DialogDescription>
                Last updated: April 2026
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[50vh] pr-4">
              <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
                {showLegal === 'privacy' && (
                  <>
                    <h3 className="font-bold text-slate-900">1. Data Processing</h3>
                    <p>PDF Snap processes all files locally in your browser. We do not upload your PDF documents to any external servers. All thumbnail generation happens on your device.</p>
                    <h3 className="font-bold text-slate-900">2. Information Collection</h3>
                    <p>We do not collect personal information or document content. Your privacy is our priority.</p>
                    <h3 className="font-bold text-slate-900">3. Cookies</h3>
                    <p>We may use local storage to save your preferences (like resolution and format), but no tracking cookies are used.</p>
                  </>
                )}
                {showLegal === 'terms' && (
                  <>
                    <h3 className="font-bold text-slate-900">1. Acceptance of Terms</h3>
                    <p>By using PDF Snap, you agree to these terms. This tool is provided "as is" without any warranties.</p>
                    <h3 className="font-bold text-slate-900">2. Usage Rights</h3>
                    <p>You are free to use the generated images for personal or commercial projects. You retain full ownership of your original PDF content.</p>
                    <h3 className="font-bold text-slate-900">3. Limitations</h3>
                    <p>We are not responsible for any data loss or errors during the conversion process. Large files may impact browser performance.</p>
                  </>
                )}
                {showLegal === 'support' && (
                  <>
                    <h3 className="font-bold text-slate-900">Contact & Support</h3>
                    <p>If you encounter issues or have feature requests, please reach out via GitHub.</p>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                      <p className="font-medium text-blue-800">Community Support</p>
                      <p className="text-blue-600 mt-1">Check the GitHub repository for documentation and issue tracking.</p>
                    </div>
                    <h3 className="font-bold text-slate-900">Common Issues</h3>
                    <ul className="list-disc pl-5 space-y-2">
                      <li><strong>Large Files:</strong> Extremely large PDFs may cause the browser to slow down.</li>
                      <li><strong>Browser Compatibility:</strong> Ensure you are using a modern browser (Chrome, Firefox, Safari, Edge).</li>
                    </ul>
                  </>
                )}
              </div>
            </ScrollArea>
            <div className="flex justify-end mt-4">
              <Button onClick={() => setShowLegal(null)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Think Mode Overlay */}
        <AnimatePresence>
          {isThinking && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6"
            >
              <div className="max-w-xl w-full space-y-8">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="relative">
                    <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 animate-pulse" />
                    <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center shadow-2xl relative">
                      <Sparkles className="w-10 h-10 text-white animate-bounce" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-white tracking-tight">Thinking...</h2>
                    <p className="text-slate-400 text-sm">Orchestrating the rendering pipeline</p>
                  </div>
                </div>

                <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 font-mono text-xs overflow-hidden">
                  <div className="space-y-3">
                    {thinkSteps.slice(-5).map((step, idx) => (
                      <motion.div 
                        key={idx}
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className="flex items-start gap-3 text-slate-300"
                      >
                        <span className="text-blue-500 shrink-0">›</span>
                        <span className={idx === thinkSteps.slice(-5).length - 1 ? "text-blue-400 font-bold" : ""}>
                          {step}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                  <div className="mt-6 flex items-center gap-4">
                    <Progress value={batchProgress} className="h-1 bg-slate-700" />
                    <span className="text-blue-400 font-bold min-w-[3rem]">{batchProgress}%</span>
                  </div>
                </div>
                
                <div className="flex flex-col items-center gap-4">
                  <p className="text-center text-slate-500 text-[10px] uppercase tracking-[0.2em]">
                    Processing {currentFileIndex + 1} of {files.length} files
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="rounded-full border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white"
                    onClick={cancelProcess}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Cancel Operation
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Zipping Overlay */}
        <AnimatePresence>
          {isZipping && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6"
            >
              <div className="bg-white rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-6 max-w-sm w-full text-center">
                <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center">
                  <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-bold">Creating ZIP Archive</h3>
                  <p className="text-sm text-slate-500">Please wait while we bundle your high-resolution assets...</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}
