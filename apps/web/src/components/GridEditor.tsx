import type {
  CellRecord,
  ContainerType,
  GridEnvironment,
  GridLighting,
  GridRecord,
  PlantSummary,
  RotationWarning,
  SoilType,
} from "@farm-in-pocket/shared";
import { daysSince, fadeOpacity } from "@farm-in-pocket/shared";
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createGrid,
  createPlanting,
  deleteCell,
  deleteGrid,
  deletePlanting,
  listGrids,
  putCell,
  searchPlants,
  updateGrid,
} from "../lib/grid-api";
import { getMyKeyPair } from "../lib/keys";
import CellDetail from "./CellDetail";

const ENVIRONMENT_LABELS: Record<GridEnvironment, string> = {
  outdoor_sunny: "屋外（日向）",
  outdoor_partial_shade: "屋外（半日陰）",
  outdoor_shade: "屋外（日陰）",
  indoor: "室内",
  greenhouse: "温室",
};

const LIGHTING_LABELS: Record<GridLighting, string> = {
  natural_only: "自然光のみ",
  grow_light: "育成ライト",
  fluorescent_led: "蛍光灯 / LED",
};

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

// セルの容器種類を一目で識別するための絵文字。VOID は別途斜線テクスチャで描画する。
const CONTAINER_ICONS: Record<Exclude<ContainerType, "void">, string> = {
  jiue: "🟫",
  planter: "🪴",
  pot: "🪴",
  container: "📦",
  board_mounted: "🪵",
  hanging: "⛓️",
  hydroponics: "💧",
  other: "⚙️",
};

const OUTDOOR_CONTAINERS: ContainerType[] = [
  "jiue",
  "planter",
  "pot",
  "container",
  "hydroponics",
  "other",
];
const INDOOR_CONTAINERS: ContainerType[] = [
  "pot",
  "planter",
  "container",
  "board_mounted",
  "hanging",
  "hydroponics",
  "other",
];

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

// アクティブグリッド永続化キー（README に明記）
const ACTIVE_GRID_KEY = "fip:active-grid-id-v1";
// グリッド名の最大長（UI で 32 文字に丸める。サーバー側は 100 まで許容するが UX 上短く）
const GRID_NAME_MAX = 32;

function containerOptionsFor(env: GridEnvironment): ContainerType[] {
  if (env === "indoor") return INDOOR_CONTAINERS;
  return OUTDOOR_CONTAINERS;
}

type CellMap = Map<string, CellRecord>;
function buildCellMap(cells: CellRecord[]): CellMap {
  const m = new Map<string, CellRecord>();
  for (const c of cells) m.set(`${c.x},${c.y}`, c);
  return m;
}

// "detail" は Issue #15 で追加した CellDetail（履歴 + クイック施肥/農薬）の主画面。
// "menu" は旧 Phase 1 のメニュー UI で、既存テストが触っているので互換維持のため残す。
// "seed-product" は Issue #34 で plant を選んだ後の任意ステップ。
type ModalKind = "detail" | "menu" | "container" | "soil" | "plant" | "seed-product" | null;

// Issue #26: 経過時間 fade。閾値で「表示/非表示」を切り替えるのではなく、
// lastFertilizedAt / lastPesticideAt が記録されていれば常にバッジを出し、
// 経過日数を opacity で表現する（fadeOpacity）。
// 「もう古いから消す」のではなく「だいぶ前にやったな」を視覚的に残すデザイン。

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

