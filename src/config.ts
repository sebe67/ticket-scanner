export interface OcrModelConfig {
  detModelUrl: string;
  recModelUrl: string;
  keysUrl: string;
}

/**
 * Defaults to the versioned `v1.1/` copy of the same public PP-OCRv5 mobile det/rec
 * models used by the earlier id-ocr-web project (generic OCR weights, not ID-specific —
 * safe to reuse). Verified directly against the live bucket while wiring this up (not
 * just trusted by filename, per that project's own lesson learned the hard way): the
 * keys file at this path is actually named `ppocrv5_dict.txt` (not `ppocr_keys_v1.txt`
 * as in the unversioned/older layout), and the rec model's real output shape is
 * `[1, T, 18385]` against that file's 18383 non-empty lines — 18383 + 2 (CTC blank +
 * trailing space, see `buildCharset` in `recognize.ts`) confirms this det/rec/dict
 * triple is a genuinely matched set, not just similarly-named files.
 *
 * This is a convenience default only: it depends on infrastructure this repo doesn't
 * own, and the bucket's layout has already changed shape once (unversioned -> `v1.1/`,
 * with a renamed keys file) since the sibling id-ocr-web project shipped. For a
 * production deployment, host your own copy of the same three assets and pass a
 * `modelConfig` built from your own bucket — and re-verify the pair the same way
 * (load both models, compare the rec model's real output class count against the keys
 * file's line count) rather than assuming a bucket's current contents/filenames stay
 * put.
 */
export const DEFAULT_MODEL_BASE_URL = "https://storage.googleapis.com/idscan_ocr/v1.1/";

export function defaultModelConfig(baseUrl: string = DEFAULT_MODEL_BASE_URL): OcrModelConfig {
  return {
    detModelUrl: `${baseUrl}det_model.onnx`,
    recModelUrl: `${baseUrl}rec_model.onnx`,
    keysUrl: `${baseUrl}ppocrv5_dict.txt`,
  };
}
