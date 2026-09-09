export interface OcrModelConfig {
  detModelUrl: string;
  recModelUrl: string;
  keysUrl: string;
}

/**
 * Defaults to the same public PP-OCRv5 mobile det/rec models used by the earlier
 * id-ocr-web project (generic OCR weights, not ID-specific — safe to reuse). This is a
 * convenience default only: it depends on infrastructure this repo doesn't own. For a
 * production deployment, host your own copy of the same three assets (det_model.onnx,
 * rec_model.onnx, ppocr_keys_v1.txt) and pass a `modelConfig` built from your own bucket
 * so this project has no runtime dependency on infra outside its control.
 */
export const DEFAULT_MODEL_BASE_URL = "https://storage.googleapis.com/idscan_ocr/";

export function defaultModelConfig(baseUrl: string = DEFAULT_MODEL_BASE_URL): OcrModelConfig {
  return {
    detModelUrl: `${baseUrl}det_model.onnx`,
    recModelUrl: `${baseUrl}rec_model.onnx`,
    keysUrl: `${baseUrl}ppocr_keys_v1.txt`,
  };
}
