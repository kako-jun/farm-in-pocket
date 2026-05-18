// Issue: kako-jun/farm-in-pocket#21
// けいふんくん（マスコット）の表情差分 SVG アイコン。
//
// 鶏糞（けいふん）からの命名で、土色（soil 系）の丸い体に小さな新緑の葉
// （チョンマゲ草）が真上に伸びている。Phase 1 はアイコン + 吹き出しの UI 雛形
// なので、全身は描かない（丸顔 + 葉のみ）。
//
// 表情は normal / happy / worried の 3 種類で、目・口・葉の角度で差をつける。
// 絵文字は使わず、純粋な SVG path で構築している。
// viewBox は 256x256、サイズは props で受け取れる（デフォルト 64）。

import type { JSX } from "react";

export interface KeifunFaceProps {
  size?: number;
  /** 追加クラス。aria-hidden 等は呼び出し側で wrap して付ける想定 */
  className?: string;
}

// 共通の丸い土色ボディ。fill は soil-500 のトークンと近い色味を直書き
// （SVG 側で Tailwind トークンを参照しづらいので CSS 変数経由）。
function Body(): JSX.Element {
  return (
    <circle
      cx="128"
      cy="140"
      r="96"
      fill="var(--color-soil-500, #a0834a)"
      stroke="var(--color-soil-700, #6e5320)"
      strokeWidth="3"
    />
  );
}

// チョンマゲ草。葉 1 枚、新緑のグリーン。angle で揺らす（worried で萎れさせる）。
function LeafSprout({ angle = 0 }: { angle?: number }): JSX.Element {
  return (
    <g transform={`translate(128 44) rotate(${angle})`}>
      <path
        d="M0 0 C -10 -20 -4 -40 0 -52 C 4 -40 10 -20 0 0 Z"
        fill="#6fbf73"
        stroke="#3f8a4a"
        strokeWidth="2"
      />
      <path d="M0 -50 L0 -4" stroke="#3f8a4a" strokeWidth="2" />
    </g>
  );
}

export function KeifunFaceNormal({ size = 64, className }: KeifunFaceProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="けいふんくん（普通）"
    >
      <Body />
      <LeafSprout angle={0} />
      {/* 目: 黒いドット */}
      <circle cx="96" cy="130" r="6" fill="#2a1a05" />
      <circle cx="160" cy="130" r="6" fill="#2a1a05" />
      {/* 口: 短い横線 */}
      <path
        d="M112 168 L144 168"
        stroke="#2a1a05"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function KeifunFaceHappy({ size = 64, className }: KeifunFaceProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="けいふんくん（嬉しい）"
    >
      <Body />
      <LeafSprout angle={-12} />
      {/* 目: 半月（^^） */}
      <path
        d="M86 132 Q96 120 106 132"
        stroke="#2a1a05"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M150 132 Q160 120 170 132"
        stroke="#2a1a05"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      {/* 口: 笑顔（open mouth） */}
      <path
        d="M104 162 Q128 188 152 162 Q128 178 104 162 Z"
        fill="#7a3a1a"
        stroke="#2a1a05"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function KeifunFaceWorried({ size = 64, className }: KeifunFaceProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 256 256"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="けいふんくん（心配）"
    >
      <Body />
      <LeafSprout angle={20} />
      {/* 目: ò ó 風 = 眉的な斜め線 + 小さなドット */}
      <path
        d="M86 120 L106 128"
        stroke="#2a1a05"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="98" cy="134" r="5" fill="#2a1a05" />
      <path
        d="M170 120 L150 128"
        stroke="#2a1a05"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="158" cy="134" r="5" fill="#2a1a05" />
      {/* 口: 波線 */}
      <path
        d="M104 172 Q116 164 128 172 T 152 172"
        stroke="#2a1a05"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export type KeifunExpression = "normal" | "happy" | "worried";

export function KeifunFace({
  expression,
  size,
  className,
}: { expression: KeifunExpression } & KeifunFaceProps): JSX.Element {
  if (expression === "happy") return <KeifunFaceHappy size={size} className={className} />;
  if (expression === "worried") return <KeifunFaceWorried size={size} className={className} />;
  return <KeifunFaceNormal size={size} className={className} />;
}
