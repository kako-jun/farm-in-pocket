// MaterialPicker (Issue: kako-jun/farm-in-pocket#35)
//
// 施肥・農薬の記録フローで使う「資材マスタ」ピッカー。
// - 上部: name/brand での検索 input（300ms デバウンス）。
// - 中央: 検索結果一覧（人気順）。クリックで onPick。
// - 下部: 「該当しない / 新規登録する」ボタン → 登録モーダル。
// - 検索結果ゼロ件でも「新規登録する」を目立たせる。
// - onCancel で閉じる（記録フォーム側で「資材を選ばずに記録」も許す）。
//
// 登録モーダル: name / brand / category / subcategory / description /
//                affiliateLinks[] を入力。
//
// 「使う」ことを決めたら親側で recordMaterialUsage を fire-and-forget で呼ぶ。
// このコンポーネント自身は POST /use を呼ばない（責務分離: seed_products と同じ）。

import type {
  MaterialCategory,
  MaterialRecord,
  PesticideSubcategory,
  SeedProductAffiliateLink,
} from "@farm-in-pocket/shared";
import {
  MATERIAL_CATEGORIES,
  MATERIAL_CATEGORY_LABELS_JA,
  PESTICIDE_SUBCATEGORIES,
  PESTICIDE_SUBCATEGORY_LABELS_JA,
} from "@farm-in-pocket/shared";
import type { JSX } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createMaterial, searchMaterials } from "../lib/grid-api";
import AffiliateLinks from "./AffiliateLinks";
import UsageBadge from "./UsageBadge";

interface MaterialPickerProps {
  pubkey: string;
  /** 検索を絞り込む category（指定すると category 切替 UI は非表示） */
  category?: MaterialCategory;
  /** 資材を選んだ／登録した */
  onPick: (material: MaterialRecord) => void | Promise<void>;
  /** 閉じる（資材を選ばない） */
  onCancel: () => void;
}

type ModeState = "list" | "create";

