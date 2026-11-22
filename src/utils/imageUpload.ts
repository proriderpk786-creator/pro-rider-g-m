/**
 * Automatically compresses and resizes uploaded mobile camera / gallery photos
 * via Canvas so 4MB–15MB smartphone photos upload reliably in ~150KB–300KB.
 */
export async function compressAndReadUploadFile(
  file: File,
  maxDimension = 1280,
  quality = 0.82
): Promise<{ dataUrl: string; fileName: string }> {
  if (!file) {
    throw new Error('No file selected.');
  }

  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) {
    if (file.size > 5_000_000) {
      throw new Error('PDF file exceeds 5MB limit.');
    }
    const dataUrl = await readAsDataUrl(file);
    return { dataUrl, fileName: file.name };
  }

  const isImage =
    file.type.startsWith('image/') ||
    /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name);

  if (!isImage) {
    throw new Error('Please upload a valid image (JPG, PNG, WEBP) or PDF file.');
  }

  // Always read original data URL first as clean fallback
  const originalDataUrl = await readAsDataUrl(file);

  // If very small image (< 220KB), keep original crisply without re-encoding
  if (file.size <= 220_000) {
    return { dataUrl: originalDataUrl, fileName: file.name };
  }

  try {
    const img = await loadImage(originalDataUrl);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) {
      return { dataUrl: originalDataUrl, fileName: file.name };
    }

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { dataUrl: originalDataUrl, fileName: file.name };
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const compressed = canvas.toDataURL('image/jpeg', quality);
    const outName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return {
      dataUrl: compressed && compressed.length < originalDataUrl.length ? compressed : originalDataUrl,
      fileName: outName,
    };
  } catch {
    // If browser cannot decode HEIC via canvas but size fits server allowance
    if (originalDataUrl.length <= 7_500_000) {
      return { dataUrl: originalDataUrl, fileName: file.name };
    }
    throw new Error('Could not process this image. Please try another JPG/PNG photo.');
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

export async function processVehiclePhotoUpload(
  file: File,
  maxDimension = 960,
  quality = 0.88
): Promise<string> {
  const { dataUrl } = await compressAndReadUploadFile(file, maxDimension, quality);
  return dataUrl;
}

