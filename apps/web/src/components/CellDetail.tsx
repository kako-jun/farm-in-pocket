// CellDetail: セル詳細モーダル（履歴 + クイック施肥/農薬記録）
// Issue: kako-jun/farm-in-pocket#15
//
// 主画面: 容器/用土・現在の作物・最近の履歴・クイック記録ボタン。
// 編集アクション（容器/用土を変える / VOID / クリア / 作物）は下部に小さく link 群として並ぶ。
// 経過時間 fade は対象外（Phase 2 / #26）。30 日 / 14 日の閾値判定だけ親側でやる。

import type {
  CellRecord,
  ContainerType,
  GridRecord,
  NutrientRecord,
  NutrientType,
  PesticideRecord,
  PesticideType,
  SoilType,
} from "@farm-in-pocket/shared";
import { type JSX, useCallback, useEffect, useState } from "react";
import { fetchCellRecords, recordNutrient, recordPesticide } from "../lib/grid-api";

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

type QuickFormKind = null | "nutrient" | "pesticide";

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

  useEffect(() => {
    void reloadRecords();
  }, [reloadRecords]);

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

        {/* 履歴 */}
        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-neutral-700">履歴（直近 10 件ずつ）</h4>
          {loading ? (
            <p className="text-xs text-neutral-500">読み込み中…</p>
          ) : (
            <HistoryList nutrients={nutrients} pesticides={pesticides} />
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
