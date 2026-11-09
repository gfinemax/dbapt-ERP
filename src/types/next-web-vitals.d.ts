declare module "next/dist/compiled/web-vitals" {
  type Metric = {
    id: string;
    name: string;
    navigationType?: string;
    rating?: "good" | "needs-improvement" | "poor";
    value: number;
  };
  type Reporter = (metric: Metric) => void;
  export const onCLS: (reporter: Reporter) => void;
  export const onFCP: (reporter: Reporter) => void;
  export const onINP: (reporter: Reporter) => void;
  export const onLCP: (reporter: Reporter) => void;
  export const onTTFB: (reporter: Reporter) => void;
}
