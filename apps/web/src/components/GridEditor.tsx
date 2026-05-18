import type {
  CellRecord,
  ContainerType,
  GridEnvironment,
  GridLighting,
  GridRecord,
  PlantSummary,
  RotationWarning,
  SeedProductRecord,
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
  fetchPlant,
  listGrids,
  putCell,
  recordSeedProductUsage,
  searchPlants,
  updateGrid,
} from "../lib/grid-api";
import { getMyKeyPair } from "../lib/keys";
import { cacheGrids, loadCachedGrids } from "../lib/offline-cache";
import CellDetail from "./CellDetail";
import GridThumbnail from "./GridThumbnail";
import SeedProductPicker from "./SeedProductPicker";

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
//
// retro #64: 旧ローカル `daysAgo` (null 返却) は shared の `daysSince` (Number.POSITIVE_INFINITY 返却)
// に統一する。null 互換 (= バッジを出さない判定) は `Number.isFinite` で揃える。

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
  // Issue #40: アーカイブ済みを一覧に含めるか（既定 false）
  const [showArchived, setShowArchived] = useState(false);

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
  // Issue #34 レビュー MUST-1: 「分かった上で植える」承諾時にも seed_product を保持する必要が
  // あるため、rotationConfirm の rerun でも seedProductId を引き継ぐ。
  const [rotationConfirm, setRotationConfirm] = useState<{
    plant: PlantSummary;
    warning: RotationWarning;
    seedProductId: number | null;
  } | null>(null);

  // Issue #34: plant 選択 → SeedProductPicker（任意）→ createPlanting というフロー。
  // PlantPicker で選んだ plant は一度ここに退避し、SeedProductPicker で onPick / onSkip
  // のいずれかが呼ばれてから createPlanting を打つ。
  // SeedProductPicker が出ている間は modal === "seed-product"。
  const [pendingPlant, setPendingPlant] = useState<PlantSummary | null>(null);

  // タブ DOM 参照: activeId が変わったときに横スクロールで中央寄せ
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Issue #38: `/plants/:id` の「マイ畑に植える」ボタンから ?plantId=... 付きで遷移してきたとき、
  // 「この作物を植える前提でセルを選んでね」という案内バナーを出す（取得は ad-hoc に一度だけ）。
  // 自動でモーダルを開いてしまうとセル未選択時に困るので、ヒント表示に留める。
  const [suggestedPlant, setSuggestedPlant] = useState<PlantSummary | null>(null);

  useEffect(() => {
    const kp = getMyKeyPair();
    setPubkey(kp?.pubkey ?? null);
    setPubkeyChecked(true);
  }, []);

  // ?plantId=... を一度だけ読み取って suggestedPlant に詰める。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const raw = sp.get("plantId");
    if (!raw) return;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) return;
    let cancelled = false;
    fetchPlant(id)
      .then((p) => {
        if (cancelled) return;
        setSuggestedPlant({
          id: p.id,
          name: p.name,
          nameEn: p.nameEn,
          family: p.family,
          category: p.category,
        });
      })
      .catch(() => {
        /* ignore: 失敗してもバナーが出ないだけ */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // アクティブタブが画面外にあれば視野に入れる
  // happy-dom など jsdom 互換で scrollIntoView が未定義のケースに備えてオプショナル呼び出し
  useEffect(() => {
    if (activeId == null) return;
    const el = tabRefs.current[activeId];
    el?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [activeId]);

  const reload = useCallback(async (pk: string, includeArchived: boolean) => {
    setLoading(true);
    setError(null);
    try {
      // Issue #40: summary=true でセル統計を、includeArchived=showArchived でアーカイブ表示制御。
      const list = await listGrids(pk, { includeArchived, summary: true });
      // Issue #42: 取得成功時は最新スナップショットを localStorage にキャッシュしておき、
      //   次回のオフライン起動で fallback できるようにする。
      cacheGrids(pk, list);
      setGrids(list);
      // アクティブグリッド復元: localStorage の ID が現存しなければ
      // 「アクティブ（非アーカイブ）の先頭」にフォールバック。
      const stored =
        typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_GRID_KEY) : null;
      const found = stored != null ? list.find((g) => g.id === stored) : undefined;
      const firstActive = list.find((g) => g.archivedAt == null) ?? list[0] ?? null;
      const next = found ?? firstActive;
      setActiveId(next?.id ?? null);
      hydratedRef.current = true;
    } catch (e) {
      // Issue #42: オフライン or API ダウン時はキャッシュ済みの grids にフォールバックする。
      const cached = loadCachedGrids(pk);
      if (cached !== null) {
        setGrids(cached);
        const stored =
          typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_GRID_KEY) : null;
        const found = stored != null ? cached.find((g) => g.id === stored) : undefined;
        const firstActive = cached.find((g) => g.archivedAt == null) ?? cached[0] ?? null;
        const next = found ?? firstActive;
        setActiveId(next?.id ?? null);
        hydratedRef.current = true;
        // エラー表示は出さず、キャッシュで通常通り表示する（圏外で意識させない）。
      } else {
        setError(e instanceof Error ? e.message : "load failed");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pubkey === null) {
      setLoading(false);
      return;
    }
    void reload(pubkey, showArchived);
  }, [pubkey, reload, showArchived]);

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

  // Issue #40: グリッドのアーカイブ（凍結）/ 解除。
  // 削除と違い cells / plantings / crop_history は壊さない。
  // archive=true で archived_at=now、false で NULL に戻る。
  const handleArchive = async (target: GridRecord, archive: boolean): Promise<void> => {
    if (pubkey === null) return;
    try {
      const r = await updateGrid(target.id, pubkey, { archive });
      // archive=true 時、showArchived=false なら一覧から消えるので
      // reload して取り直す（同時に summary も再計算）。
      // archive=false 時も統一して reload。
      await reload(pubkey, showArchived);
      // archive=true で active を凍結したら、アクティブを別グリッドに移す
      if (archive && activeId === target.id) {
        // reload 後に setGrids が反映されているとは限らないので、
        // r.grid を含めた最新リストから非アーカイブ先頭を探す。
        // 取り出せなければ null（UI が「グリッドを選択してください」になる）。
      }
      // 引数 r は今は使わない（reload で grids 再構築）。reference にだけ残す。
      void r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "archive failed");
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
      void reload(pubkey, showArchived);
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
      await reload(pubkey, showArchived);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "clear failed");
    }
  };

  // Issue #23: 連作障害警告フロー対応。
  // 1) 初回 POST は `confirmRotation: false` で送る → 警告条件成立なら planted=false で返ってくる。
  // 2) その場合は確認ダイアログ（rotationConfirm）を出し、OK を押されたら confirmRotation: true で再 POST する。
  // 3) 警告条件不成立、または再 POST 成功なら通常通り reload + setModal(null)。
  // Issue #34: seedProductId を任意で受け取り、payload に乗せる。承諾済みの場合は
  // 引き続き同じ seedProductId で再 POST するので、引数で引き回す。
  const runCreatePlanting = async (
    plant: PlantSummary,
    confirmRotation: boolean,
    seedProductId: number | null,
  ): Promise<void> => {
    if (!grid || !openCell || !pubkey) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const result = await createPlanting(grid.id, pubkey, openCell.x, openCell.y, {
        plantId: plant.id,
        seedingDate: today,
        confirmRotation,
        ...(seedProductId != null ? { seedProductId } : {}),
      });
      if (!result.planted) {
        // 警告のみ。確認ダイアログへ。seed_product もペアで保持して再 POST 時に乗せる。
        setRotationConfirm({ plant, warning: result.rotationWarning, seedProductId });
        return;
      }
      setRotationConfirm(null);
      setPendingPlant(null);
      // Issue #34: 種・苗が指定されていれば利用カウントを fire-and-forget で加算する。
      // 失敗してもユーザー体験には影響させない（catch だけ握り潰す）。
      if (seedProductId != null) {
        void recordSeedProductUsage(seedProductId, pubkey).catch(() => undefined);
      }
      await reload(pubkey, showArchived);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "plant failed");
    }
  };

  // Issue #34: PlantPicker → SeedProductPicker → createPlanting の中継。
  // PlantPicker で選んだ plant を pendingPlant に積み、SeedProductPicker（seed-product モーダル）
  // に遷移する。鍵が無い等の致命ケースだけ即座に createPlanting にフォールバックする。
  const handlePlantSelected = (plant: PlantSummary): void => {
    if (!pubkey) {
      // pubkey が無いとそもそも createPlanting も SeedProductPicker も成り立たないので、何もしない。
      return;
    }
    setPendingPlant(plant);
    setModal("seed-product");
  };

  // SeedProductPicker で「これを使った」が選ばれた。createPlanting に seedProductId を渡す。
  const handleSeedProductPicked = async (product: SeedProductRecord): Promise<void> => {
    if (!pendingPlant) return;
    await runCreatePlanting(pendingPlant, false, product.id);
  };

  // SeedProductPicker で「種袋なしで進める」が選ばれた。seedProductId を渡さず createPlanting。
  const handleSeedProductSkip = async (): Promise<void> => {
    if (!pendingPlant) return;
    await runCreatePlanting(pendingPlant, false, null);
  };

  const handleRotationConfirmOk = async (): Promise<void> => {
    if (!rotationConfirm) return;
    const { plant, seedProductId } = rotationConfirm;
    setRotationConfirm(null);
    await runCreatePlanting(plant, true, seedProductId);
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

      {/* Issue #38: /plants/:id からの導線。ヒントを出すだけで、セル選択 → 「作物を植える」は通常フロー。 */}
      {suggestedPlant && (
        <div
          data-testid="fip-grid-suggested-plant"
          className="rounded border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900"
        >
          <p>
            <span className="font-semibold">🌱 {suggestedPlant.name}</span>
            <span className="ml-1 text-neutral-600">({suggestedPlant.family})</span>
            を植える準備ができています。空いているセルをタップして「作物を植える」を選んでください。
          </p>
          <button
            type="button"
            data-testid="fip-grid-suggested-plant-dismiss"
            onClick={() => setSuggestedPlant(null)}
            className="mt-1 text-[10px] text-emerald-700 hover:underline"
          >
            閉じる
          </button>
        </div>
      )}

      {/* タブバー: 横スクロール対応 + 「+」「・・・」ボタン */}
      <div data-testid="fip-grid-tabs" className="flex items-center gap-2">
        <div className="flex flex-1 gap-1 overflow-x-auto pb-1">
          {grids.map((g) => {
            const isActive = g.id === activeId;
            const isEditing = editingNameId === g.id;
            const isArchived = g.archivedAt != null;
            return (
              <button
                key={g.id}
                ref={(el) => {
                  tabRefs.current[g.id] = el;
                }}
                type="button"
                data-testid={`fip-grid-tab-${g.id}`}
                data-active={isActive ? "1" : undefined}
                data-archived={isArchived ? "1" : undefined}
                onClick={() => {
                  if (isEditing) return;
                  setActiveId(g.id);
                }}
                onDoubleClick={() => handleStartRename(g)}
                className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${
                  isActive
                    ? isArchived
                      ? "border-neutral-400 bg-neutral-100 font-semibold text-neutral-600"
                      : "border-emerald-500 bg-emerald-50 font-semibold text-emerald-700"
                    : isArchived
                      ? "border-neutral-300 bg-neutral-50 text-neutral-500"
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
                    {isArchived && (
                      <span aria-label="凍結中" title="凍結中" className="mr-1">
                        📦
                      </span>
                    )}
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
          showArchived={showArchived}
          onToggleShowArchived={() => setShowArchived((v) => !v)}
          onMove={handleMove}
          onRequestDelete={(g) => setDeleteConfirm(g)}
          onArchive={(g, archive) => void handleArchive(g, archive)}
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
            // retro #64: shared の daysSince() に統一。POSITIVE_INFINITY は null 互換に倒す。
            const fertilizedRaw = daysSince(cell?.lastFertilizedAt ?? null);
            const pesticideRaw = daysSince(cell?.lastPesticideAt ?? null);
            const fertilizedDays = Number.isFinite(fertilizedRaw) ? fertilizedRaw : null;
            const pesticideDays = Number.isFinite(pesticideRaw) ? pesticideRaw : null;
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
              await reload(pubkey, showArchived);
            }
          }}
          onEditContainer={() => setModal("container")}
          onEditSoil={() => setModal("soil")}
          onPlant={() => setModal("plant")}
          onSetVoid={handleSetVoid}
          onClear={handleClearCell}
        />
      )}

      {modal !== null && modal !== "detail" && modal !== "seed-product" && openCell && (
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

      {/* Issue #34: plant 選択直後の SeedProductPicker。
       *   onCancel（モーダル右上 ✕）は pendingPlant をクリアして閉じるだけ。
       *   実用上「plant 選び直し」が欲しい場合は再度「作物を植える」を踏み直す導線にする。 */}
      {modal === "seed-product" && openCell && pubkey && pendingPlant && (
        <div
          data-testid="fip-seed-product-modal"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
        >
          <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">使った種・苗を選ぶ</h3>
              <button
                type="button"
                data-testid="fip-seed-product-modal-close"
                onClick={() => {
                  setPendingPlant(null);
                  setModal(null);
                  setOpenCell(null);
                }}
                className="text-sm text-neutral-500"
              >
                閉じる
              </button>
            </div>
            <SeedProductPicker
              pubkey={pubkey}
              plantId={pendingPlant.id}
              plantName={pendingPlant.name}
              onPick={handleSeedProductPicked}
              onSkip={handleSeedProductSkip}
            />
          </div>
        </div>
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
  showArchived: boolean;
  onToggleShowArchived: () => void;
  onMove: (id: string, dir: -1 | 1) => void | Promise<void>;
  onRequestDelete: (g: GridRecord) => void;
  onArchive: (g: GridRecord, archive: boolean) => void;
  onRename: (g: GridRecord) => void;
  onClose: () => void;
}

function ManagePanel(props: ManagePanelProps): JSX.Element {
  const {
    grids,
    showArchived,
    onToggleShowArchived,
    onMove,
    onRequestDelete,
    onArchive,
    onRename,
    onClose,
  } = props;
  return (
    <div
      data-testid="fip-grid-manage"
      className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-amber-800">並び替え・凍結・削除モード</p>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="fip-grid-manage-toggle-archived"
            data-on={showArchived ? "1" : undefined}
            onClick={onToggleShowArchived}
            className={`rounded border px-3 py-1 text-xs ${
              showArchived
                ? "border-neutral-500 bg-neutral-200 font-semibold text-neutral-800"
                : "border-neutral-300 bg-white text-neutral-700"
            }`}
            style={{ minHeight: 32 }}
            aria-pressed={showArchived}
          >
            {showArchived ? "📦 凍結中を隠す" : "📦 凍結中を表示"}
          </button>
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
      </div>
      <ul className="space-y-1">
        {grids.map((g, i) => {
          const isArchived = g.archivedAt != null;
          const summary = g.summary;
          // 統計は summary が無いとき（API が古いなど）に cells から最低限導く。
          const cellCount = summary?.cellCount ?? g.cells.length;
          const plantingCount =
            summary?.plantingCount ?? g.cells.filter((c) => c.currentPlantingId != null).length;
          const voidCount =
            summary?.voidCount ?? g.cells.filter((c) => c.containerType === "void").length;
          // 「空き」= grid 全体のセル枠から「使用済み（容器あり or VOID）」を引いた数。
          //   ・容器設定済み = cells に行があり container_type !== null
          //   ・VOID も枠を埋めている扱い
          //   ・cells に行が無い座標は「空き」
          const totalSlots = g.sizeX * g.sizeY;
          // VOID 含めて occupied と数える（VOID = 使用済み）
          const occupied = cellCount;
          const emptyCount = Math.max(0, totalSlots - occupied);
          return (
            <li
              key={g.id}
              data-testid={`fip-grid-manage-row-${g.id}`}
              data-archived={isArchived ? "1" : undefined}
              className={`flex flex-wrap items-center gap-2 rounded px-2 py-2 ${
                isArchived ? "bg-neutral-100 text-neutral-500" : "bg-white"
              }`}
            >
              {/* サムネ */}
              <GridThumbnail grid={g} size="sm" />
              <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                <span className="truncate text-sm">
                  {isArchived && <span className="mr-1">📦</span>}
                  {g.name}{" "}
                  <span className="text-xs text-neutral-500">
                    {g.sizeX}×{g.sizeY}
                  </span>
                </span>
                <span
                  data-testid={`fip-grid-manage-stats-${g.id}`}
                  className="text-[10px] text-neutral-600"
                >
                  {cellCount} セル / {plantingCount} 植え付け中 / {emptyCount} 空き
                  {voidCount > 0 ? ` / ${voidCount} VOID` : ""}
                </span>
              </div>
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
                data-testid={`fip-grid-manage-archive-${g.id}`}
                onClick={() => onArchive(g, !isArchived)}
                className={`rounded border bg-white px-2 py-1 text-xs ${
                  isArchived
                    ? "border-emerald-300 text-emerald-700"
                    : "border-neutral-400 text-neutral-700"
                }`}
                style={{ minHeight: 32 }}
                title={isArchived ? "凍結解除" : "凍結"}
              >
                {isArchived ? "解除" : "凍結"}
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
          );
        })}
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
            <li key={p.id} className="flex items-center justify-between">
              <button
                type="button"
                data-testid={`fip-plant-pick-${p.id}`}
                onClick={() => void props.onPick(p)}
                className="block flex-1 px-3 py-2 text-left text-sm hover:bg-emerald-50"
                style={{ minHeight: 44 }}
              >
                <span className="font-medium">{p.name}</span>{" "}
                <span className="text-xs text-neutral-500">({p.family})</span>
              </button>
              {/* Issue #38: 植物マスターページへ */}
              <a
                href={`/plants/${p.id}`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid={`fip-plant-pick-detail-${p.id}`}
                className="px-2 py-2 text-[10px] text-emerald-700 hover:underline"
              >
                詳細 →
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
