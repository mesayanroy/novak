import type { ReactNode } from "react";
import { CodeBlock } from "@/components/CodeBlock";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const methodStyles: Record<string, string> = {
  GET: "border-ink text-ink",
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
    <section className="border border-gray-300">
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-300 p-4">
        <span className={cn("border px-2 py-0.5 font-mono text-xs font-semibold", methodStyles[method])}>
          {method}
        </span>
        <code className="font-mono text-sm">{path}</code>
        {permissioned && (
          <span className="border border-dashed border-gray-400 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-gray-600">
            {permissioned}
          </span>
        )}
      </div>

      <div className="p-4">
        <p className="text-sm text-gray-700">{summary}</p>
        {children}

        {params && params.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-gray-300">
                <tr>
                  <th className="px-2 py-1.5 text-left font-mono text-xs uppercase tracking-wide text-gray-500">
                    Param
                  </th>
                  <th className="px-2 py-1.5 text-left font-mono text-xs uppercase tracking-wide text-gray-500">
                    Type
                  </th>
                  <th className="px-2 py-1.5 text-left font-mono text-xs uppercase tracking-wide text-gray-500">
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {params.map((p) => (
                  <tr key={p.name} className="border-b border-gray-100 last:border-0">
                    <td className="px-2 py-2 font-mono text-xs">
                      {p.name}
                      {p.required && <span className="ml-1 text-gray-500">*</span>}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-gray-500">{p.type}</td>
                    <td className="px-2 py-2 text-gray-700">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4">
          <p className="mb-2 font-mono text-xs uppercase tracking-wide text-gray-500">Example response</p>
          <CodeBlock code={responseJson} />
        </div>

        <div className="mt-4">
          <Tabs defaultValue="curl">
            <TabsList>
              <TabsTrigger value="curl">curl</TabsTrigger>
              <TabsTrigger value="ts">TypeScript</TabsTrigger>
            </TabsList>
            <TabsContent value="curl">
              <CodeBlock variant="dark" code={curl} />
            </TabsContent>
            <TabsContent value="ts">
              <CodeBlock variant="dark" code={typescript} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </section>
  );
}
