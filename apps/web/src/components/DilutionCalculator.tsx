// 希釈計算サポーター UI (Issue: kako-jun/farm-in-pocket#36)
//
// 液体肥料・農薬・除草剤など希釈が必要な資材で「何リットル作りたいか」と
// 「散布量（任意）」を入力させ、「原液 N ml + 水 M ml」を大きく目立つ枠で表示する。
//
// - dilution.ratios が複数あれば「目的」セレクトを出す（通常散布 / 高濃度等）
// - 結果は emerald 系の枠 + 大文字で、計算ミスが視覚的に検知しやすいよう強調
// - onChange で親に DilutionCalcResult を通知（amount/dilutionRatio の自動セット用途）

import type { MaterialDilution, MaterialDilutionRatio } from "@farm-in-pocket/shared";
import { type DilutionCalcResult, calcDilution } from "@farm-in-pocket/shared";
import { type JSX, useEffect, useMemo, useState } from "react";

export interface DilutionCalculatorProps {
  dilution: MaterialDilution;
  onChange?: (result: DilutionCalcResult | null) => void;
}

export default function DilutionCalculator(props: DilutionCalculatorProps): JSX.Element {
  const ratios: MaterialDilutionRatio[] = props.dilution.ratios ?? [];
  const [ratioIndex, setRatioIndex] = useState(0);
  const [targetVolumeStr, setTargetVolumeStr] = useState("1");
  const [sprayVolumeStr, setSprayVolumeStr] = useState("");

  const selected = ratios[ratioIndex] ?? ratios[0];

  const result: DilutionCalcResult | null = useMemo(() => {
    if (!selected) return null;
    const liters = Number.parseFloat(targetVolumeStr);
    const litersSafe = Number.isFinite(liters) && liters > 0 ? liters : 0;
    return calcDilution({ ratio: selected.ratio, targetVolumeLiters: litersSafe });
  }, [selected, targetVolumeStr]);

  // onChange は result が変わったときに通知
  const { onChange } = props;
  useEffect(() => {
    if (!onChange) return;
    onChange(result);
  }, [onChange, result]);

  if (ratios.length === 0) {
    // hasDilution チェックは呼び出し側で済んでいる想定だが、防御的に何も描かない
    return <></>;
  }

  return (
    <div
      data-testid="fip-dilution-calc"
      className="space-y-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3"
    >
      <div className="text-xs font-semibold text-emerald-800">希釈計算</div>

      {ratios.length > 1 && (
        <label className="block text-xs">
          目的
          <select
            data-testid="fip-dilution-calc-purpose"
            value={ratioIndex}
            onChange={(e) => setRatioIndex(Number(e.target.value))}
            className="mt-1 block w-full rounded border border-neutral-300 bg-white px-2 py-2 text-sm"
          >
            {ratios.map((r, i) => (
              <option key={`${r.purpose}-${i}`} value={i}>
                {r.purpose}（{r.ratio}
                {props.dilution.unit ?? "倍液"}）
              </option>
            ))}
          </select>
        </label>
      )}

      {ratios.length === 1 && selected && (
        <div className="text-xs text-neutral-700">
          {selected.purpose}（{selected.ratio}
          {props.dilution.unit ?? "倍液"}）
        </div>
      )}

      <label className="block text-xs">
        作りたい量 (L)
        <input
          type="number"
          step="0.1"
          min="0"
          data-testid="fip-dilution-calc-target"
          value={targetVolumeStr}
          onChange={(e) => setTargetVolumeStr(e.target.value)}
          className="mt-1 block w-full rounded border border-neutral-300 bg-white px-2 py-2 text-sm"
        />
      </label>

      <label className="block text-xs">
        散布量 (L) <span className="text-neutral-500">任意</span>
        <input
          type="number"
          step="0.1"
          min="0"
          data-testid="fip-dilution-calc-spray"
          value={sprayVolumeStr}
          onChange={(e) => setSprayVolumeStr(e.target.value)}
          className="mt-1 block w-full rounded border border-neutral-300 bg-white px-2 py-2 text-sm"
        />
      </label>

      {result && (
        <div
          data-testid="fip-dilution-calc-result"
          className="rounded-md border-2 border-emerald-500 bg-white px-3 py-3 text-center"
        >
          <div className="text-xs text-emerald-700">
            {result.ratio}
            {props.dilution.unit ?? "倍液"}・{result.targetVolumeLiters}L
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-emerald-900">
            <span data-testid="fip-dilution-calc-concentrate">{result.concentrateMl}</span>
            <span className="text-sm font-semibold"> ml</span>
            <span className="px-2 text-neutral-400">+</span>
            <span data-testid="fip-dilution-calc-water">{result.waterMl}</span>
            <span className="text-sm font-semibold"> ml</span>
          </div>
          <div className="mt-0.5 text-[10px] text-neutral-500">原液 + 水</div>
        </div>
      )}
    </div>
  );
}

export { DilutionCalculator };
