// 経過時間フェード (Issue kako-jun/farm-in-pocket#26)
//
// 設計方針:
//   - 正確な残効モデル（半減期・温度依存・降雨量依存…）は定義しない。
//   - あくまで「いつやったか」を opacity に反映するための UI ヘルパ。
//   - 種類ごとに stop（経過日数→opacity の折れ線）を持ち、その間は線形補間で滑らかにつなぐ。
//   - schedule:
//       fertilize: 1 週間以内 = 1.0 (plateau)、1 ヶ月 = 0.5、3 ヶ月以上 = 0.15
//       pesticide: 1 週間以内 = 1.0 (plateau)、2 週間 = 0.5、4 週間以上 = 0.15
//       ph:        1 ヶ月以内 = 1.0 (plateau)、3 ヶ月 = 0.5、6 ヶ月以上 = 0.2

export type FadeSchedule = "fertilize" | "pesticide" | "ph";

export interface FadeStop {
  days: number;
  opacity: number;
}

const FADE_PROFILES: Record<FadeSchedule, FadeStop[]> = {
  fertilize: [
    { days: 0, opacity: 1.0 },
    { days: 7, opacity: 1.0 },
    { days: 30, opacity: 0.5 },
    { days: 90, opacity: 0.15 },
  ],
  pesticide: [
    { days: 0, opacity: 1.0 },
    { days: 7, opacity: 1.0 },
    { days: 14, opacity: 0.5 },
    { days: 28, opacity: 0.15 },
  ],
  ph: [
    { days: 0, opacity: 1.0 },
    { days: 30, opacity: 1.0 },
    { days: 90, opacity: 0.5 },
    { days: 180, opacity: 0.2 },
  ],
};

/**
 * 経過日数 (daysElapsed) と schedule から opacity を線形補間で返す。
 *
 * - 0 日以下は最初の stop の opacity (=1.0)。
 * - 最後の stop を超えたら最後の stop の opacity を維持（ほぼ透明だが 0 にはしない）。
 * - 区間内は線形補間。
 */
export function fadeOpacity(daysElapsed: number, schedule: FadeSchedule): number {
  const stops = FADE_PROFILES[schedule];
  // stops は非空で型固定。リテラル配列に対する index アクセスでも TS の strict 設定では
  // undefined を返す型を持つので、明示的に narrow する。
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (first === undefined || last === undefined) {
    // 実質到達しない（profile が空ということは無い）が、型上のフォールバック。
    return 1;
  }
  if (!Number.isFinite(daysElapsed)) {
    // 未来日や null 由来の Infinity は最後 (=最古) の stop に倒す。
    return last.opacity;
  }
  if (daysElapsed <= first.days) return first.opacity;
  if (daysElapsed >= last.days) return last.opacity;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (a === undefined || b === undefined) continue;
    if (daysElapsed <= b.days) {
      const t = (daysElapsed - a.days) / (b.days - a.days);
      return a.opacity + (b.opacity - a.opacity) * t;
    }
  }
  return last.opacity;
}

/**
 * ISO 文字列（YYYY-MM-DD or full ISO）から経過日数を計算する。
 *
 * - null / undefined / parse 不能なら Number.POSITIVE_INFINITY を返す
 *   （= fadeOpacity に渡したとき最も透明な値に倒れる）。
 * - 未来日（now より後）は 0 として扱う。
 * - 1 日未満は floor で 0 になる。
 */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  const diff = now.getTime() - t;
  if (diff < 0) return 0;
  return Math.floor(diff / 86_400_000);
}
