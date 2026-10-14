/**
 * High-performance image compressor for avatars and game thumbnails.
 * Compresses large images (up to 20MB) down to ultra-lightweight ~2-4KB data URLs,
 * preventing browser localStorage quota errors (5MB limit) and Firestore document size limits (1MB limit).
 */

export async function compressImageToDataUrl(
  fileOrDataUrl: File | string,
  maxWidth: number = 96,
  maxHeight: number = 96,
  quality: number = 0.75
): Promise<string> {
  return new Promise((resolve) => {
    // If not a browser environment
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      if (typeof fileOrDataUrl === 'string') return resolve(fileOrDataUrl);
      return resolve('');
    }

    const processDataUrl = (src: string) => {
      // If it's a remote URL or SVG, don't recompress
      if (src.startsWith('http') || src.startsWith('blob:') || src.includes('image/svg')) {
        return resolve(src);
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          let width = img.width || maxWidth;
          let height = img.height || maxHeight;

          // Compute aspect-ratio preserved dimensions
          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          canvas.width = Math.max(16, width);
          canvas.height = Math.max(16, height);
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            return resolve(src);
          }

          // Smooth rendering
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'medium';
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Export as compact JPEG
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } catch (e) {
          console.warn('Image compression fallback:', e);
          resolve(src);
        }
      };

      img.onerror = () => {
        resolve(src);
      };

      img.src = src;
    };

    if (typeof fileOrDataUrl === 'string') {
      processDataUrl(fileOrDataUrl);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          processDataUrl(reader.result);
        } else {
          resolve('');
        }
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}
