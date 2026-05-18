// CellDetail: セル詳細モーダル（履歴 + クイック施肥/農薬記録）
// Issue: kako-jun/farm-in-pocket#15
//
// 主画面: 容器/用土・現在の作物・最近の履歴・クイック記録ボタン。
// 編集アクション（容器/用土を変える / VOID / クリア / 作物）は下部に小さく link 群として並ぶ。
// 経過時間 fade は対象外（Phase 2 / #26）。30 日 / 14 日の閾値判定だけ親側でやる。

import type {
  CellRecord,
  ContainerType,
  CropHistoryRecord,
  GridRecord,
  NutrientRecord,
  NutrientType,
  PesticideRecord,
  PesticideType,
  PhRecord,
  Season,
  SoilType,
} from "@farm-in-pocket/shared";
import { type JSX, useCallback, useEffect, useState } from "react";
import {
  fetchCellHistory,
  fetchCellPh,
  fetchCellRecords,
  recordNutrient,
  recordPesticide,
  recordPh,
} from "../lib/grid-api";
import PhTimelineChart from "./charts/PhTimelineChart";

const CONTAINER_LABELS: Record<ContainerType, string> = {
  jiue: "地植え",
  planter: "プランター",
  pot: "鉢",
  container: "コンテナ",
  board_mounted: "板付け",
  hanging: "ハンギング",
  hydroponics: "水耕",
  other: "その他",
  void: "VOID（畝の外）",
};

const SOIL_LABELS: Record<SoilType, string> = {
  potting_mix: "培養土",
  akadama: "赤玉土",
  leafmold: "腐葉土",
  hydroball: "ハイドロボール",
  sphagnum: "水苔",
  coconut_chips: "ココチップ",
  pumice: "軽石",
  sand: "砂",
  water_only: "水のみ",
  hydroponics_nutrient: "養液（水耕）",
  none: "なし",
  other: "その他",
};

const NUTRIENT_LABELS: Record<NutrientType, string> = {
  nitrogen: "窒素 (N)",
  phosphorus: "リン酸 (P)",
  potassium: "カリ (K)",
  calcium: "カルシウム",
  magnesium: "マグネシウム",
  sulfur: "硫黄",
  iron: "鉄",
  manganese: "マンガン",
  zinc: "亜鉛",
  boron: "ホウ素",
  organic: "有機質肥料",
  other: "その他",
};

const SEASON_LABELS: Record<Season, string> = {
  spring: "春",
  summer: "夏",
  autumn: "秋",
  winter: "冬",
};

const PESTICIDE_LABELS: Record<PesticideType, string> = {
  insecticide: "殺虫剤",
  fungicide: "殺菌剤",
  herbicide: "除草剤",
  repellent: "忌避剤",
  adhesive: "展着剤",
  other: "その他",
};

const NUTRIENT_TYPES = Object.keys(NUTRIENT_LABELS) as NutrientType[];
const PESTICIDE_TYPES = Object.keys(PESTICIDE_LABELS) as PesticideType[];

export interface CellDetailProps {
  pubkey: string;
  grid: GridRecord;
  cell: CellRecord | null; // 未設定セル（容器も用土も無い）の場合は null も許容
  cellX: number;
  cellY: number;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  // 編集アクションへの委譲（既存 GridEditor 側のフローに合わせる）
  onEditContainer: () => void;
  onEditSoil: () => void;
  onPlant: () => void;
  onSetVoid: () => void | Promise<void>;
  onClear: () => void | Promise<void>;
}

