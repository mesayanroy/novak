import type { ReactNode } from "react";
import { CodeBlock } from "@/components/CodeBlock";
import { cn } from "@/lib/utils";

const methodStyles: Record<string, string> = {
  GET: "border-ink text-ink bg-gray-100",
  POST: "border-ink bg-ink text-paper",
};

export function EndpointSection({
  method,
  path,
  summary,
  permissioned,
  params,
  responseJson,
  curl,
  typescript,
  children,
}: {
  method: "GET" | "POST";
  path: string;
  summary: string;
  permissioned?: string;
  params?: Array<{ name: string; type: string; required?: boolean; description: string }>;
  responseJson: string;
  curl: string;
  typescript: string;
  children?: ReactNode;
}) {
  return (
    <section className="border border-gray-300 bg-paper rounded-sm overflow-hidden shadow-sm">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-300 bg-gray-50/80 p-4">
        <span className={cn("border px-2 py-0.5 font-mono text-xs font-semibold rounded-sm", methodStyles[method])}>
          {method}
        </span>
        <code className="font-mono text-sm font-semibold text-ink">{path}</code>
        {permissioned && (
          <span className="border border-dashed border-gray-400 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-gray-600 rounded-sm">
            {permissioned}
          </span>
        )}
      </div>

      <div className="p-5">
        <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
        {children}

        {params && params.length > 0 && (
          <div className="mt-5 overflow-x-auto border border-gray-200 rounded-sm">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold">
                    Param
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold">
                    Type
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-sans">
                {params.map((p) => (
                  <tr key={p.name} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-ink">
                      {p.name}
                      {p.required && <span className="ml-1 text-ink font-bold">*</span>}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{p.type}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-700">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold">JSON Response Schema</p>
            <CodeBlock code={responseJson} label="200 OK Response" />
          </div>

          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-wide text-gray-500 font-semibold">Invocation Example</p>
            <CodeBlock
              variant="dark"
              tabs={[
                { id: "curl", label: "cURL", code: curl },
                { id: "ts", label: "TypeScript SDK", code: typescript },
              ]}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
