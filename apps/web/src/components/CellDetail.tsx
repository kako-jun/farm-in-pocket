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
  PlantingEndTag,
  PlantingRecord,
  PlantingState,
  Season,
  SoilType,
} from "@farm-in-pocket/shared";
import {
  PLANTING_END_TAGS,
  PLANTING_END_TAG_LABELS_JA,
  PLANTING_STATE_LABELS_JA,
  daysSince,
  fadeOpacity,
} from "@farm-in-pocket/shared";
import { type JSX, useCallback, useEffect, useState } from "react";
import {
  fetchCellHistory,
  fetchCellNutrients,
  fetchCellPh,
  fetchCellRecords,
  fetchPlanting,
  recordNutrient,
  recordPesticide,
  recordPh,
  updatePlanting,
} from "../lib/grid-api";
import NutrientTimelineChart from "./charts/NutrientTimelineChart";
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
  // Issue #29: 現在の planting 詳細（state / end_tag / failure_memo / seeding_date 等）
  const [planting, setPlanting] = useState<PlantingRecord | null>(null);
  const [plantingLoading, setPlantingLoading] = useState(true);
  // 「終了する」モーダル表示フラグ
  const [endingFormOpen, setEndingFormOpen] = useState(false);
  // Issue #24: pH 測定記録 (measured_at 昇順)
  const [phRecords, setPhRecords] = useState<PhRecord[]>([]);
  const [phLoading, setPhLoading] = useState(true);
  // Issue #25: 養分タイムライン (applied_at 昇順 / 全件)
  const [allNutrients, setAllNutrients] = useState<NutrientRecord[]>([]);
  const [allNutrientsLoading, setAllNutrientsLoading] = useState(true);
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

  // Issue #29: 現在の作物 (cells.current_planting_id) の詳細を取得。
  // null（作物が植わっていないセル）なら fetch を打たず即 setPlanting(null) で終わる。
  const reloadPlanting = useCallback(async () => {
    const pid = cell?.currentPlantingId ?? null;
    if (pid == null) {
      setPlanting(null);
      setPlantingLoading(false);
      return;
    }
    setPlantingLoading(true);
    try {
      const p = await fetchPlanting(pid, pubkey);
      setPlanting(p);
    } catch (e) {
      console.warn("fetchPlanting failed", e);
      setPlanting(null);
    } finally {
      setPlantingLoading(false);
    }
  }, [cell?.currentPlantingId, pubkey]);

  // Issue #25: 養分投入の全件を時系列昇順で取得 (タイムライン用)
  const reloadAllNutrients = useCallback(async () => {
    setAllNutrientsLoading(true);
    try {
      const records = await fetchCellNutrients(grid.id, cellX, cellY, pubkey);
      setAllNutrients(records);
    } catch (e) {
      // 取得失敗は致命的でない
      console.warn("fetchCellNutrients failed", e);
      setAllNutrients([]);
    } finally {
      setAllNutrientsLoading(false);
    }
  }, [grid.id, pubkey, cellX, cellY]);

  useEffect(() => {
    void reloadRecords();
    void reloadCropHistory();
    void reloadPh();
    void reloadAllNutrients();
    void reloadPlanting();
  }, [reloadRecords, reloadCropHistory, reloadPh, reloadAllNutrients, reloadPlanting]);

  // Issue #29: state 遷移ハンドラ
  const handleSetGrowing = async (): Promise<void> => {
    if (!planting) return;
    try {
      const updated = await updatePlanting(planting.id, pubkey, { state: "growing" });
      setPlanting(updated);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "state update failed");
    }
  };

  const handleSetPlanted = async (): Promise<void> => {
    if (!planting) return;
    try {
      const updated = await updatePlanting(planting.id, pubkey, { state: "planted" });
      setPlanting(updated);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "state update failed");
    }
  };

  const handleEndPlanting = async (input: {
    endTag: PlantingEndTag;
    endDate?: string;
    failureMemo?: string;
  }): Promise<void> => {
    if (!planting) return;
    try {
      const updated = await updatePlanting(planting.id, pubkey, {
        state: "ended",
        endTag: input.endTag,
        endDate: input.endDate,
        failureMemo: input.failureMemo ?? null,
      });
      setPlanting(updated);
      setEndingFormOpen(false);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "state update failed");
    }
  };

  const handleNutrientSaved = async (input: {
    nutrientType: NutrientType;
    amount?: number;
    note?: string;
  }): Promise<void> => {
    try {
      await recordNutrient(grid.id, pubkey, cellX, cellY, input);
      setQuickForm(null);
      await reloadRecords();
      // Issue #25: タイムラインも更新
      await reloadAllNutrients();
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

        {/* 現在の作物 (Issue #29: ライフサイクル状態管理) */}
        {cell?.currentPlantingId != null && (
          <section
            data-testid="fip-cell-detail-planting-section"
            className="space-y-2 rounded border border-emerald-200 bg-emerald-50/40 p-3 text-sm"
          >
            <h4 className="text-sm font-semibold text-neutral-700">現在の作物</h4>
            {plantingLoading ? (
              <p className="text-xs text-neutral-500">読み込み中…</p>
            ) : planting ? (
              <PlantingPanel
                planting={planting}
                plantName={plantName}
                endingFormOpen={endingFormOpen}
                onSetGrowing={() => void handleSetGrowing()}
                onSetPlanted={() => void handleSetPlanted()}
                onOpenEnding={() => setEndingFormOpen(true)}
                onCancelEnding={() => setEndingFormOpen(false)}
                onSubmitEnding={handleEndPlanting}
              />
            ) : (
              <p className="text-xs text-neutral-500">作物情報の取得に失敗しました</p>
            )}
          </section>
        )}

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

        {/* 養分タイムライン (Issue #25) */}
        <section className="space-y-2" data-testid="fip-cell-detail-nutrient-timeline-section">
          <h4 className="text-sm font-semibold text-neutral-700">養分タイムライン</h4>
          {allNutrientsLoading ? (
            <p className="text-xs text-neutral-500">読み込み中…</p>
          ) : (
            <NutrientTimelineSection records={allNutrients} />
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
        // Issue #26: 各行に経過時間フェードを掛ける。古い行ほど薄い。
        const schedule = m.kind === "nutrient" ? "fertilize" : "pesticide";
        const opacity = fadeOpacity(daysSince(m.rec.appliedAt), schedule);
        if (m.kind === "nutrient") {
          return (
            <li
              key={`n-${m.rec.id}`}
              data-testid={`fip-cell-detail-history-nutrient-${m.rec.id}`}
              data-fade-opacity={opacity.toFixed(2)}
              style={{ opacity }}
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
            data-fade-opacity={opacity.toFixed(2)}
            style={{ opacity }}
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

  // リストは新しい順に直近 10 件。Issue #26: 経過日数ベースの fadeOpacity に統一。
  const recent: { rec: PhRecord; opacity: number }[] = (() => {
    const tail = records.slice(-10).reverse(); // 新しい→古い
    return tail.map((rec) => ({
      rec,
      opacity: fadeOpacity(daysSince(rec.measuredAt), "ph"),
    }));
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

      {/* 直近 10 件 (古いほど薄く / Issue #26 fade schedule "ph") */}
      {recent.length > 0 && (
        <ul data-testid="fip-cell-detail-ph-list" className="space-y-1">
          {recent.map(({ rec, opacity }) => (
            <li
              key={`ph-${rec.id}`}
              data-testid={`fip-cell-detail-ph-row-${rec.id}`}
              data-fade-opacity={opacity.toFixed(2)}
              style={{ opacity }}
              className="rounded border border-cyan-100 bg-white px-2 py-1 text-xs text-neutral-800"
            >
              📅 {rec.measuredAt.slice(0, 10)} ・ pH {rec.value.toFixed(1)}
              {rec.note && <span> ・ {rec.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 養分タイムライン セクション (Issue #25)
//   * 主要養分 (N / P / K) の最終投入日を 3 行で表示
//   * NutrientTimelineChart で全件を視覚化
// ---------------------------------------------------------------------------

const TIMELINE_SUMMARY_TYPES: { type: NutrientType; label: string }[] = [
  { type: "nitrogen", label: "窒素 (N)" },
  { type: "phosphorus", label: "リン酸 (P)" },
  { type: "potassium", label: "カリ (K)" },
];

function NutrientTimelineSection(props: { records: NutrientRecord[] }): JSX.Element {
  const { records } = props;

  // type ごとの最終投入日。records は API 側で applied_at 昇順 (新しいほど末尾) の前提だが、
  // 念のためここでも比較する。
  const lastByType: Partial<Record<NutrientType, NutrientRecord>> = {};
  for (const rec of records) {
    const prev = lastByType[rec.nutrientType];
    if (!prev || prev.appliedAt < rec.appliedAt) {
      lastByType[rec.nutrientType] = rec;
    }
  }

  return (
    <div className="space-y-2">
      {/* N / P / K 最終投入日 サマリ */}
      <ul
        data-testid="fip-cell-detail-nutrient-summary"
        className="space-y-1 rounded border border-emerald-100 bg-emerald-50/40 px-3 py-2 text-xs"
      >
        {TIMELINE_SUMMARY_TYPES.map(({ type, label }) => {
          const rec = lastByType[type];
          return (
            <li
              key={`summary-${type}`}
              data-testid={`fip-cell-detail-nutrient-summary-${type}`}
              className="flex justify-between"
            >
              <span className="text-neutral-600">{label}</span>
              <span className="font-medium text-emerald-800">
                {rec ? `最終 ${rec.appliedAt.slice(0, 10)}` : "未投入"}
              </span>
            </li>
          );
        })}
      </ul>

      {/* タイムラインチャート */}
      <NutrientTimelineChart data={records} />
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

// ---------------------------------------------------------------------------
// 現在の作物 / ライフサイクル状態パネル (Issue #29)
//   * state バッジ (植え付け / 生育中 / 終了)
//   * planted → 「生育中にする」/「終了する」
//   * growing → 「植え付けに戻す」/「終了する」
//   * ended   → end_tag と failure_memo を表示
//   * 「終了する」モーダルでは end_tag セレクト + 終了日 + failure_memo を入力
// ---------------------------------------------------------------------------

const STATE_BADGE_CLASS: Record<PlantingState, string> = {
  planted: "bg-emerald-100 text-emerald-800 border-emerald-300",
  growing: "bg-lime-100 text-lime-800 border-lime-300",
  ended: "bg-neutral-200 text-neutral-700 border-neutral-300",
};

function PlantingPanel(props: {
  planting: PlantingRecord;
  plantName: string | null;
  endingFormOpen: boolean;
  onSetGrowing: () => void;
  onSetPlanted: () => void;
  onOpenEnding: () => void;
  onCancelEnding: () => void;
  onSubmitEnding: (input: {
    endTag: PlantingEndTag;
    endDate?: string;
    failureMemo?: string;
  }) => void | Promise<void>;
}): JSX.Element {
  const {
    planting,
    plantName,
    endingFormOpen,
    onSetGrowing,
    onSetPlanted,
    onOpenEnding,
    onCancelEnding,
    onSubmitEnding,
  } = props;
  const stateLabel = PLANTING_STATE_LABELS_JA[planting.state];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="fip-cell-detail-planting-state-badge"
          className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${STATE_BADGE_CLASS[planting.state]}`}
        >
          {stateLabel}
        </span>
        {plantName && <span className="text-sm font-medium text-emerald-800">🌱 {plantName}</span>}
      </div>

      {/* 日付情報 */}
      <ul className="space-y-0.5 text-xs text-neutral-700">
        {planting.seedingDate && (
          <li data-testid="fip-cell-detail-planting-seeding-date">
            種まき: {planting.seedingDate.slice(0, 10)}
          </li>
        )}
        {planting.plantingDate && (
          <li data-testid="fip-cell-detail-planting-planting-date">
            植え付け: {planting.plantingDate.slice(0, 10)}
          </li>
        )}
        {planting.state === "ended" && planting.endDate && (
          <li data-testid="fip-cell-detail-planting-end-date">
            終了: {planting.endDate.slice(0, 10)}
          </li>
        )}
      </ul>

      {/* 終了済みなら end_tag と failure_memo を出す */}
      {planting.state === "ended" && (
        <div
          data-testid="fip-cell-detail-planting-end-summary"
          className="rounded border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700"
        >
          {planting.endTag && (
            <p>
              結果:{" "}
              <span
                data-testid="fip-cell-detail-planting-end-tag"
                className="font-semibold text-neutral-900"
              >
                {PLANTING_END_TAG_LABELS_JA[planting.endTag]}
              </span>
            </p>
          )}
          {planting.failureMemo && (
            <p data-testid="fip-cell-detail-planting-failure-memo" className="text-neutral-600">
              メモ: {planting.failureMemo}
            </p>
          )}
        </div>
      )}

      {/* 状態遷移ボタン */}
      {!endingFormOpen && (
        <div className="flex flex-wrap gap-2">
          {planting.state === "planted" && (
            <button
              type="button"
              data-testid="fip-cell-detail-planting-to-growing"
              onClick={onSetGrowing}
              className="rounded-lg border border-lime-400 bg-lime-50 px-3 py-2 text-xs text-lime-800 hover:bg-lime-100"
              style={{ minHeight: 36 }}
            >
              生育中にする
            </button>
          )}
          {planting.state === "growing" && (
            <button
              type="button"
              data-testid="fip-cell-detail-planting-to-planted"
              onClick={onSetPlanted}
              className="rounded-lg border border-emerald-400 bg-white px-3 py-2 text-xs text-emerald-800 hover:bg-emerald-50"
              style={{ minHeight: 36 }}
            >
              植え付けに戻す
            </button>
          )}
          {planting.state !== "ended" && (
            <button
              type="button"
              data-testid="fip-cell-detail-planting-end-open"
              onClick={onOpenEnding}
              className="rounded-lg border border-neutral-400 bg-white px-3 py-2 text-xs text-neutral-700 hover:bg-neutral-100"
              style={{ minHeight: 36 }}
            >
              終了する
            </button>
          )}
        </div>
      )}

      {/* 終了モーダル（インラインフォーム） */}
      {endingFormOpen && <PlantingEndForm onCancel={onCancelEnding} onSubmit={onSubmitEnding} />}
    </div>
  );
}

function PlantingEndForm(props: {
  onCancel: () => void;
  onSubmit: (input: {
    endTag: PlantingEndTag;
    endDate?: string;
    failureMemo?: string;
  }) => void | Promise<void>;
}): JSX.Element {
  const [endTag, setEndTag] = useState<PlantingEndTag>("fruited");
  const [endDate, setEndDate] = useState(todayYmd());
  const [failureMemo, setFailureMemo] = useState("");
  return (
    <div
      data-testid="fip-cell-detail-planting-end-form"
      className="space-y-2 rounded border border-neutral-300 bg-white p-3"
    >
      <label className="block text-xs">
        終了タグ
        <select
          data-testid="fip-cell-detail-planting-end-tag-select"
          value={endTag}
          onChange={(e) => setEndTag(e.target.value as PlantingEndTag)}
          className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2 text-sm"
        >
          {PLANTING_END_TAGS.map((tag) => (
            <option key={tag} value={tag}>
              {PLANTING_END_TAG_LABELS_JA[tag]}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs">
        終了日
        <input
          type="date"
          data-testid="fip-cell-detail-planting-end-date-input"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-xs">
        失敗メモ (任意)
        <textarea
          data-testid="fip-cell-detail-planting-failure-memo-input"
          value={failureMemo}
          onChange={(e) => setFailureMemo(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2 text-sm"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="fip-cell-detail-planting-end-submit"
          onClick={() => {
            void props.onSubmit({
              endTag,
              endDate: endDate || undefined,
              failureMemo: failureMemo.trim() === "" ? undefined : failureMemo.trim(),
            });
          }}
          className="rounded-lg bg-neutral-700 px-3 py-2 text-xs font-semibold text-white"
          style={{ minHeight: 36 }}
        >
          終了する
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
