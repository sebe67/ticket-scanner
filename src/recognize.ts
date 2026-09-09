import * as ort from "onnxruntime-web";
import { canvasRegionToNormalizedTensor } from "./imageUtils.js";

export interface RecCharset {
  /** Index 0 is the reserved CTC blank; the rest mirrors ppocr_keys_v1.txt plus a trailing space. */
  chars: string[];
}

/** PaddleOCR's CTCLabelDecode charset: ['blank', ...dict lines, ' ']. */
export function buildCharset(keysFileText: string): RecCharset {
  const lines = keysFileText.split(/\r?\n/).filter((l) => l.length > 0);
  return { chars: ["", ...lines, " "] };
}

export interface RecognizedText {
  text: string;
  confidence: number;
}

const REC_HEIGHT = 48;
const MAX_REC_WIDTH = 800;

/**
 * Runs the PP-OCRv5 recognition model on one already-cropped/straightened text-line
 * image and greedy-CTC-decodes the output against the PaddleOCR character dictionary.
 */
export async function recognizeLine(
  session: ort.InferenceSession,
  lineCanvas: HTMLCanvasElement,
  charset: RecCharset
): Promise<RecognizedText> {
  const aspect = lineCanvas.width / Math.max(1, lineCanvas.height);
  const targetWidth = Math.min(MAX_REC_WIDTH, Math.max(REC_HEIGHT, Math.round(REC_HEIGHT * aspect)));
  const tensor = canvasRegionToNormalizedTensor(lineCanvas, targetWidth, REC_HEIGHT, undefined, undefined, "-1-1");

  const inputName = session.inputNames[0];
  const input = new ort.Tensor("float32", tensor.data, [1, 3, REC_HEIGHT, targetWidth]);
  const outputs = await session.run({ [inputName]: input });
  const logits = outputs[session.outputNames[0]];
  const dims = logits.dims; // [1, T, C]
  const T = dims[1];
  const C = dims[2];

  if (C !== charset.chars.length) {
    console.warn(
      `ticket-scanner: rec model outputs ${C} classes but the loaded charset has ${charset.chars.length} entries ` +
        "(blank + ppocr_keys_v1.txt + space). Decoded text will be misaligned — confirm ppocr_keys_v1.txt matches " +
        "the deployed rec_model.onnx."
    );
  }

  const data = logits.data as Float32Array;
  let prevIdx = -1;
  const chars: string[] = [];
  let confSum = 0;
  let confCount = 0;

  for (let t = 0; t < T; t++) {
    const offset = t * C;
    let maxVal = -Infinity;
    let maxIdx = 0;
    for (let c = 0; c < C; c++) {
      const v = data[offset + c];
      if (v > maxVal) {
        maxVal = v;
        maxIdx = c;
      }
    }
    // rec_model.onnx's exported graph already applies softmax internally — its output
    // is a per-class probability distribution (each timestep's ~18,385 values are
    // non-negative and sum to ~1), confirmed by inspecting the real model's raw output.
    // maxVal here IS the argmax class's probability; re-deriving it via another softmax
    // over these already-normalized values (as a previous version of this code did)
    // silently flattens the distribution and produces a "confidence" that's tiny
    // regardless of how confident the model actually is.
    const prob = maxVal;

    // Standard CTC greedy decode: drop blanks (index 0), collapse consecutive repeats.
    if (maxIdx !== 0 && maxIdx !== prevIdx) {
      chars.push(charset.chars[maxIdx] ?? "");
      confSum += prob;
      confCount += 1;
    }
    prevIdx = maxIdx;
  }

  return {
    text: chars.join(""),
    confidence: confCount > 0 ? confSum / confCount : 0,
  };
}