export default function MaterialPicker(props: MaterialPickerProps): JSX.Element {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MaterialRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState<ModeState>("list");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    async (query: string): Promise<void> => {
      setSearching(true);
      try {
        const materials = await searchMaterials({
          q: query,
          category: props.category,
        });
        setResults(materials);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [props.category],
  );

  // 初回ロード: category で絞り込んだ全件
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
      <MaterialCreateForm
        pubkey={props.pubkey}
        defaultCategory={props.category ?? "fertilizer_solid"}
        lockedCategory={props.category != null}
        initialName={q}
        onCreated={(m) => {
          void props.onPick(m);
        }}
        onCancel={() => setMode("list")}
      />
    );
  }

  return (
    <div data-testid="fip-material-picker" className="space-y-3">
      <p className="text-xs text-neutral-600">
        {props.category
          ? `資材を選択（${MATERIAL_CATEGORY_LABELS_JA[props.category]}）`
          : "資材を選択"}
      </p>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="商品名・ブランド名で検索"
        data-testid="fip-material-picker-input"
        className="block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        style={{ minHeight: 44 }}
      />
      <div
        data-testid="fip-material-picker-results"
        className="max-h-64 overflow-y-auto rounded border border-neutral-200"
      >
        {searching && (
          <p data-testid="fip-material-picker-searching" className="p-2 text-xs text-neutral-500">
            検索中…
          </p>
        )}
        {!searching && results.length === 0 && (
          <p data-testid="fip-material-picker-empty" className="p-2 text-xs text-neutral-500">
            該当する資材が見つかりませんでした
          </p>
        )}
        <ul className="divide-y divide-neutral-100">
          {results.map((m) => (
            <li key={m.id} className="px-3 py-2 hover:bg-emerald-50">
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  data-testid={`fip-material-pick-${m.id}`}
                  onClick={() => void props.onPick(m)}
                  className="flex-1 text-left text-sm"
                  style={{ minHeight: 44 }}
                >
                  <span className="font-medium">{m.name}</span>
                  {m.brand && <span className="ml-1 text-xs text-neutral-500">/ {m.brand}</span>}
                  <span className="ml-2 text-[10px] text-neutral-400">
                    {MATERIAL_CATEGORY_LABELS_JA[m.category]}
                  </span>
                </button>
                <AffiliateLinks links={m.affiliateLinks} align="row" compact />
              </div>
              <div className="mt-1">
                <UsageBadge useCount={m.useCount} userCount={m.userCount} compact />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          data-testid="fip-material-picker-create"
          onClick={() => setMode("create")}
          className="rounded border border-emerald-400 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
          style={{ minHeight: 44 }}
        >
          該当しない / 新規登録する
        </button>
        <button
          type="button"
          data-testid="fip-material-picker-cancel"
          onClick={props.onCancel}
          className="rounded border border-neutral-300 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
          style={{ minHeight: 44 }}
        >
          閉じる（資材を選ばない）
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// MaterialCreateForm: 新規登録フォーム
// =============================================================================

interface MaterialCreateFormProps {
  pubkey: string;
  defaultCategory: MaterialCategory;
  /** true なら category の切替 UI を出さない（呼び出し元で category 固定の用途） */
  lockedCategory: boolean;
  initialName: string;
  onCreated: (material: MaterialRecord) => void;
  onCancel: () => void;
}

function MaterialCreateForm(props: MaterialCreateFormProps): JSX.Element {
  const [name, setName] = useState<string>(props.initialName);
  const [brand, setBrand] = useState<string>("");
  const [category, setCategory] = useState<MaterialCategory>(props.defaultCategory);
  const [subcategory, setSubcategory] = useState<PesticideSubcategory | "">("");
  const [description, setDescription] = useState<string>("");
  const [affiliateUrl, setAffiliateUrl] = useState<string>("");
  const [affiliateShop, setAffiliateShop] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setError("名称を入力してください");
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
    const trimmedDesc = description.trim();
    const subcat: string | null =
      category === "pesticide" && subcategory.length > 0 ? subcategory : null;

    setSaving(true);
    try {
      const result = await createMaterial({
        pubkey: props.pubkey,
        name: trimmedName,
        brand: brand.trim().length > 0 ? brand.trim() : null,
        category,
        subcategory: subcat,
        description: trimmedDesc.length > 0 ? trimmedDesc : null,
        affiliateLinks,
      });
      props.onCreated(result.material);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="fip-material-create-form" className="space-y-3">
      <p className="text-xs text-neutral-600">資材を新規登録</p>

      <label className="block">
        <span className="text-xs text-neutral-600">名称（必須）</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="fip-material-create-name"
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
          data-testid="fip-material-create-brand"
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          style={{ minHeight: 44 }}
        />
      </label>

      {!props.lockedCategory && (
        <fieldset>
          <legend className="text-xs text-neutral-600">カテゴリ</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {MATERIAL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                data-testid={`fip-material-create-category-${cat}`}
                onClick={() => setCategory(cat)}
                className={`rounded border px-2 py-2 text-xs ${
                  category === cat
                    ? "border-emerald-500 bg-emerald-50 font-semibold text-emerald-700"
                    : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                }`}
                style={{ minHeight: 44 }}
              >
                {MATERIAL_CATEGORY_LABELS_JA[cat]}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      {category === "pesticide" && (
        <label className="block">
          <span className="text-xs text-neutral-600">農薬の種別（任意）</span>
          <select
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value as PesticideSubcategory | "")}
            data-testid="fip-material-create-subcategory"
            className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            style={{ minHeight: 44 }}
          >
            <option value="">指定なし</option>
            {PESTICIDE_SUBCATEGORIES.map((s) => (
              <option key={s} value={s}>
                {PESTICIDE_SUBCATEGORY_LABELS_JA[s]}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="text-xs text-neutral-600">説明・メモ（任意）</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          data-testid="fip-material-create-description"
          rows={2}
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-xs text-neutral-600">購入リンク URL（任意）</span>
        <input
          type="url"
          value={affiliateUrl}
          onChange={(e) => setAffiliateUrl(e.target.value)}
          data-testid="fip-material-create-affiliate-url"
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
          data-testid="fip-material-create-affiliate-shop"
          placeholder="例: Amazon"
          className="mt-1 block w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          style={{ minHeight: 44 }}
        />
      </label>

      {error && (
        <p data-testid="fip-material-create-error" className="text-xs text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          data-testid="fip-material-create-submit"
          disabled={saving}
          onClick={() => void handleSubmit()}
          className="flex-1 rounded border border-emerald-500 bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
          style={{ minHeight: 44 }}
        >
          {saving ? "登録中…" : "登録する"}
        </button>
        <button
          type="button"
          data-testid="fip-material-create-cancel"
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
