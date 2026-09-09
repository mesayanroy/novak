import { EventStatus } from "@novak/sdk";
import { EventStatusPill, CompositeStatusPill, OperatorBadge } from "@/components/StatusPill";
import { shortHex } from "@/lib/utils";

export interface CompositionNode {
  id: string;
  title: string;
  kind: "primitive" | "composite";
  op?: string;
  windowSeconds?: number;
  eventStatus?: EventStatus;
  compositeStatus?: "Unresolved" | "True" | "False" | "Voided";
  children?: CompositionNode[];
}

/** Recursive renderer over a composite's operator + children — leaf nodes
 *  are primitive events, each with its own status pill. */
export function CompositionTree({ node, depth = 0 }: { node: CompositionNode; depth?: number }) {
  return (
    <div className={depth > 0 ? "ml-6 border-l border-gray-300 pl-5" : ""}>
      <div className="flex flex-wrap items-center gap-2 py-2">
        {node.kind === "composite" ? (
          <>
            {node.op && <OperatorBadge op={node.op} />}
            {node.windowSeconds && (
              <span className="font-mono text-xs text-gray-500">{node.windowSeconds / 3600}h window</span>
            )}
            {node.compositeStatus && <CompositeStatusPill status={node.compositeStatus} />}
          </>
        ) : (
          node.eventStatus !== undefined && <EventStatusPill status={node.eventStatus} />
        )}
        <span className="text-sm">{node.title}</span>
        <span className="font-mono text-xs text-gray-400">{shortHex(node.id)}</span>
      </div>
      {node.children?.map((child) => (
        <CompositionTree key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
