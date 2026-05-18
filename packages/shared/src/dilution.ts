// 希釈計算サポーター (Issue: kako-jun/farm-in-pocket#36)
//
// 液体肥料・農薬・除草剤など希釈が必要な資材で「何リットル作りたいか」から
// 「原液 N ml + 水 M ml」を導く純粋関数。
//
// 計算式:
//   targetMl       = targetVolumeLiters * 1000
//   concentrateMl  = targetMl / ratio
//   waterMl        = targetMl - concentrateMl
//
// 計算ミスは薬害・効果不足の直接原因になるため、四捨五入の桁数（小数2桁）と
// 負値ガード（0 にクランプ）を共通実装に寄せて、UI 側で再実装させない。

import type { MaterialDilution } from "./db";

export interface DilutionCalcInput {
  /** 希釈倍率（例: 1000 → 1000倍液）。1 以上の正数。 */
  ratio: number;
  /** 作りたい量（リットル）。0 以上。 */
  targetVolumeLiters: number;
}

export interface DilutionCalcResult {
  targetVolumeLiters: number;
  targetVolumeMl: number;
  /** 原液 ml（小数2桁に丸め） */
  concentrateMl: number;
  /** 加える水 ml（小数2桁に丸め） */
  waterMl: number;
  ratio: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 希釈計算。
 * - targetVolumeLiters / ratio が負・非有限なら 0 / 1 にクランプ。
 * - 結果は小数2桁に丸める。
 */
export function calcDilution(input: DilutionCalcInput): DilutionCalcResult {
  const safeLiters =
    Number.isFinite(input.targetVolumeLiters) && input.targetVolumeLiters > 0
      ? input.targetVolumeLiters
      : 0;
  const targetMl = safeLiters * 1000;
  const safeRatio = Number.isFinite(input.ratio) && input.ratio >= 1 ? input.ratio : 1;
  const concentrateMl = round2(targetMl / safeRatio);
  const waterMl = Math.max(0, round2(targetMl - concentrateMl));
  return {
    targetVolumeLiters: safeLiters,
    targetVolumeMl: round2(targetMl),
    concentrateMl,
    waterMl,
    ratio: safeRatio,
  };
}

/** dilution に少なくとも 1 つの ratio が設定されているか。 */
export function hasDilution(dilution: MaterialDilution | null | undefined): boolean {
  return !!(dilution && Array.isArray(dilution.ratios) && dilution.ratios.length > 0);
}
