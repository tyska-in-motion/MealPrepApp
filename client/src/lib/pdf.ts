export type PdfOrientation = "portrait" | "landscape";

const PDF_PAGE_SIZE = {
  portrait: { width: 595.28, height: 841.89 },
  landscape: { width: 841.89, height: 595.28 },
};

const concatBytes = (chunks: Uint8Array[]) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
};

const decodeBase64 = (value: string) => {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};

type PdfImage = {
  jpegBytes: Uint8Array;
  imgWidthPx: number;
  imgHeightPx: number;
};

const buildPdfWithJpegs = (images: PdfImage[], orientation: PdfOrientation) => {
  const { width: pageWidth, height: pageHeight } = PDF_PAGE_SIZE[orientation];
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let length = 0;

  const pushText = (value: string) => {
    const bytes = encoder.encode(value);
    chunks.push(bytes);
    length += bytes.length;
  };

  const pushBytes = (value: Uint8Array) => {
    chunks.push(value);
    length += value.length;
  };

  const addObject = (index: number, body: string | Uint8Array, binary = false) => {
    offsets[index] = length;
    pushText(`${index} 0 obj\n`);
    if (binary && body instanceof Uint8Array) {
      pushBytes(body);
      if (body[body.length - 1] !== 10) pushText("\n");
    } else {
      pushText(String(body));
      if (!String(body).endsWith("\n")) pushText("\n");
    }
    pushText("endobj\n");
  };

  pushText("%PDF-1.4\n");
  addObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const pagesObjectId = 2;
  const firstPageObjectId = 3;
  const pageObjectIds = images.map((_, index) => firstPageObjectId + index * 3);
  const contentObjectIds = images.map((_, index) => firstPageObjectId + index * 3 + 1);
  const imageObjectIds = images.map((_, index) => firstPageObjectId + index * 3 + 2);

  addObject(
    pagesObjectId,
    `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`,
  );

  images.forEach((image, index) => {
    const pageObjectId = pageObjectIds[index];
    const contentObjectId = contentObjectIds[index];
    const imageObjectId = imageObjectIds[index];
    const contentStream = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im1 Do\nQ\n`;

    addObject(
      pageObjectId,
      `<< /Type /Page /Parent ${pagesObjectId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im1 ${imageObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
    );
    addObject(contentObjectId, `<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream`);

    const imageHeader = encoder.encode(
      `<< /Type /XObject /Subtype /Image /Width ${image.imgWidthPx} /Height ${image.imgHeightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.jpegBytes.length} >>\nstream\n`,
    );
    const imageFooter = encoder.encode("\nendstream");
    const imageObject = concatBytes([imageHeader, image.jpegBytes, imageFooter]);
    addObject(imageObjectId, imageObject, true);
  });

  const xrefStart = length;
  const objectCount = imageObjectIds[imageObjectIds.length - 1];
  pushText(`xref\n0 ${objectCount + 1}\n`);
  pushText("0000000000 65535 f \n");
  for (let i = 1; i <= objectCount; i += 1) {
    pushText(`${String(offsets[i] || 0).padStart(10, "0")} 00000 n \n`);
  }
  pushText(`trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return new Blob([concatBytes(chunks)], { type: "application/pdf" });
};

export const canvasToPdfBlob = async (canvas: HTMLCanvasElement, orientation: PdfOrientation) => {
  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  const base64 = dataUrl.split(",")[1] || "";
  const jpegBytes = decodeBase64(base64);
  return buildPdfWithJpegs([{ jpegBytes, imgWidthPx: canvas.width, imgHeightPx: canvas.height }], orientation);
};

export const canvasesToPdfBlob = async (canvases: HTMLCanvasElement[], orientation: PdfOrientation) => {
  const images = canvases.map((canvas) => {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
    const base64 = dataUrl.split(",")[1] || "";
    const jpegBytes = decodeBase64(base64);
    return { jpegBytes, imgWidthPx: canvas.width, imgHeightPx: canvas.height };
  });
  return buildPdfWithJpegs(images, orientation);
};

export const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
