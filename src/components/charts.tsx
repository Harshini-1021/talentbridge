/**
 * Charts, hand-drawn as SVG in Server Components.
 *
 * No charting library: these render on the server, ship zero client JavaScript,
 * and add nothing to the bundle. At this data size a library would cost 100 kB
 * to draw thirty rectangles.
 *
 * Colours come from the CSS variables in globals.css, so the charts follow the
 * theme rather than hard-coding hex values.
 */

export interface BarDatum {
  label: string;
  value: number;
  /** Optional second series drawn as a lighter segment behind the value. */
  secondary?: number;
  emphasis?: boolean;
}

export function BarChart({
  data,
  max,
  unit = "",
  height = 22,
  secondaryLabel,
}: {
  data: BarDatum[];
  max?: number;
  unit?: string;
  height?: number;
  secondaryLabel?: string;
}) {
  if (data.length === 0) {
    return <p className="text-sm text-muted">No data yet.</p>;
  }

  const ceiling = Math.max(
    max ?? 0,
    ...data.map((datum) => Math.max(datum.value, datum.secondary ?? 0)),
    1,
  );
  const gap = 10;
  const rowHeight = height + gap;
  const chartHeight = data.length * rowHeight;
  const labelWidth = 210;
  const chartWidth = 640;
  const barWidth = chartWidth - labelWidth - 56;

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      className="w-full"
      style={{ maxHeight: chartHeight * 1.3 }}
      role="img"
      aria-label={`Bar chart of ${data.length} values`}
    >
      {data.map((datum, index) => {
        const y = index * rowHeight;
        const width = Math.max((datum.value / ceiling) * barWidth, datum.value > 0 ? 3 : 0);
        const secondaryWidth =
          datum.secondary !== undefined
            ? Math.max((datum.secondary / ceiling) * barWidth, 0)
            : 0;

        return (
          <g key={`${datum.label}-${index}`}>
            <text
              x={0}
              y={y + height * 0.72}
              className="fill-[var(--muted)]"
              style={{ fontSize: 13 }}
            >
              {datum.label.length > 28 ? `${datum.label.slice(0, 27)}…` : datum.label}
            </text>

            <rect
              x={labelWidth}
              y={y}
              width={barWidth}
              height={height}
              rx={5}
              className="fill-[var(--panel-raised)]"
            />

            {secondaryWidth > 0 ? (
              <rect
                x={labelWidth}
                y={y}
                width={secondaryWidth}
                height={height}
                rx={5}
                className="fill-[var(--accent)]"
                opacity={0.25}
              />
            ) : null}

            <rect
              x={labelWidth}
              y={y}
              width={width}
              height={height}
              rx={5}
              className={datum.emphasis ? "fill-[var(--good)]" : "fill-[var(--accent)]"}
            />

            <text
              x={labelWidth + barWidth + 10}
              y={y + height * 0.72}
              className="fill-[var(--text)]"
              style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}
            >
              {Math.round(datum.value * 10) / 10}
              {unit}
            </text>
          </g>
        );
      })}
      {secondaryLabel ? (
        <title>{secondaryLabel}</title>
      ) : null}
    </svg>
  );
}

/** Radial score dial, used for a single fit score. */
export function ScoreRing({
  score,
  size = 116,
  label,
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;
  const colour =
    clamped >= 85 ? "var(--good)" : clamped >= 70 ? "var(--accent)" : clamped >= 50 ? "var(--warn)" : "var(--muted)";

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Fit score ${clamped} out of 100`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--panel-raised)"
        strokeWidth={9}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={colour}
        strokeWidth={9}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="48%"
        textAnchor="middle"
        style={{ fontSize: size * 0.26, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
        className="fill-[var(--text)]"
      >
        {Math.round(clamped)}
      </text>
      <text
        x="50%"
        y="65%"
        textAnchor="middle"
        style={{ fontSize: size * 0.11 }}
        className="fill-[var(--muted)]"
      >
        {label ?? "/ 100"}
      </text>
    </svg>
  );
}

/** Level meter: how much of a required level an employee reaches. */
export function LevelMeter({
  current,
  required,
}: {
  current: number;
  required: number;
}) {
  const cells = [1, 2, 3, 4, 5];
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`Level ${current} of ${required} required`}>
      {cells.map((cell) => {
        const filled = current >= cell - 0.25;
        const needed = required >= cell;
        return (
          <span
            key={cell}
            className={`h-2.5 w-4 rounded-[2px] ${
              filled
                ? "bg-[var(--accent)]"
                : needed
                  ? "bg-[var(--bad)]/35"
                  : "bg-[var(--panel-raised)]"
            }`}
          />
        );
      })}
    </span>
  );
}
