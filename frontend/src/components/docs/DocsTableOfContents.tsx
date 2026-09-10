"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface HeadingItem {
  id: string;
  text: string;
  level: number;
}

export function DocsTableOfContents() {
  const [headings, setHeadings] = useState<HeadingItem[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    // Scan all h2 and h3 inside article element
    const article = document.querySelector("article");
    if (!article) return;

    const elements = Array.from(article.querySelectorAll("h2, h3"));
    const headingData: HeadingItem[] = elements.map((el, index) => {
      if (!el.id) {
        // Generate an ID if one doesn't exist
        const slug = el.textContent
          ?.toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, "") || `heading-${index}`;
        el.id = slug;
      }
      return {
        id: el.id,
        text: el.textContent || "",
        level: el.tagName === "H2" ? 2 : 3,
      };
    });

    setHeadings(headingData);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-80px 0px -60% 0px" }
    );

    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  if (headings.length === 0) return null;

  return (
    <div className="hidden xl:block">
      <div className="sticky top-28 w-52 text-xs">
        <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-3">
          <span className="h-1.5 w-1.5 bg-ink rounded-full" />
          On this page
        </div>
        <nav className="flex flex-col gap-1.5 border-l border-gray-200 pl-3">
          {headings.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={cn(
                "link-plain transition-colors duration-150 py-0.5 line-clamp-1",
                item.level === 3 && "pl-2.5 text-[11px]",
                activeId === item.id
                  ? "font-medium text-ink -ml-[13px] border-l-2 border-ink pl-3"
                  : "text-gray-500 hover:text-ink"
              )}
            >
              {item.text}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
