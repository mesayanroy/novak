"use client";

/**
 * Magic UI DottedMap (magicui.design/r/dotted-map), adapted for this repo:
 * Tailwind 3, and the projected map is memoized (createMap samples thousands
 * of points, so it must not rerun on every render).
 */
import * as React from "react";
import { createMap } from "svg-dotted-map";
import { cn } from "@/lib/utils";

export interface Marker {
  lat: number;
  lng: number;
  size?: number;
  pulse?: boolean;
}

/** addMarkers returns markers with lat/lng removed; only x, y and other props (e.g. size) remain */
type MapMarker<M extends Marker> = Omit<M, "lat" | "lng"> & { x: number; y: number };

export interface DottedMapProps<M extends Marker = Marker> extends React.SVGProps<SVGSVGElement> {
  width?: number;
  height?: number;
  mapSamples?: number;
  markers?: M[];
  dotColor?: string;
  markerColor?: string;
  dotRadius?: number;
  stagger?: boolean;
  pulse?: boolean;
  renderMarkerOverlay?: (args: { marker: MapMarker<M>; index: number; x: number; y: number; r: number }) => React.ReactNode;
}

export function DottedMap<M extends Marker = Marker>({
  width = 150,
  height = 75,
  mapSamples = 5000,
  markers = [],
  dotColor = "currentColor",
  markerColor = "#7c3aed",
  dotRadius = 0.2,
  stagger = true,
  pulse = false,
  renderMarkerOverlay,
  className,
  style,
  ...svgProps
}: DottedMapProps<M>) {
  const { points, addMarkers } = React.useMemo(() => createMap({ width, height, mapSamples }), [width, height, mapSamples]);
  const processedMarkers = React.useMemo(() => addMarkers(markers), [addMarkers, markers]);

  const { xStep, yToRowIndex } = React.useMemo(() => {
    const sorted = [...points].sort((a, b) => a.y - b.y || a.x - b.x);
    const rowMap = new Map<number, number>();
    let step = 0;
    let prevY = Number.NaN;
    let prevXInRow = Number.NaN;
    for (const p of sorted) {
      if (p.y !== prevY) {
        prevY = p.y;
        prevXInRow = Number.NaN;
        if (!rowMap.has(p.y)) rowMap.set(p.y, rowMap.size);
      }
      if (!Number.isNaN(prevXInRow)) {
        const delta = p.x - prevXInRow;
        if (delta > 0) step = step === 0 ? delta : Math.min(step, delta);
      }
      prevXInRow = p.x;
    }
    return { xStep: step || 1, yToRowIndex: rowMap };
  }, [points]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("text-gray-400", className)} style={{ width: "100%", height: "100%", ...style }} {...svgProps}>
      {points.map((point, index) => {
        const rowIndex = yToRowIndex.get(point.y) ?? 0;
        const offsetX = stagger && rowIndex % 2 === 1 ? xStep / 2 : 0;
        return <circle cx={point.x + offsetX} cy={point.y} r={dotRadius} fill={dotColor} key={`${point.x}-${point.y}-${index}`} />;
      })}

      {processedMarkers.map((marker, index) => {
        const rowIndex = yToRowIndex.get(marker.y) ?? 0;
        const offsetX = stagger && rowIndex % 2 === 1 ? xStep / 2 : 0;
        const x = marker.x + offsetX;
        const y = marker.y;
        const r = marker.size ?? dotRadius;
        const shouldPulse = pulse ? marker.pulse !== false : marker.pulse === true;
        const pulseTo = r * 2.8;
        return (
          <g key={`${marker.x}-${marker.y}-${index}`}>
            <circle cx={x} cy={y} r={r} fill={markerColor} />
            {shouldPulse ? (
              <g pointerEvents="none">
                {[0, 0.7].map((begin) => (
                  <circle key={begin} cx={x} cy={y} r={r} fill="none" stroke={markerColor} strokeWidth={0.3}>
                    <animate attributeName="r" values={`${r};${pulseTo}`} dur="1.4s" begin={`${begin}s`} repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0" dur="1.4s" begin={`${begin}s`} repeatCount="indefinite" />
                  </circle>
                ))}
              </g>
            ) : null}
            {renderMarkerOverlay?.({ marker: { ...(marker as MapMarker<M>), x, y }, index, x, y, r })}
          </g>
        );
      })}
    </svg>
  );
}
