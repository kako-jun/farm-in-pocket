import type {
  CellRecord,
  ContainerType,
  GridEnvironment,
  GridLighting,
  GridRecord,
  PlantSummary,
  SoilType,
} from "@farm-in-pocket/shared";
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createGrid,
  createPlanting,
  deleteCell,
  deletePlanting,
  listGrids,
  putCell,
  searchPlants,
  updateGrid,
} from "../lib/grid-api";
import { getMyKeyPair } from "../lib/keys";

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

type ModalKind = "menu" | "container" | "soil" | "plant" | null;

interface OpenCell {
  x: number;
  y: number;
}

export default function GridEditor(): JSX.Element {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [pubkeyChecked, setPubkeyChecked] = useState(false);
  const [grid, setGrid] = useState<GridRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // 新規作成フォーム
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("マイ畑");
  const [createEnv, setCreateEnv] = useState<GridEnvironment>("outdoor_sunny");
  const [createLight, setCreateLight] = useState<GridLighting | "">("");
  const [createX, setCreateX] = useState(5);
  const [createY, setCreateY] = useState(5);

  // セルモーダル
  const [openCell, setOpenCell] = useState<OpenCell | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);

  // サイズ変更確認
  const [resizeConfirm, setResizeConfirm] = useState<{ sizeX: number; sizeY: number } | null>(null);

  useEffect(() => {
    const kp = getMyKeyPair();
    setPubkey(kp?.pubkey ?? null);
    setPubkeyChecked(true);
  }, []);

  const reload = useCallback(async (pk: string) => {
    setLoading(true);
    setError(null);
    try {
      const grids = await listGrids(pk);
      setGrid(grids[0] ?? null);
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

  const cellMap = useMemo(() => (grid ? buildCellMap(grid.cells) : new Map()), [grid]);

  // ---- handlers --------------------------------------------------------

  const handleCreate = async (): Promise<void> => {
    if (pubkey === null) return;
    try {
      const g = await createGrid({
        pubkey,
        name: createName.trim() || "マイ畑",
        environment: createEnv,
        lighting: createEnv === "indoor" ? createLight || null : null,
        sizeX: createX,
        sizeY: createY,
      });
      setGrid(g);
      setShowCreate(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "create failed");
    }
  };

  const handleCellTap = (x: number, y: number): void => {
    setOpenCell({ x, y });
    setModal("menu");
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

  const handlePlantSelected = async (plant: PlantSummary): Promise<void> => {
    if (!grid || !openCell || !pubkey) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      await createPlanting(grid.id, pubkey, openCell.x, openCell.y, {
        plantId: plant.id,
        seedingDate: today,
      });
      await reload(pubkey);
      setModal(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "plant failed");
    }
  };

  const replaceCell = (cell: CellRecord): void => {
    setGrid((g) => {
      if (!g) return g;
      const others = g.cells.filter((c) => !(c.x === cell.x && c.y === cell.y));
      return { ...g, cells: [...others, cell] };
    });
  };

  const handleEnvChange = async (env: GridEnvironment): Promise<void> => {
    if (!grid || !pubkey) return;
    try {
      const r = await updateGrid(grid.id, pubkey, {
        environment: env,
        lighting: env === "indoor" ? grid.lighting : null,
      });
      setGrid(r.grid);
    } catch (e) {
      setError(e instanceof Error ? e.message : "update failed");
    }
  };

  const handleLightingChange = async (light: GridLighting | ""): Promise<void> => {
    if (!grid || !pubkey) return;
    try {
      const r = await updateGrid(grid.id, pubkey, { lighting: light === "" ? null : light });
      setGrid(r.grid);
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
      setGrid(r.grid);
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

  if (grid === null) {
    return (
      <div data-testid="fip-grid-empty" className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!showCreate ? (
          <button
            type="button"
            data-testid="fip-grid-create-open"
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            style={{ minHeight: 44 }}
          >
            グリッドを作成
          </button>
        ) : (
          <div
            data-testid="fip-grid-create-form"
            className="space-y-3 rounded-lg border border-neutral-300 bg-white p-4"
          >
            <label className="block text-sm">
              名前
              <input
                type="text"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="mt-1 block w-full rounded border border-neutral-300 px-2 py-2"
                maxLength={100}
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
                    if (!Number.isFinite(n)) return; // NaN なら前回値を維持
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
                onClick={handleCreate}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                style={{ minHeight: 44 }}
              >
                作成
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm"
                style={{ minHeight: 44 }}
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
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

      <div
        data-testid="fip-grid-cells"
        className="grid gap-2"
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
                onClick={() => handleCellTap(x, y)}
                className="aspect-square rounded border border-neutral-300 text-xs flex items-center justify-center hover:border-emerald-500"
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
              </button>
            );
          }),
        )}
      </div>

      {modal !== null && openCell && (
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
    </div>
  );
}

// =============================================================================
// CellModal: セルタップで開くメニュー＋詳細パネル
// =============================================================================

interface CellModalProps {
  openCell: OpenCell;
  grid: GridRecord;
  modal: Exclude<ModalKind, null>;
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
