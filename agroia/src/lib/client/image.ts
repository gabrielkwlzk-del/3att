/**
 * Reduz a foto no próprio celular antes do envio: economiza dados móveis no
 * campo e mantém resolução suficiente para a análise (lado maior ≤ 1568 px).
 */
const MAX_SIDE = 1568;
const QUALITY = 0.85;

export type PreparedImage = { blob: Blob; previewUrl: string; width: number; height: number };

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  if (file.size > 25 * 1024 * 1024) throw new Error("A foto é muito grande (máximo 25 MB).");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Não foi possível ler esta imagem. Tente outra foto (JPG ou PNG).");
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu processar a imagem.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error("Falha ao preparar a imagem.");
  return { blob, previewUrl: URL.createObjectURL(blob), width, height };
}
