import { Badge } from "./Badge";
import {
  statusMeta,
  gameLabel,
  gameColorVar,
  type StatusDomain,
} from "@/lib/labels";

/**
 * 賽事/報名/付款/報到/對局狀態專用 badge。
 * 文案與色調唯一來源為 lib/labels.ts —— 全站同一 status 值必得同色同字。
 */
export function StatusBadge({
  domain,
  value,
  className,
}: {
  domain: StatusDomain;
  value: string | null | undefined;
  className?: string;
}) {
  const meta = statusMeta(domain, value);
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}

/** 棋種 badge：中性 chip + 棋種色圓點。 */
export function GameBadge({
  gameKey,
  className,
}: {
  gameKey: string | null | undefined;
  className?: string;
}) {
  return (
    <Badge tone="neutral" dotColor={gameColorVar(gameKey)} className={className}>
      {gameLabel(gameKey)}
    </Badge>
  );
}