type QuickFormKind = null | "nutrient" | "pesticide" | "ph";

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CellDetail(props: CellDetailProps): JSX.Element {
  const {
    pubkey,
    grid,
    cell,
    cellX,
    cellY,
    onClose,
    onChanged,
    onEditContainer,
    onEditSoil,
    onPlant,
    onSetVoid,
    onClear,
  } = props;

  const [loading, setLoading] = useState(true);
  const [nutrients, setNutrients] = useState<NutrientRecord[]>([]);
  const [pesticides, setPesticides] = useState<PesticideRecord[]>([]);
  const [cropHistory, setCropHistory] = useState<CropHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  // Issue #24: pH 測定記録 (measured_at 昇順)
  const [phRecords, setPhRecords] = useState<PhRecord[]>([]);
  const [phLoading, setPhLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quickForm, setQuickForm] = useState<QuickFormKind>(null);

  const reloadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchCellRecords(grid.id, pubkey, cellX, cellY);
      setNutrients(r.nutrients);
      setPesticides(r.pesticides);
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, [grid.id, pubkey, cellX, cellY]);

  // Issue #22: 座標ベース連作履歴を取得。
  const reloadCropHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const r = await fetchCellHistory(grid.id, cellX, cellY, pubkey);
      setCropHistory(r.records);
    } catch (e) {
      // 履歴取得失敗は致命的でないため error 表示には載せず console に流すのみ
      // (記録系の error と分離するため別 setError は呼ばない)
      console.warn("fetchCellHistory failed", e);
      setCropHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [grid.id, pubkey, cellX, cellY]);

  // Issue #24: pH 測定記録を取得
  const reloadPh = useCallback(async () => {
    setPhLoading(true);
    try {
      const records = await fetchCellPh(grid.id, cellX, cellY, pubkey);
      setPhRecords(records);
    } catch (e) {
      // pH 取得失敗は致命的でない
      console.warn("fetchCellPh failed", e);
      setPhRecords([]);
    } finally {
      setPhLoading(false);
    }
  }, [grid.id, pubkey, cellX, cellY]);

  useEffect(() => {
    void reloadRecords();
    void reloadCropHistory();
    void reloadPh();
  }, [reloadRecords, reloadCropHistory, reloadPh]);

  const handleNutrientSaved = async (input: {
    nutrientType: NutrientType;
    amount?: number;
    note?: string;
  }): Promise<void> => {
    try {
      await recordNutrient(grid.id, pubkey, cellX, cellY, input);
      setQuickForm(null);
      await reloadRecords();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    }
  };

  const handlePesticideSaved = async (input: {
    pesticideType: PesticideType;
    amount?: number;
    note?: string;
  }): Promise<void> => {
    try {
      await recordPesticide(grid.id, pubkey, cellX, cellY, input);
      setQuickForm(null);
      await reloadRecords();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    }
  };

  // Issue #24: pH 測定保存
  const handlePhSaved = async (input: {
    value: number;
    measuredAt?: string;
    note?: string;
  }): Promise<void> => {
    try {
      await recordPh(grid.id, cellX, cellY, { pubkey, ...input });
      setQuickForm(null);
      await reloadPh();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    }
  };

  const containerLabel = cell?.containerType ? CONTAINER_LABELS[cell.containerType] : "未設定";
  const soilLabel = cell?.soilType ? SOIL_LABELS[cell.soilType] : "未設定";
  const plantName = cell?.currentPlantName ?? null;

  return (
    <div
      data-testid="fip-cell-detail-modal"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-md space-y-4 overflow-y-auto rounded-lg bg-white p-5 max-h-[90vh]">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold" data-testid="fip-cell-detail-title">
            {grid.name} ({cellX}, {cellY})
            {plantName != null && (
              <span className="ml-2 text-sm text-emerald-700">🌱 {plantName}</span>
            )}
          </h3>
          <button
            type="button"
            data-testid="fip-cell-detail-close"
            onClick={onClose}
            className="text-sm text-neutral-500"
          >
            閉じる
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* 容器/用土 */}
        <section
          data-testid="fip-cell-detail-container-soil"
          className="space-y-1 rounded border border-neutral-200 p-3 text-sm"
        >
          <div className="flex justify-between">
            <span className="text-neutral-600">容器</span>
            <span className="font-medium" data-testid="fip-cell-detail-container">
              {containerLabel}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-600">用土</span>
            <span className="font-medium" data-testid="fip-cell-detail-soil">
              {soilLabel}
            </span>
          </div>
        </section>

        {/* 最近の作業 (クイックアクション) */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-neutral-700">最近の作業</h4>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              data-testid="fip-cell-detail-quick-water"
              // TODO(#後続 Issue): plantings の watering_settings に統合して水やり実施を記録する。
              // 現状はバッジ表示しか担当しない。
              onClick={() => {
                setError("水やりは作物（planting）に紐付くため、別 Issue で実装予定です。");
              }}
              className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-3 text-sm text-sky-700 hover:bg-sky-100"
              style={{ minHeight: 44 }}
              aria-label="水やり (準備中)"
            >
              💧 水やり
            </button>
            <button
              type="button"
              data-testid="fip-cell-detail-quick-nutrient"
              onClick={() => setQuickForm(quickForm === "nutrient" ? null : "nutrient")}
              className="rounded-lg border border-emerald-400 bg-emerald-50 px-3 py-3 text-sm text-emerald-700 hover:bg-emerald-100"
              style={{ minHeight: 44 }}
            >
              🍃 施肥
            </button>
            <button
              type="button"
              data-testid="fip-cell-detail-quick-pesticide"
              onClick={() => setQuickForm(quickForm === "pesticide" ? null : "pesticide")}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-700 hover:bg-red-100"
              style={{ minHeight: 44 }}
            >
              🛡️ 農薬
            </button>
          </div>

          {quickForm === "nutrient" && (
            <NutrientQuickForm onCancel={() => setQuickForm(null)} onSubmit={handleNutrientSaved} />
          )}
          {quickForm === "pesticide" && (
            <PesticideQuickForm
              onCancel={() => setQuickForm(null)}
              onSubmit={handlePesticideSaved}
            />
          )}
        </section>

        {/* 土壌 pH (Issue #24) */}
        <section className="space-y-2" data-testid="fip-cell-detail-ph-section">
          <h4 className="text-sm font-semibold text-neutral-700">土壌 pH</h4>
          {phLoading ? (
            <p className="text-xs text-neutral-500">読み込み中…</p>
          ) : (
            <PhSection
              records={phRecords}
              onOpenForm={() => setQuickForm(quickForm === "ph" ? null : "ph")}
              showForm={quickForm === "ph"}
              onCancel={() => setQuickForm(null)}
              onSubmit={handlePhSaved}
            />
          )}
        </section>

        {/* 履歴 */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-neutral-700">履歴（直近 10 件ずつ）</h4>
          {loading ? (
            <p className="text-xs text-neutral-500">読み込み中…</p>
          ) : (
            <HistoryList nutrients={nutrients} pesticides={pesticides} />
          )}
        </section>

        {/* 過去履歴（座標ベース連作履歴 / Issue #22） */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-neutral-700">過去履歴（直近 10 件）</h4>
          {historyLoading ? (
            <p className="text-xs text-neutral-500">読み込み中…</p>
          ) : (
            <CropHistoryList records={cropHistory} />
          )}
        </section>

        {/* 編集アクション（小さめ） */}
        <section className="space-y-2 border-t border-neutral-200 pt-3">
          <h4 className="text-xs font-semibold text-neutral-500">セルの設定を変える</h4>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="fip-cell-detail-edit-container"
              onClick={onEditContainer}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-xs"
              style={{ minHeight: 36 }}
            >
              容器を変える
            </button>
            <button
              type="button"
              data-testid="fip-cell-detail-edit-soil"
              onClick={onEditSoil}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-xs"
              style={{ minHeight: 36 }}
            >
              用土を変える
            </button>
            <button
              type="button"
              data-testid="fip-cell-detail-edit-plant"
              onClick={onPlant}
              className="rounded border border-emerald-400 bg-emerald-50 px-3 py-2 text-xs text-emerald-700"
              style={{ minHeight: 36 }}
            >
              作物を植える
            </button>
            <button
              type="button"
              data-testid="fip-cell-detail-edit-void"
              onClick={() => void onSetVoid()}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-xs"
              style={{ minHeight: 36 }}
            >
              VOID にする
            </button>
            <button
              type="button"
              data-testid="fip-cell-detail-edit-clear"
              onClick={() => void onClear()}
              className="rounded border border-red-300 bg-white px-3 py-2 text-xs text-red-700"
              style={{ minHeight: 36 }}
            >
              クリア
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 履歴リスト
// ---------------------------------------------------------------------------

function HistoryList(props: {
  nutrients: NutrientRecord[];
  pesticides: PesticideRecord[];
}): JSX.Element {
  const { nutrients, pesticides } = props;
  // 2 種類の record を applied_at 降順でマージして 1 リストに
  type Mixed =
    | { kind: "nutrient"; rec: NutrientRecord }
    | { kind: "pesticide"; rec: PesticideRecord };
  const all: Mixed[] = [
    ...nutrients.map<Mixed>((rec) => ({ kind: "nutrient", rec })),
    ...pesticides.map<Mixed>((rec) => ({ kind: "pesticide", rec })),
  ].sort((a, b) => (a.rec.appliedAt < b.rec.appliedAt ? 1 : -1));

  if (all.length === 0) {
    return (
      <p className="text-xs text-neutral-500" data-testid="fip-cell-detail-history-empty">
        まだ記録がありません
      </p>
    );
  }
  return (
    <ul data-testid="fip-cell-detail-history" className="space-y-1">
      {all.map((m) => {
        const dateStr = m.rec.appliedAt.slice(0, 10);
        if (m.kind === "nutrient") {
          return (
            <li
              key={`n-${m.rec.id}`}
              data-testid={`fip-cell-detail-history-nutrient-${m.rec.id}`}
              className="rounded border border-emerald-100 bg-emerald-50/50 px-2 py-1 text-xs"
            >
              📅 {dateStr} 🍃 施肥 {NUTRIENT_LABELS[m.rec.nutrientType]}
              {m.rec.amount != null && (
                <span>
                  {" "}
                  ・ {m.rec.amount}
                  {m.rec.amountUnit ?? ""}
                </span>
              )}
              {m.rec.note && <span className="text-neutral-500"> ・ {m.rec.note}</span>}
            </li>
          );
        }
        return (
          <li
            key={`p-${m.rec.id}`}
            data-testid={`fip-cell-detail-history-pesticide-${m.rec.id}`}
            className="rounded border border-red-100 bg-red-50/50 px-2 py-1 text-xs"
          >
            📅 {dateStr} 🛡️ 農薬 {PESTICIDE_LABELS[m.rec.pesticideType]}
            {m.rec.dilutionRatio != null && <span> ・ {m.rec.dilutionRatio}倍</span>}
            {m.rec.note && <span className="text-neutral-500"> ・ {m.rec.note}</span>}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// 過去履歴リスト（Issue #22: 座標ベース連作履歴）
// ---------------------------------------------------------------------------

function CropHistoryList(props: { records: CropHistoryRecord[] }): JSX.Element {
  const { records } = props;
  if (records.length === 0) {
    return (
      <p className="text-xs text-neutral-500" data-testid="fip-cell-detail-crop-history-empty">
        このセルでの過去履歴はまだありません
      </p>
    );
  }
  return (
    <ul data-testid="fip-cell-detail-crop-history" className="space-y-1">
      {records.map((rec) => {
        const seasonLabel = rec.season ? SEASON_LABELS[rec.season] : "—";
        return (
          <li
            key={`ch-${rec.id}`}
            data-testid={`fip-cell-detail-crop-history-${rec.id}`}
            className="rounded border border-amber-100 bg-amber-50/50 px-2 py-1 text-xs"
          >
            🌱 {rec.year}年 {seasonLabel} {rec.plantName}（{rec.plantFamily}）
            {rec.endedAt && <span className="text-neutral-500"> ・ ～{rec.endedAt}</span>}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// pH セクション (Issue #24)
//   * 最新の pH と測定日
//   * 「pH 測定を記録」ボタン → フォーム
//   * 直近 10 件のリスト（古いほどフェード）
//   * 時系列グラフ（自前 SVG, ../charts/PhTimelineChart）
// ---------------------------------------------------------------------------

function PhSection(props: {
  records: PhRecord[]; // measured_at 昇順 (古い→新しい)
  onOpenForm: () => void;
  showForm: boolean;
  onCancel: () => void;
  onSubmit: (input: { value: number; measuredAt?: string; note?: string }) => void | Promise<void>;
}): JSX.Element {
  const { records, onOpenForm, showForm, onCancel, onSubmit } = props;

  const latest = records.length > 0 ? records[records.length - 1] : null;

  // グラフ用は全件（昇順そのまま）。日付は YYYY-MM-DD に丸める。
  const chartData = records.map((r) => ({
    date: r.measuredAt.slice(0, 10),
    value: r.value,
  }));

  // リストは新しい順に直近 10 件
  // 古いほど薄く → 表示は新しい→古いの順だが、records 内 index が小さいほど古い。
  // 直近 10 件: 末尾 10 件を逆順で取り出す。
  const recent: { rec: PhRecord; ageIdx: number; total: number }[] = (() => {
    const tail = records.slice(-10); // 古いから新しい
    return tail.reverse().map((rec, i) => {
      // tail を reverse したので i=0 が最新, i=tail.length-1 が最も古い
      // 古いほどフェードしたいので「i が大きいほど薄い」になる
      return { rec, ageIdx: i, total: tail.length };
    });
  })();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded border border-cyan-200 bg-cyan-50/40 px-3 py-2 text-sm">
        <div>
          <span className="text-neutral-600">現在の pH</span>
          <span
            className="ml-2 font-semibold text-cyan-800"
            data-testid="fip-cell-detail-ph-current"
          >
            {latest ? latest.value.toFixed(1) : "未測定"}
          </span>
          {latest && (
            <span
              className="ml-2 text-xs text-neutral-500"
              data-testid="fip-cell-detail-ph-current-date"
            >
              （{latest.measuredAt.slice(0, 10)}）
            </span>
          )}
        </div>
        <button
          type="button"
          data-testid="fip-cell-detail-ph-open"
          onClick={onOpenForm}
          className="rounded-lg border border-cyan-400 bg-white px-3 py-2 text-xs text-cyan-700 hover:bg-cyan-50"
          style={{ minHeight: 36 }}
        >
          pH 測定を記録
        </button>
      </div>

      {showForm && <PhQuickForm onCancel={onCancel} onSubmit={onSubmit} />}

      {/* 時系列グラフ */}
      <PhTimelineChart data={chartData} />

      {/* 直近 10 件 (古いほど薄く) */}
      {recent.length > 0 && (
        <ul data-testid="fip-cell-detail-ph-list" className="space-y-1">
          {recent.map(({ rec, ageIdx, total }) => {
            // ageIdx=0 が最新 → 黒、ageIdx=total-1 が最古 → 薄い
            // Tailwind: 最新 text-neutral-800, 中間 text-neutral-500, 最古 text-neutral-400
            const fade =
              ageIdx === 0
                ? "text-neutral-800"
                : ageIdx >= total - 2 && total >= 3
                  ? "text-neutral-400"
                  : "text-neutral-500";
            return (
              <li
                key={`ph-${rec.id}`}
                data-testid={`fip-cell-detail-ph-row-${rec.id}`}
                data-fade-class={fade}
                className={`rounded border border-cyan-100 bg-white px-2 py-1 text-xs ${fade}`}
              >
                📅 {rec.measuredAt.slice(0, 10)} ・ pH {rec.value.toFixed(1)}
                {rec.note && <span> ・ {rec.note}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// pH 測定クイックフォーム (Issue #24)
// ---------------------------------------------------------------------------

function PhQuickForm(props: {
  onCancel: () => void;
  onSubmit: (input: { value: number; measuredAt?: string; note?: string }) => void | Promise<void>;
}): JSX.Element {
  const [value, setValue] = useState("6.5");
  const [measuredAt, setMeasuredAt] = useState(todayYmd());
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  return (
    <div
      data-testid="fip-cell-detail-ph-form"
      className="space-y-2 rounded border border-cyan-200 bg-white p-3"
    >
      <label className="block text-xs">
        pH (0-14、推奨 3-10)
        <input
          type="number"
          step="0.1"
          min="0"
          max="14"
          data-testid="fip-cell-detail-ph-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-xs">
        測定日
        <input
          type="date"
          data-testid="fip-cell-detail-ph-date"
          value={measuredAt}
          onChange={(e) => setMeasuredAt(e.target.value)}
          className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-xs">
        メモ (任意)
        <input
          type="text"
          data-testid="fip-cell-detail-ph-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2 text-sm"
        />
      </label>
      {localError && (
        <p className="text-xs text-red-600" data-testid="fip-cell-detail-ph-error">
          {localError}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="fip-cell-detail-ph-submit"
          onClick={() => {
            const num = Number(value);
            if (!Number.isFinite(num) || num < 0 || num > 14) {
              setLocalError("pH は 0-14 の数値で入力してください");
              return;
            }
            setLocalError(null);
            void props.onSubmit({
              value: num,
              measuredAt: measuredAt || undefined,
              note: note.trim() === "" ? undefined : note.trim(),
            });
          }}
          className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white"
          style={{ minHeight: 36 }}
        >
          記録する
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-xs"
          style={{ minHeight: 36 }}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// クイック施肥フォーム
// ---------------------------------------------------------------------------

function NutrientQuickForm(props: {
  onCancel: () => void;
  onSubmit: (input: {
    nutrientType: NutrientType;
    amount?: number;
    note?: string;
  }) => void | Promise<void>;
}): JSX.Element {
  const [nutrientType, setNutrientType] = useState<NutrientType>("organic");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <div
      data-testid="fip-cell-detail-nutrient-form"
      className="space-y-2 rounded border border-emerald-200 bg-white p-3"
    >
      <label className="block text-xs">
        種別
        <select
          data-testid="fip-cell-detail-nutrient-type"
          value={nutrientType}
          onChange={(e) => setNutrientType(e.target.value as NutrientType)}
          className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2 text-sm"
        >
          {NUTRIENT_TYPES.map((k) => (
            <option key={k} value={k}>
              {NUTRIENT_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        量 (任意 / 数値)
        <input
          type="number"
          step="0.1"
          data-testid="fip-cell-detail-nutrient-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-xs">
        メモ (任意)
        <input
          type="text"
          data-testid="fip-cell-detail-nutrient-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2 text-sm"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="fip-cell-detail-nutrient-submit"
          onClick={() => {
            const num = amount === "" ? undefined : Number(amount);
            void props.onSubmit({
              nutrientType,
              amount: typeof num === "number" && Number.isFinite(num) ? num : undefined,
              note: note.trim() === "" ? undefined : note.trim(),
            });
          }}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
          style={{ minHeight: 36 }}
        >
          記録する
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-xs"
          style={{ minHeight: 36 }}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// クイック農薬フォーム
// ---------------------------------------------------------------------------

function PesticideQuickForm(props: {
  onCancel: () => void;
  onSubmit: (input: {
    pesticideType: PesticideType;
    amount?: number;
    note?: string;
  }) => void | Promise<void>;
}): JSX.Element {
  const [pesticideType, setPesticideType] = useState<PesticideType>("insecticide");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  return (
    <div
      data-testid="fip-cell-detail-pesticide-form"
      className="space-y-2 rounded border border-red-200 bg-white p-3"
    >
      <label className="block text-xs">
        種別
        <select
          data-testid="fip-cell-detail-pesticide-type"
          value={pesticideType}
          onChange={(e) => setPesticideType(e.target.value as PesticideType)}
          className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2 text-sm"
        >
          {PESTICIDE_TYPES.map((k) => (
            <option key={k} value={k}>
              {PESTICIDE_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        量 (任意 / 数値)
        <input
          type="number"
          step="0.1"
          data-testid="fip-cell-detail-pesticide-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-xs">
        メモ (任意)
        <input
          type="text"
          data-testid="fip-cell-detail-pesticide-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2 text-sm"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="fip-cell-detail-pesticide-submit"
          onClick={() => {
            const num = amount === "" ? undefined : Number(amount);
            void props.onSubmit({
              pesticideType,
              amount: typeof num === "number" && Number.isFinite(num) ? num : undefined,
              note: note.trim() === "" ? undefined : note.trim(),
            });
          }}
          className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white"
          style={{ minHeight: 36 }}
        >
          記録する
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-xs"
          style={{ minHeight: 36 }}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
