// SeedProductPicker (Issue: kako-jun/farm-in-pocket#34)
//
// 「作物を植える」フローで、plant を選んだ後に「使用した種・苗パック」を
// 任意選択させるためのピッカー。
// - 上部: name/brand での検索 input（300ms デバウンス）。
// - 中央: 検索結果一覧（人気順）。クリックで onPick。
// - 下部: 「該当しない / 新規登録する」ボタン → 登録モーダルへ。
// - 検索結果ゼロ件のときも「新規登録する」ボタンを目立たせる。
// - 「スキップ（種袋なし）」ボタンも提供する。
//
// 登録モーダル: name / brand / type / affiliateLinks[] を入力。
//   - type は seed / seedling / bulb / other のラジオ。
//   - affiliateLinks は URL 1 本だけサポート（shop=共通 ラベル, url=URL）。
//     複数本は将来拡張。
//
// 「使う」ことを決めたら親側で recordSeedProductUsage を fire-and-forget で呼ぶ。
// このコンポーネント自身は POST /use を呼ばない（責務分離）。

import type {
  SeedProductAffiliateLink,
  SeedProductRecord,
  SeedProductType,
} from "@farm-in-pocket/shared";
import { SEED_PRODUCT_TYPES, SEED_PRODUCT_TYPE_LABELS_JA } from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSeedProduct, searchSeedProducts } from "../lib/grid-api";

interface SeedProductPickerProps {
  pubkey: string;
  /** plant 選択直後に呼び出される前提なので plantId は必須（検索の前提絞り込み） */
  plantId: number;
  /** plant 名を表示しておくと UX が良い */
  plantName?: string;
  /** 既定 type（plant の start_methods から推定する場合用、なくても OK） */
  defaultType?: SeedProductType;
  /** 種袋を選んだ／登録した */
  onPick: (product: SeedProductRecord) => void | Promise<void>;
  /** 「種袋なしで進める」を選んだ */
  onSkip?: () => void;
}

type ModeState = "list" | "create";

