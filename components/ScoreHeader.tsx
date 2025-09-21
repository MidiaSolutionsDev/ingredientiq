// components/ScoreHeader.tsx
type Props = {
  product: "Champagne" | "IngredientIQ";
  summary: { score: number; avoid: number; caution: number; safe: number; unknown: number };
  dictVersion: string;
};

export default function ScoreHeader({ product, summary, dictVersion }: Props) {
  const label = product === "Champagne" ? "Champagne Score" : "IngredientIQ Score";
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-xl font-semibold">{label}: {summary.score}/100</h2>
      <div className="text-sm text-muted-foreground">Dictionary: {dictVersion}</div>
    </div>
  );
}
