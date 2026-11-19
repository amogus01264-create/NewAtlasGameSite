/**
 * High-performance image compressor for avatars and game thumbnails.
 * Compresses large images (up to 20MB) down to lightweight ~3-12KB data URLs,
 * preventing browser localStorage quota errors (5MB limit) and Firestore document size limits (1MB limit).
 */

const MAX_SAFE_DATA_URL_LENGTH = 65000;

export async function compressImageToDataUrl(
  fileOrDataUrl: File | string,
  maxWidth: number = 128,
  maxHeight: number = 128,
  quality: number = 0.8
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      if (typeof fileOrDataUrl === 'string') return resolve(fileOrDataUrl);
      return reject(new Error('Image processing is only supported in the browser.'));
    }

    const encodeCanvasSafely = (
      img: HTMLImageElement,
      targetW: number,
      targetH: number,
      startQuality: number
    ): string => {
      let w = Math.max(24, Math.round(targetW));
      let h = Math.max(24, Math.round(targetH));
      let q = startQuality;

      for (let attempt = 0; attempt < 4; attempt++) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) break;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        // Prefer compact WebP (preserves transparency); fall back to JPEG with dark fill
        const webp = canvas.toDataURL('image/webp', q);
        if (webp.startsWith('data:image/webp') && webp.length <= MAX_SAFE_DATA_URL_LENGTH) {
          return webp;
        }

        // Fill dark backdrop before JPEG export so transparent PNGs render cleanly
        const jpegCanvas = document.createElement('canvas');
        jpegCanvas.width = w;
        jpegCanvas.height = h;
        const jCtx = jpegCanvas.getContext('2d');
        if (jCtx) {
          jCtx.fillStyle = '#0f172a';
          jCtx.fillRect(0, 0, w, h);
          jCtx.imageSmoothingEnabled = true;
          jCtx.imageSmoothingQuality = 'high';
          jCtx.drawImage(img, 0, 0, w, h);
          const jpeg = jpegCanvas.toDataURL('image/jpeg', q);
          if (jpeg.length <= MAX_SAFE_DATA_URL_LENGTH) {
            return jpeg;
          }
        }

        // Shrink dimensions & quality for next pass if still too large
        w = Math.max(48, Math.round(w * 0.75));
        h = Math.max(48, Math.round(h * 0.75));
        q = Math.max(0.45, q - 0.12);
      }

      const fallbackCanvas = document.createElement('canvas');
      fallbackCanvas.width = 64;
      fallbackCanvas.height = 64;
      const fCtx = fallbackCanvas.getContext('2d');
      if (!fCtx) {
        throw new Error('Could not initialize image canvas.');
      }
      fCtx.fillStyle = '#0f172a';
      fCtx.fillRect(0, 0, 64, 64);
      fCtx.drawImage(img, 0, 0, 64, 64);
      return fallbackCanvas.toDataURL('image/jpeg', 0.65);
    };

    const processDataUrl = (src: string) => {
      if (!src) {
        return reject(new Error('Empty image data.'));
      }

      // Remote URL or compact inline SVG
      if (src.startsWith('http://') || src.startsWith('https://')) {
        return resolve(src);
      }
      if (src.includes('image/svg') && src.length <= MAX_SAFE_DATA_URL_LENGTH) {
        return resolve(src);
      }

      const img = new Image();
      if (!src.startsWith('data:') && !src.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }

      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width || maxWidth;
          let height = img.naturalHeight || img.height || maxHeight;

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

          const compressed = encodeCanvasSafely(img, width, height, quality);
          resolve(compressed);
        } catch (err) {
          if (src.startsWith('data:image') && src.length <= MAX_SAFE_DATA_URL_LENGTH) {
            resolve(src);
          } else {
            reject(
              err instanceof Error
                ? err
                : new Error('Failed to compress selected image. Please try a PNG or JPG file.')
            );
          }
        }
      };

      img.onerror = () => {
        if (src.startsWith('data:image/svg') && src.length <= MAX_SAFE_DATA_URL_LENGTH) {
          resolve(src);
        } else {
          reject(new Error('Unsupported or corrupted image file. Please try PNG, JPG, GIF, or WebP.'));
        }
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
          reject(new Error('Failed to read selected image file.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read selected image file.'));
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}