export default function SeedProductPicker(props: SeedProductPickerProps): JSX.Element {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SeedProductRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<ModeState>("list");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    async (query: string): Promise<void> => {
      setSearching(true);
      try {
        const products = await searchSeedProducts({
          q: query,
          plantId: props.plantId,
        });
        setResults(products);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [props.plantId],
  );

  // 初回ロード: plantId で絞り込んだ全件
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

  if (mode === "create") {
    return (
      <SeedProductCreateForm
        pubkey={props.pubkey}
        plantId={props.plantId}
        plantName={props.plantName}
        defaultType={props.defaultType ?? "seed"}
        initialName={q}
        onCreated={(p) => {
          void props.onPick(p);
        }}
        onCancel={() => setMode("list")}
      />
    );
  }

  return (
    <div data-testid="fip-seed-product-picker" className="space-y-3">
      {props.plantName && (
        <p className="text-xs text-neutral-600">
          <span className="font-medium">{props.plantName}</span> 用の種・苗パック（任意）
        </p>
      )}
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="商品名・ブランド名で検索"
        data-testid="fip-seed-product-picker-input"
        className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        style={{ minHeight: 44 }}
      />
      <div
        data-testid="fip-seed-product-picker-results"
        className="max-h-64 overflow-y-auto rounded border border-neutral-200"
      >
        {searching && (
          <p
            data-testid="fip-seed-product-picker-searching"
            className="p-2 text-xs text-neutral-500"
          >
            検索中…
          </p>
        )}
        {!searching && results.length === 0 && (
          <p data-testid="fip-seed-product-picker-empty" className="p-2 text-xs text-neutral-500">
            該当する種袋・苗が見つかりませんでした
          </p>
        )}
        <ul className="divide-y divide-neutral-100">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                data-testid={`fip-seed-product-pick-${p.id}`}
                onClick={() => void props.onPick(p)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50"
                style={{ minHeight: 44 }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{p.name}</span>
                    {p.brand && <span className="ml-1 text-xs text-neutral-500">/ {p.brand}</span>}
                  </div>
                  <span className="text-[10px] text-neutral-400">
                    {SEED_PRODUCT_TYPE_LABELS_JA[p.type]} · {p.useCount}回
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          data-testid="fip-seed-product-picker-create"
          onClick={() => setMode("create")}
          className="rounded border border-emerald-400 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
          style={{ minHeight: 44 }}
        >
          該当しない / 新規登録する
        </button>
        {props.onSkip && (
          <button
            type="button"
            data-testid="fip-seed-product-picker-skip"
            onClick={() => props.onSkip?.()}
            className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
            style={{ minHeight: 44 }}
          >
            種袋なしで進める
          </button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// SeedProductCreateForm: 新規登録フォーム
// =============================================================================

interface SeedProductCreateFormProps {
  pubkey: string;
  plantId: number;
  plantName?: string;
  defaultType: SeedProductType;
  initialName: string;
  onCreated: (product: SeedProductRecord) => void;
  onCancel: () => void;
}

function SeedProductCreateForm(props: SeedProductCreateFormProps): JSX.Element {
  const [name, setName] = useState<string>(props.initialName);
  const [brand, setBrand] = useState<string>("");
  const [type, setType] = useState<SeedProductType>(props.defaultType);
  const [affiliateUrl, setAffiliateUrl] = useState<string>("");
  const [affiliateShop, setAffiliateShop] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setError("商品名を入力してください");
      return;
    }
    const trimmedUrl = affiliateUrl.trim();
    const trimmedShop = affiliateShop.trim();
    let affiliateLinks: SeedProductAffiliateLink[] | null = null;
    if (trimmedUrl.length > 0) {
      if (!/^https?:\/\//i.test(trimmedUrl)) {
        setError("リンク URL は http(s):// で始まる必要があります");
        return;
      }
      affiliateLinks = [{ shop: trimmedShop.length > 0 ? trimmedShop : "リンク", url: trimmedUrl }];
    }
    setSaving(true);
    try {
      const result = await createSeedProduct({
        pubkey: props.pubkey,
        name: trimmedName,
        brand: brand.trim().length > 0 ? brand.trim() : null,
        plantId: props.plantId,
        type,
        affiliateLinks,
      });
      props.onCreated(result.product);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="fip-seed-product-create-form" className="space-y-3">
      <p className="text-xs text-neutral-600">
        {props.plantName && (
          <>
            <span className="font-medium">{props.plantName}</span> 用 ·{" "}
          </>
        )}
        種・苗パックを新規登録
      </p>

      <label className="block">
        <span className="text-xs text-neutral-600">商品名（必須）</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="fip-seed-product-create-name"
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          style={{ minHeight: 44 }}
        />
      </label>

      <label className="block">
        <span className="text-xs text-neutral-600">ブランド／メーカー（任意）</span>
        <input
          type="text"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          data-testid="fip-seed-product-create-brand"
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          style={{ minHeight: 44 }}
        />
      </label>

      <fieldset>
        <legend className="text-xs text-neutral-600">種類</legend>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {SEED_PRODUCT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              data-testid={`fip-seed-product-create-type-${t}`}
              onClick={() => setType(t)}
              className={`rounded border px-2 py-2 text-xs ${
                type === t
                  ? "border-emerald-500 bg-emerald-50 font-semibold text-emerald-700"
                  : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
              }`}
              style={{ minHeight: 44 }}
            >
              {SEED_PRODUCT_TYPE_LABELS_JA[t]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="text-xs text-neutral-600">購入リンク URL（任意）</span>
        <input
          type="url"
          value={affiliateUrl}
          onChange={(e) => setAffiliateUrl(e.target.value)}
          data-testid="fip-seed-product-create-affiliate-url"
          placeholder="https://..."
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          style={{ minHeight: 44 }}
        />
      </label>

      <label className="block">
        <span className="text-xs text-neutral-600">ショップ名（任意・リンクの表示ラベル）</span>
        <input
          type="text"
          value={affiliateShop}
          onChange={(e) => setAffiliateShop(e.target.value)}
          data-testid="fip-seed-product-create-affiliate-shop"
          placeholder="例: Amazon"
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          style={{ minHeight: 44 }}
        />
      </label>

      {error && (
        <p data-testid="fip-seed-product-create-error" className="text-xs text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="fip-seed-product-create-submit"
          disabled={saving}
          onClick={() => void handleSubmit()}
          className="flex-1 rounded border border-emerald-500 bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
          style={{ minHeight: 44 }}
        >
          {saving ? "登録中…" : "登録する"}
        </button>
        <button
          type="button"
          data-testid="fip-seed-product-create-cancel"
          onClick={props.onCancel}
          className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
          style={{ minHeight: 44 }}
        >
          戻る
        </button>
      </div>
    </div>
  );
}