/** 経過日数を人間に分かりやすい aria-label 用の文字列に変換する。 */
function ageLabel(days: number): string {
  if (days <= 0) return "今日";
  if (days === 1) return "1日前";
  if (days < 30) return `${days}日前`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months}ヶ月前`;
  }
  const years = Math.floor(days / 365);
  return `${years}年前`;
}

interface OpenCell {
  x: number;
  y: number;
}

export default function GridEditor(): JSX.Element {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [pubkeyChecked, setPubkeyChecked] = useState(false);
  const [grids, setGrids] = useState<GridRecord[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // 初回 reload 完了までは「localStorage への書き戻し」を抑止する。
  // mount 直後の activeId=null が書き戻し effect で発火すると、
  // 既に保存された active grid id を消してしまうため。
  const hydratedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // 新規作成モーダル
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("マイ畑");
  const [createEnv, setCreateEnv] = useState<GridEnvironment>("outdoor_sunny");
  const [createLight, setCreateLight] = useState<GridLighting | "">("");
  const [createX, setCreateX] = useState(5);
  const [createY, setCreateY] = useState(5);

  // 並び替え・削除モード（タブバーの「・・・」から）
  const [manageMode, setManageMode] = useState(false);
  // 削除確認ダイアログ
  const [deleteConfirm, setDeleteConfirm] = useState<GridRecord | null>(null);

  // タブ上での名前インライン編集
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  // セルモーダル
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);

  // サイズ変更確認
  const [resizeConfirm, setResizeConfirm] = useState<{ sizeX: number; sizeY: number } | null>(null);

  // Issue #23: 連作障害警告ダイアログ。
  // PlantPicker で選んだ作物が、対象座標の crop_history に同 family の最新行を持つときに開く。
  // OK 押下で confirmRotation: true を再 POST する。キャンセルでフォーム（plant モーダル）に戻す。
  const [rotationConfirm, setRotationConfirm] = useState<{
    plant: PlantSummary;
    warning: RotationWarning;
  } | null>(null);

  // タブ DOM 参照: activeId が変わったときに横スクロールで中央寄せ
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    const kp = getMyKeyPair();
    setPubkey(kp?.pubkey ?? null);
    setPubkeyChecked(true);
  }, []);

  // アクティブタブが画面外にあれば視野に入れる
  // happy-dom など jsdom 互換で scrollIntoView が未定義のケースに備えてオプショナル呼び出し
  useEffect(() => {
    if (activeId == null) return;
    const el = tabRefs.current[activeId];
    el?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [activeId]);

  const reload = useCallback(async (pk: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await listGrids(pk);
      setGrids(list);
      // アクティブグリッド復元: localStorage の ID が現存しなければ先頭にフォールバック
      const stored =
        typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_GRID_KEY) : null;
      const found = stored != null ? list.find((g) => g.id === stored) : undefined;
      const next = found ?? list[0] ?? null;
      setActiveId(next?.id ?? null);
      hydratedRef.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pubkey === null) {
      setLoading(false);
      return;
    }
    void reload(pubkey);
  }, [pubkey, reload]);

  // アクティブ ID を localStorage に書き戻し（初回 reload が終わってからのみ）
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hydratedRef.current) return;
    if (activeId == null) {
      window.localStorage.removeItem(ACTIVE_GRID_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_GRID_KEY, activeId);
    }
  }, [activeId]);

  const grid = useMemo(() => grids.find((g) => g.id === activeId) ?? null, [grids, activeId]);
  const cellMap = useMemo(() => (grid ? buildCellMap(grid.cells) : new Map()), [grid]);

  // grids state を id で更新する小道具
  const replaceGrid = useCallback((updated: GridRecord) => {
    setGrids((gs) => gs.map((g) => (g.id === updated.id ? updated : g)));
  }, []);

  // ---- handlers --------------------------------------------------------

  const handleCreate = async (): Promise<void> => {
    if (pubkey === null) return;
    try {
      const trimmed = createName.trim().slice(0, GRID_NAME_MAX);
      const g = await createGrid({
        pubkey,
        name: trimmed.length > 0 ? trimmed : "マイ畑",
        environment: createEnv,
        lighting: createEnv === "indoor" ? createLight || null : null,
        sizeX: createX,
        sizeY: createY,
      });
      setGrids((gs) => [...gs, g]);
      setActiveId(g.id);
      setShowCreate(false);
      // 入力値はリセットして次回の追加に備える
      setCreateName("マイ畑");
      setCreateEnv("outdoor_sunny");
      setCreateLight("");
      setCreateX(5);
      setCreateY(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : "create failed");
    }
  };

  const handleDelete = async (target: GridRecord): Promise<void> => {
    if (pubkey === null) return;
    try {
      await deleteGrid(target.id, pubkey);
      setGrids((gs) => {
        const next = gs.filter((g) => g.id !== target.id);
        // アクティブが消えたら次の grid にフォールバック
        if (activeId === target.id) {
          setActiveId(next[0]?.id ?? null);
        }
        return next;
      });
      setDeleteConfirm(null);
      // 削除し切ったら manage mode 解除
      if (grids.length <= 1) setManageMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
    }
  };

  const handleMove = async (id: string, dir: -1 | 1): Promise<void> => {
    if (pubkey === null) return;
    const idx = grids.findIndex((g) => g.id === id);
    if (idx < 0) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= grids.length) return;
    const a = grids[idx];
    const b = grids[swapIdx];
    if (!a || !b) return;
    // sort_order を入れ替えて 2 件 PATCH。
    // TODO(Phase 2): bulk PATCH endpoint を追加して 1 リクエストで済ませる
    try {
      const [ra, rb] = await Promise.all([
        updateGrid(a.id, pubkey, { sortOrder: b.sortOrder }),
        updateGrid(b.id, pubkey, { sortOrder: a.sortOrder }),
      ]);
      setGrids((gs) => {
        const map = new Map(gs.map((g) => [g.id, g]));
        map.set(ra.grid.id, ra.grid);
        map.set(rb.grid.id, rb.grid);
        return Array.from(map.values()).sort((x, y) => x.sortOrder - y.sortOrder);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "reorder failed");
      // 片方失敗時はサーバーから再取得して UI と整合させる
      // (Promise.all で片方だけ成功すると sortOrder が部分適用された状態になり、
      //  ローカルの楽観更新では復元できないため強制再同期する)
      void reload(pubkey);
    }
  };

  const handleStartRename = (g: GridRecord): void => {
    setEditingNameId(g.id);
    setEditingNameValue(g.name);
  };

  const handleCommitRename = async (): Promise<void> => {
    if (pubkey === null || editingNameId === null) return;
    const trimmed = editingNameValue.trim().slice(0, GRID_NAME_MAX);
    if (trimmed.length === 0) {
      setEditingNameId(null);
      return;
    }
    const target = grids.find((g) => g.id === editingNameId);
    if (!target || target.name === trimmed) {
      setEditingNameId(null);
      return;
    }
    try {
      const r = await updateGrid(editingNameId, pubkey, { name: trimmed });
      replaceGrid(r.grid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "rename failed");
    } finally {
      setEditingNameId(null);
    }
  };

  const handleCellTap = (x: number, y: number): void => {
    setOpenCell({ x, y });
    // Issue #15: タップで詳細ビューを開く。編集アクションは詳細ビュー内のリンクから委譲する。
    // 鍵が無いと grid 自体取得できないので通常は到達しないが、
    // 何らかのレースで pubkey が消えた場合は CellDetail (履歴 fetch を打つ) ではなく
    // 旧 "menu" モーダル (編集系のみ) にフォールバックさせる。タップが無反応になるのを防ぐ。
    setModal(pubkey ? "detail" : "menu");
  };

  const handleSetContainer = async (containerType: ContainerType): Promise<void> => {
    if (!grid || !openCell || !pubkey) return;
    try {
      // PUT は PATCH セマンティクスになったので、未指定フィールドは API 側が既存値を保持する。
      const updated = await putCell(grid.id, pubkey, openCell.x, openCell.y, { containerType });
      replaceCell(updated);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    }
  };

  const handleSetSoil = async (soilType: SoilType): Promise<void> => {
    if (!grid || !openCell || !pubkey) return;
    try {
      const updated = await putCell(grid.id, pubkey, openCell.x, openCell.y, { soilType });
      replaceCell(updated);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    }
  };

  const handleSetVoid = async (): Promise<void> => {
    if (!grid || !openCell || !pubkey) return;
    try {
      const updated = await putCell(grid.id, pubkey, openCell.x, openCell.y, {
        containerType: "void",
        soilType: null,
      });
      replaceCell(updated);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    }
  };

  const handleClearCell = async (): Promise<void> => {
    if (!grid || !openCell || !pubkey) return;
    try {
      const existing = cellMap.get(`${openCell.x},${openCell.y}`);
      if (existing?.currentPlantingId) {
        await deletePlanting(existing.currentPlantingId, pubkey);
      }
      await deleteCell(grid.id, pubkey, openCell.x, openCell.y);
      await reload(pubkey);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "clear failed");
    }
  };

  // Issue #23: 連作障害警告フロー対応。
  // 1) 初回 POST は `confirmRotation: false` で送る → 警告条件成立なら planted=false で返ってくる。
  // 2) その場合は確認ダイアログ（rotationConfirm）を出し、OK を押されたら confirmRotation: true で再 POST する。
  // 3) 警告条件不成立、または再 POST 成功なら通常通り reload + setModal(null)。
  const runCreatePlanting = async (
    plant: PlantSummary,
    confirmRotation: boolean,
  ): Promise<void> => {
    if (!grid || !openCell || !pubkey) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const result = await createPlanting(grid.id, pubkey, openCell.x, openCell.y, {
        plantId: plant.id,
        seedingDate: today,
        confirmRotation,
      });
      if (!result.planted) {
        // 警告のみ。確認ダイアログへ。
        setRotationConfirm({ plant, warning: result.rotationWarning });
        return;
      }
      setRotationConfirm(null);
      await reload(pubkey);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "plant failed");
    }
  };

  const handlePlantSelected = async (plant: PlantSummary): Promise<void> => {
    await runCreatePlanting(plant, false);
  };

  const handleRotationConfirmOk = async (): Promise<void> => {
    if (!rotationConfirm) return;
    const plant = rotationConfirm.plant;
    setRotationConfirm(null);
    await runCreatePlanting(plant, true);
  };

  const handleRotationConfirmCancel = (): void => {
    // 元の plant モーダル（PlantPicker）へ戻す。フォームを閉じたい場合はもう一度キャンセルできるよう
    // modal は plant のままにする。
    setRotationConfirm(null);
  };

  const replaceCell = (cell: CellRecord): void => {
    setGrids((gs) =>
      gs.map((g) => {
        if (g.id !== cell.gridId) return g;
        const others = g.cells.filter((c) => !(c.x === cell.x && c.y === cell.y));
        return { ...g, cells: [...others, cell] };
      }),
    );
  };

  const handleEnvChange = async (env: GridEnvironment): Promise<void> => {
    if (!grid || !pubkey) return;
    try {
      const r = await updateGrid(grid.id, pubkey, {
        environment: env,
        lighting: env === "indoor" ? grid.lighting : null,
      });
      replaceGrid(r.grid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "update failed");
    }
  };

  const handleLightingChange = async (light: GridLighting | ""): Promise<void> => {
    if (!grid || !pubkey) return;
    try {
      const r = await updateGrid(grid.id, pubkey, { lighting: light === "" ? null : light });
      replaceGrid(r.grid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "update failed");
    }
  };

  const handleResizeRequest = (sizeX: number, sizeY: number): void => {
    if (!grid) return;
    if (sizeX === grid.sizeX && sizeY === grid.sizeY) return;
    setResizeConfirm({ sizeX, sizeY });
  };

  const handleResizeConfirm = async (): Promise<void> => {
    if (!grid || !resizeConfirm || !pubkey) return;
    try {
      const r = await updateGrid(grid.id, pubkey, {
        sizeX: resizeConfirm.sizeX,
        sizeY: resizeConfirm.sizeY,
      });
      replaceGrid(r.grid);
      if (r.cropHistoryResetWarning) {
        setWarning("グリッドサイズを変更しました。過去の連作履歴との対応はリセットされます。");
      }
      setResizeConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "resize failed");
    }
  };

  // ---- render ----------------------------------------------------------

  if (!pubkeyChecked || loading) {
    return (
      <div data-testid="fip-grid-loading" className="text-sm text-neutral-600">
        読み込み中…
      </div>
    );
  }

  if (pubkey === null) {
    return (
      <div data-testid="fip-grid-no-key" className="space-y-3">
        <p className="text-sm text-neutral-700">先にアカウント設定を行ってください。</p>
        <a
          href="/settings"
          className="inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          style={{ minHeight: 44 }}
        >
          アカウント設定へ
        </a>
      </div>
    );
  }

  // グリッド 0 件: 作成 CTA + モーダルだけを出す（タブバーは不要）
  if (grids.length === 0) {
    return (
      <div data-testid="fip-grid-empty" className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="button"
          data-testid="fip-grid-create-open"
          onClick={() => setShowCreate(true)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          style={{ minHeight: 44 }}
        >
          グリッドを作成
        </button>
        {showCreate && (
          <CreateGridModal
            createName={createName}
            setCreateName={setCreateName}
            createEnv={createEnv}
            setCreateEnv={setCreateEnv}
            createLight={createLight}
            setCreateLight={setCreateLight}
            createX={createX}
            setCreateX={setCreateX}
            createY={createY}
            setCreateY={setCreateY}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        )}
      </div>
    );
  }

  // grids が 1 件以上ある通常表示。grid は activeId から導出済み。
  // 念のため null チェック（reload 直後の同期問題で空になるケースを救う）。
  if (!grid) {
    return (
      <div data-testid="fip-grid-view" className="text-sm text-neutral-600">
        グリッドを選択してください。
      </div>
    );
  }

  return (
    <div data-testid="fip-grid-view" className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {warning && (
        <p data-testid="fip-grid-warning" className="text-sm text-amber-700">
          {warning}
        </p>
      )}

      {/* タブバー: 横スクロール対応 + 「+」「・・・」ボタン */}
      <div data-testid="fip-grid-tabs" className="flex items-center gap-2">
        <div className="flex flex-1 gap-1 overflow-x-auto pb-1">
          {grids.map((g) => {
            const isActive = g.id === activeId;
            const isEditing = editingNameId === g.id;
            return (
              <button
                key={g.id}
                ref={(el) => {
                  tabRefs.current[g.id] = el;
                }}
                type="button"
                data-testid={`fip-grid-tab-${g.id}`}
                data-active={isActive ? "1" : undefined}
                onClick={() => {
                  if (isEditing) return;
                  setActiveId(g.id);
                }}
                onDoubleClick={() => handleStartRename(g)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${
                  isActive
                    ? "border-emerald-500 bg-emerald-50 font-semibold text-emerald-700"
                    : "border-neutral-300 bg-white text-neutral-700"
                }`}
                style={{ minHeight: 44 }}
              >
                {isEditing ? (
                  <input
                    type="text"
                    data-testid={`fip-grid-tab-name-input-${g.id}`}
                    // biome-ignore lint/a11y/noAutofocus: 編集モード切替直後の小さな入力で UX 上必要
                    autoFocus
                    value={editingNameValue}
                    onChange={(e) => setEditingNameValue(e.target.value.slice(0, GRID_NAME_MAX))}
                    onBlur={() => void handleCommitRename()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleCommitRename();
                      } else if (e.key === "Escape") {
                        setEditingNameId(null);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    maxLength={GRID_NAME_MAX}
                    className="rounded border border-neutral-300 px-1 py-0.5 text-sm"
                  />
                ) : (
                  <span>
                    {g.name}{" "}
                    <span className="text-xs text-neutral-500">
                      {g.sizeX}×{g.sizeY}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          data-testid="fip-grid-tab-add"
          onClick={() => setShowCreate(true)}
          className="shrink-0 rounded-lg border border-emerald-500 bg-white px-3 py-2 text-sm font-semibold text-emerald-700"
          style={{ minHeight: 44 }}
          aria-label="新規グリッドを追加"
        >
          +
        </button>
        <button
          type="button"
          data-testid="fip-grid-tab-manage"
          onClick={() => setManageMode((v) => !v)}
          className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${
            manageMode
              ? "border-amber-500 bg-amber-50 font-semibold text-amber-700"
              : "border-neutral-300 bg-white text-neutral-700"
          }`}
          style={{ minHeight: 44 }}
          aria-label="並び替え・削除モード"
        >
          ・・・
        </button>
      </div>

      {/* 並び替え・削除モード */}
      {manageMode && (
        <ManagePanel
          grids={grids}
          onMove={handleMove}
          onRequestDelete={(g) => setDeleteConfirm(g)}
          onRename={handleStartRename}
          onClose={() => setManageMode(false)}
        />
      )}

      <header className="space-y-2">
        <h2 className="text-lg font-semibold">{grid.name}</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <label>
            環境:{" "}
            <select
              data-testid="fip-grid-env"
              value={grid.environment}
              onChange={(e) => void handleEnvChange(e.target.value as GridEnvironment)}
              className="rounded border border-neutral-300 px-2 py-1"
            >
              {(Object.keys(ENVIRONMENT_LABELS) as GridEnvironment[]).map((k) => (
                <option key={k} value={k}>
                  {ENVIRONMENT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          {grid.environment === "indoor" && (
            <label>
              照明:{" "}
              <select
                data-testid="fip-grid-lighting"
                value={grid.lighting ?? ""}
                onChange={(e) => void handleLightingChange(e.target.value as GridLighting | "")}
                className="rounded border border-neutral-300 px-2 py-1"
              >
                <option value="">未設定</option>
                {(Object.keys(LIGHTING_LABELS) as GridLighting[]).map((k) => (
                  <option key={k} value={k}>
                    {LIGHTING_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            横:{" "}
            <input
              type="number"
              min={1}
              max={9}
              value={grid.sizeX}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                handleResizeRequest(n, grid.sizeY);
              }}
              className="w-16 rounded border border-neutral-300 px-2 py-1"
              data-testid="fip-grid-size-x"
            />
          </label>
          <label>
            縦:{" "}
            <input
              type="number"
              min={1}
              max={9}
              value={grid.sizeY}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                handleResizeRequest(grid.sizeX, n);
              }}
              className="w-16 rounded border border-neutral-300 px-2 py-1"
              data-testid="fip-grid-size-y"
            />
          </label>
        </div>
      </header>

      {/* Issue #20: グリッド全体にごく薄い bevel + 内側パディング。
       *   セルの斜線テクスチャ等は既存のまま (テスト破壊回避)。 */}
      <div
        data-testid="fip-grid-cells"
        className="grid gap-2 rounded-lg bg-soil-50/60 p-2 shadow-bevel"
        style={{ gridTemplateColumns: `repeat(${grid.sizeX}, minmax(48px, 1fr))` }}
      >
        {Array.from({ length: grid.sizeY }, (_, y) =>
          Array.from({ length: grid.sizeX }, (_, x) => {
            const cell = cellMap.get(`${x},${y}`);
            const isVoid = cell?.containerType === "void";
            const containerNonVoid: Exclude<ContainerType, "void"> | null =
              cell?.containerType && cell.containerType !== "void" ? cell.containerType : null;
            const hasContainer = containerNonVoid !== null;
            const hasPlanting = cell?.currentPlantingId != null;
            // Issue #26: 施肥 / 農薬バッジは記録があれば常に表示し、
            // 経過日数に応じた opacity でフェードさせる（だいぶ前=ほぼ透明グレー）。
            const fertilizedDays = daysAgo(cell?.lastFertilizedAt ?? null);
            const pesticideDays = daysAgo(cell?.lastPesticideAt ?? null);
            const showFertilizeBadge = !isVoid && fertilizedDays !== null;
            const showPesticideBadge = !isVoid && pesticideDays !== null;
            const fertilizeOpacity =
              showFertilizeBadge && fertilizedDays !== null
                ? fadeOpacity(daysSince(cell?.lastFertilizedAt ?? null), "fertilize")
                : 1;
            const pesticideOpacity =
              showPesticideBadge && pesticideDays !== null
                ? fadeOpacity(daysSince(cell?.lastPesticideAt ?? null), "pesticide")
                : 1;
            const ariaLabelParts: string[] = [];
            if (showFertilizeBadge && fertilizedDays !== null)
              ariaLabelParts.push(`最後の施肥: ${ageLabel(fertilizedDays)}`);
            if (showPesticideBadge && pesticideDays !== null)
              ariaLabelParts.push(`最後の農薬: ${ageLabel(pesticideDays)}`);
            const style: React.CSSProperties = isVoid
              ? {
                  backgroundColor: "#e5e7eb",
                  backgroundImage:
                    "repeating-linear-gradient(45deg, transparent 0 6px, rgba(0,0,0,0.08) 6px 12px)",
                }
              : hasContainer
                ? { backgroundColor: "#ecfdf5" }
                : { backgroundColor: "#ffffff" };
            return (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: x,y は固定座標 (size_x×size_y のセル番地) で並び替えは起こらない
                key={`${x},${y}`}
                type="button"
                data-testid={`fip-grid-cell-${x}-${y}`}
                data-void={isVoid ? "1" : undefined}
                data-has-plant={hasPlanting ? "1" : undefined}
                data-fertilize-badge={showFertilizeBadge ? "1" : undefined}
                data-pesticide-badge={showPesticideBadge ? "1" : undefined}
                aria-label={ariaLabelParts.length > 0 ? ariaLabelParts.join(" / ") : undefined}
                onClick={() => handleCellTap(x, y)}
                className="relative aspect-square rounded border border-neutral-300 text-xs flex items-center justify-center hover:border-emerald-500"
                style={{ minHeight: 48, ...style }}
              >
                {isVoid ? (
                  <span className="sr-only">VOID</span>
                ) : hasPlanting ? (
                  <span aria-label="作物中" title="作物中">
                    🌱
                  </span>
                ) : containerNonVoid !== null ? (
                  <span
                    aria-label={CONTAINER_LABELS[containerNonVoid]}
                    title={CONTAINER_LABELS[containerNonVoid]}
                  >
                    {CONTAINER_ICONS[containerNonVoid]}
                  </span>
                ) : (
                  <span className="text-neutral-300 text-[10px]">·</span>
                )}
                {showFertilizeBadge && fertilizedDays !== null && (
                  <span
                    data-testid={`fip-grid-cell-${x}-${y}-fertilize-badge`}
                    data-fade-opacity={fertilizeOpacity.toFixed(2)}
                    className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded-full bg-emerald-600 px-1 text-[8px] font-semibold leading-none text-white"
                    style={{ opacity: fertilizeOpacity }}
                    title={`最後の施肥: ${ageLabel(fertilizedDays)}`}
                  >
                    <span aria-hidden="true">●</span>
                    <span>{fertilizedDays}d</span>
                  </span>
                )}
                {showPesticideBadge && pesticideDays !== null && (
                  <span
                    data-testid={`fip-grid-cell-${x}-${y}-pesticide-badge`}
                    data-fade-opacity={pesticideOpacity.toFixed(2)}
                    className="absolute bottom-0.5 left-0.5 flex items-center gap-0.5 rounded-full bg-red-600 px-1 text-[8px] font-semibold leading-none text-white"
                    style={{ opacity: pesticideOpacity }}
                    title={`最後の農薬: ${ageLabel(pesticideDays)}`}
                  >
                    <span aria-hidden="true">●</span>
                    <span>{pesticideDays}d</span>
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>

      {modal === "detail" && openCell && pubkey && (
        <CellDetail
          pubkey={pubkey}
          grid={grid}
          cell={cellMap.get(`${openCell.x},${openCell.y}`) ?? null}
          cellX={openCell.x}
          cellY={openCell.y}
          onClose={() => {
            setModal(null);
            setOpenCell(null);
          }}
          onChanged={async () => {
            if (pubkey) {
              await reload(pubkey);
            }
          }}
          onEditContainer={() => setModal("container")}
          onEditSoil={() => setModal("soil")}
          onPlant={() => setModal("plant")}
          onSetVoid={handleSetVoid}
          onClear={handleClearCell}
        />
      )}

      {modal !== null && modal !== "detail" && openCell && (
        <CellModal
          openCell={openCell}
          grid={grid}
          modal={modal}
          setModal={setModal}
          onClose={() => {
            setModal(null);
            setOpenCell(null);
          }}
          onSetContainer={handleSetContainer}
          onSetSoil={handleSetSoil}
          onSetVoid={handleSetVoid}
          onClear={handleClearCell}
          onPlantSelected={handlePlantSelected}
        />
      )}

      {resizeConfirm && (
        <div
          data-testid="fip-grid-resize-confirm"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="space-y-4 rounded-lg bg-white p-5 max-w-md">
            <h3 className="text-base font-semibold">サイズ変更の確認</h3>
            <p className="text-sm text-neutral-700">
              グリッドサイズを {resizeConfirm.sizeX}×{resizeConfirm.sizeY} に変更します。
              <br />
              <strong>過去の連作履歴との対応はリセットされます。</strong>
              そのまま進めてよろしいですか？
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="fip-grid-resize-ok"
                onClick={handleResizeConfirm}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                style={{ minHeight: 44 }}
              >
                変更する
              </button>
              <button
                type="button"
                onClick={() => setResizeConfirm(null)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm"
                style={{ minHeight: 44 }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {rotationConfirm && (
        <div
          data-testid="fip-rotation-confirm"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
        >
          <div className="space-y-4 rounded-lg bg-white p-5 max-w-md">
            <h3 className="text-base font-semibold" data-testid="fip-rotation-confirm-title">
              連作障害の警告
            </h3>
            <p className="text-sm text-neutral-700" data-testid="fip-rotation-confirm-message">
              このセルでは {rotationConfirm.warning.yearsElapsed}年前に{" "}
              <strong>{rotationConfirm.warning.family}</strong> の 「
              {rotationConfirm.warning.lastPlantName}」を植えています（最終植え付け:{" "}
              {rotationConfirm.warning.lastPlantedAt}）。
              <br />
              連作障害を避けるため、{rotationConfirm.warning.family} の植え付けは{" "}
              <strong>{rotationConfirm.warning.recommendedWaitYears}年</strong>{" "}
              空けるのが理想です。それでも植えますか？
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="fip-rotation-confirm-ok"
                onClick={() => void handleRotationConfirmOk()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
                style={{ minHeight: 44 }}
              >
                それでも植える
              </button>
              <button
                type="button"
                data-testid="fip-rotation-confirm-cancel"
                onClick={handleRotationConfirmCancel}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm"
                style={{ minHeight: 44 }}
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateGridModal
          createName={createName}
          setCreateName={setCreateName}
          createEnv={createEnv}
          setCreateEnv={setCreateEnv}
          createLight={createLight}
          setCreateLight={setCreateLight}
          createX={createX}
          setCreateX={setCreateX}
          createY={createY}
          setCreateY={setCreateY}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {deleteConfirm && (
        <DeleteGridConfirm
          target={deleteConfirm}
          onConfirm={() => void handleDelete(deleteConfirm)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  );
}

// =============================================================================
// CreateGridModal: 既存の作成フォームをモーダル化
// =============================================================================

interface CreateGridModalProps {
  createName: string;
  setCreateName: (v: string) => void;
  createEnv: GridEnvironment;
  setCreateEnv: (v: GridEnvironment) => void;
  createLight: GridLighting | "";
  setCreateLight: (v: GridLighting | "") => void;
  createX: number;
  setCreateX: (v: number) => void;
  createY: number;
  setCreateY: (v: number) => void;
  onSubmit: () => void | Promise<void>;
  onCancel: () => void;
}

function CreateGridModal(props: CreateGridModalProps): JSX.Element {
  const {
    createName,
    setCreateName,
    createEnv,
    setCreateEnv,
    createLight,
    setCreateLight,
    createX,
    setCreateX,
    createY,
    setCreateY,
    onSubmit,
    onCancel,
  } = props;
  return (
    <div
      data-testid="fip-grid-create-modal"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div
        data-testid="fip-grid-create-form"
        className="w-full max-w-md space-y-3 rounded-lg border border-neutral-300 bg-white p-4"
      >
        <h3 className="text-base font-semibold">新しいグリッドを作成</h3>
        <label className="block text-sm">
          名前
          <input
            type="text"
            data-testid="fip-grid-create-name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value.slice(0, GRID_NAME_MAX))}
            className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2"
            maxLength={GRID_NAME_MAX}
          />
        </label>
        <label className="block text-sm">
          環境
          <select
            value={createEnv}
            onChange={(e) => setCreateEnv(e.target.value as GridEnvironment)}
            className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2"
          >
            {(Object.keys(ENVIRONMENT_LABELS) as GridEnvironment[]).map((k) => (
              <option key={k} value={k}>
                {ENVIRONMENT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {createEnv === "indoor" && (
          <label className="block text-sm">
            照明
            <select
              value={createLight}
              onChange={(e) => setCreateLight(e.target.value as GridLighting | "")}
              className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2"
            >
              <option value="">未設定</option>
              {(Object.keys(LIGHTING_LABELS) as GridLighting[]).map((k) => (
                <option key={k} value={k}>
                  {LIGHTING_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex gap-3">
          <label className="block text-sm">
            横
            <input
              type="number"
              min={1}
              max={9}
              value={createX}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                setCreateX(Math.max(1, Math.min(9, n)));
              }}
              className="mt-1 block w-20 rounded border border-neutral-300 px-2 py-2"
            />
          </label>
          <label className="block text-sm">
            縦
            <input
              type="number"
              min={1}
              max={9}
              value={createY}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                setCreateY(Math.max(1, Math.min(9, n)));
              }}
              className="mt-1 block w-20 rounded border border-neutral-300 px-2 py-2"
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="fip-grid-create-submit"
            onClick={() => void onSubmit()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            style={{ minHeight: 44 }}
          >
            作成
          </button>
          <button
            type="button"
            data-testid="fip-grid-create-cancel"
            onClick={onCancel}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm"
            style={{ minHeight: 44 }}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ManagePanel: 並び替え・削除モード
// =============================================================================

interface ManagePanelProps {
  grids: GridRecord[];
  onMove: (id: string, dir: -1 | 1) => void | Promise<void>;
  onRequestDelete: (g: GridRecord) => void;
  onRename: (g: GridRecord) => void;
  onClose: () => void;
}

function ManagePanel(props: ManagePanelProps): JSX.Element {
  const { grids, onMove, onRequestDelete, onRename, onClose } = props;
  return (
    <div
      data-testid="fip-grid-manage"
      className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-amber-800">並び替え・削除モード</p>
        <button
          type="button"
          data-testid="fip-grid-manage-close"
          onClick={onClose}
          className="rounded border border-neutral-300 bg-white px-3 py-1 text-xs"
          style={{ minHeight: 32 }}
        >
          閉じる
        </button>
      </div>
      <ul className="space-y-1">
        {grids.map((g, i) => (
          <li
            key={g.id}
            data-testid={`fip-grid-manage-row-${g.id}`}
            className="flex items-center gap-1 rounded bg-white px-2 py-1"
          >
            <span className="flex-1 truncate text-sm">
              {g.name}{" "}
              <span className="text-xs text-neutral-500">
                {g.sizeX}×{g.sizeY}
              </span>
            </span>
            <button
              type="button"
              data-testid={`fip-grid-manage-up-${g.id}`}
              disabled={i === 0}
              onClick={() => void onMove(g.id, -1)}
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs disabled:opacity-40"
              style={{ minHeight: 32 }}
              aria-label="上へ"
            >
              ↑
            </button>
            <button
              type="button"
              data-testid={`fip-grid-manage-down-${g.id}`}
              disabled={i === grids.length - 1}
              onClick={() => void onMove(g.id, 1)}
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs disabled:opacity-40"
              style={{ minHeight: 32 }}
              aria-label="下へ"
            >
              ↓
            </button>
            <button
              type="button"
              data-testid={`fip-grid-manage-rename-${g.id}`}
              onClick={() => onRename(g)}
              className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs"
              style={{ minHeight: 32 }}
            >
              名前
            </button>
            <button
              type="button"
              data-testid={`fip-grid-manage-delete-${g.id}`}
              onClick={() => onRequestDelete(g)}
              className="rounded border border-red-300 bg-white px-2 py-1 text-xs text-red-700"
              style={{ minHeight: 32 }}
            >
              削除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// =============================================================================
// DeleteGridConfirm: 削除確認 (cells / plantings 件数を表示)
// =============================================================================

interface DeleteGridConfirmProps {
  target: GridRecord;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteGridConfirm(props: DeleteGridConfirmProps): JSX.Element {
  const { target, onConfirm, onCancel } = props;
  const cellCount = target.cells.length;
  const plantingCount = target.cells.filter((c) => c.currentPlantingId != null).length;
  // 連作履歴の件数はクライアント側に持っていないため、件数表示は cells / plantings のみ。
  // 「履歴も削除されます」という文言で網羅性を担保する。
  return (
    <div
      data-testid="fip-grid-delete-confirm"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-5">
        <h3 className="text-base font-semibold text-red-700">グリッドを削除</h3>
        <p className="text-sm text-neutral-700">
          このグリッド「<strong>{target.name}</strong>」を削除します。
          <br />
          cells {cellCount} 個 / plantings {plantingCount} 個 / 連作履歴も削除されます。
          <br />
          <strong>この操作は取り消せません。</strong>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="fip-grid-delete-ok"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white"
            style={{ minHeight: 44 }}
          >
            削除する
          </button>
          <button
            type="button"
            data-testid="fip-grid-delete-cancel"
            onClick={onCancel}
            className="rounded-lg border border-neutral-300 px-4 py-2 text-sm"
            style={{ minHeight: 44 }}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CellModal: セルタップで開くメニュー＋詳細パネル
// =============================================================================

interface CellModalProps {
  openCell: OpenCell;
  grid: GridRecord;
  modal: Exclude<ModalKind, null | "detail">;
  setModal: (m: ModalKind) => void;
  onClose: () => void;
  onSetContainer: (c: ContainerType) => void | Promise<void>;
  onSetSoil: (s: SoilType) => void | Promise<void>;
  onSetVoid: () => void | Promise<void>;
  onClear: () => void | Promise<void>;
  onPlantSelected: (p: PlantSummary) => void | Promise<void>;
}

function CellModal(props: CellModalProps): JSX.Element {
  const {
    openCell,
    grid,
    modal,
    setModal,
    onClose,
    onSetContainer,
    onSetSoil,
    onSetVoid,
    onClear,
    onPlantSelected,
  } = props;
  return (
    <div
      data-testid="fip-cell-modal"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">
            セル ({openCell.x}, {openCell.y})
          </h3>
          <button type="button" onClick={onClose} className="text-sm text-neutral-500">
            閉じる
          </button>
        </div>

        {modal === "menu" && (
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              data-testid="fip-cell-menu-container"
              onClick={() => setModal("container")}
              className="rounded-lg border border-neutral-300 px-4 py-3 text-left text-sm hover:bg-neutral-50"
              style={{ minHeight: 44 }}
            >
              容器を選ぶ
            </button>
            <button
              type="button"
              data-testid="fip-cell-menu-soil"
              onClick={() => setModal("soil")}
              className="rounded-lg border border-neutral-300 px-4 py-3 text-left text-sm hover:bg-neutral-50"
              style={{ minHeight: 44 }}
            >
              用土を選ぶ
            </button>
            <button
              type="button"
              data-testid="fip-cell-menu-void"
              onClick={() => void onSetVoid()}
              className="rounded-lg border border-neutral-300 px-4 py-3 text-left text-sm hover:bg-neutral-50"
              style={{ minHeight: 44 }}
            >
              VOID にする（畝の外）
            </button>
            <button
              type="button"
              data-testid="fip-cell-menu-plant"
              onClick={() => setModal("plant")}
              className="rounded-lg border border-emerald-400 bg-emerald-50 px-4 py-3 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
              style={{ minHeight: 44 }}
            >
              作物を植える
            </button>
            <button
              type="button"
              data-testid="fip-cell-menu-clear"
              onClick={() => void onClear()}
              className="rounded-lg border border-red-300 px-4 py-3 text-left text-sm text-red-700 hover:bg-red-50"
              style={{ minHeight: 44 }}
            >
              クリア
            </button>
          </div>
        )}

        {modal === "container" && (
          <div data-testid="fip-cell-container-list" className="grid grid-cols-2 gap-2">
            {containerOptionsFor(grid.environment).map((k) => (
              <button
                key={k}
                type="button"
                data-testid={`fip-cell-container-${k}`}
                onClick={() => void onSetContainer(k)}
                className="rounded-lg border border-neutral-300 px-3 py-3 text-sm hover:bg-neutral-50"
                style={{ minHeight: 44 }}
              >
                {CONTAINER_LABELS[k]}
              </button>
            ))}
          </div>
        )}

        {modal === "soil" && (
          <div data-testid="fip-cell-soil-list" className="grid grid-cols-2 gap-2">
            {(Object.keys(SOIL_LABELS) as SoilType[]).map((k) => (
              <button
                key={k}
                type="button"
                data-testid={`fip-cell-soil-${k}`}
                onClick={() => void onSetSoil(k)}
                className="rounded-lg border border-neutral-300 px-3 py-3 text-sm hover:bg-neutral-50"
                style={{ minHeight: 44 }}
              >
                {SOIL_LABELS[k]}
              </button>
            ))}
          </div>
        )}

        {modal === "plant" && <PlantPicker onPick={onPlantSelected} />}
      </div>
    </div>
  );
}

// =============================================================================
// PlantPicker: テキスト入力で作物検索
// =============================================================================

function PlantPicker(props: { onPick: (p: PlantSummary) => void | Promise<void> }): JSX.Element {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlantSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (query: string) => {
    setSearching(true);
    try {
      const plants = await searchPlants(query);
      setResults(plants);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // 初回ロード: q="" で全件（上限 50）
  useEffect(() => {
    void runSearch("");
  }, [runSearch]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void runSearch(q);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [q, runSearch]);

  return (
    <div data-testid="fip-plant-picker" className="space-y-3">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="作物名で検索（例: トマト）"
        data-testid="fip-plant-picker-input"
        className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        style={{ minHeight: 44 }}
      />
      <div className="max-h-64 overflow-y-auto rounded border border-neutral-200">
        {searching && <p className="p-2 text-xs text-neutral-500">検索中…</p>}
        {!searching && results.length === 0 && (
          <p className="p-2 text-xs text-neutral-500">見つかりませんでした</p>
        )}
        <ul className="divide-y divide-neutral-100">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                data-testid={`fip-plant-pick-${p.id}`}
                onClick={() => void props.onPick(p)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
                style={{ minHeight: 44 }}
              >
                <span className="font-medium">{p.name}</span>{" "}
                <span className="text-xs text-neutral-500">({p.family})</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
