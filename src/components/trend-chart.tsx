"use client";

import { useEffect, useId, useRef, useState } from "react";

export type TrendSeries = {
  name: string;
  /** Cor da linha. O texto nunca usa esta cor. */
  color: string;
  values: (number | null)[];
  /** Oscilação normal de cada ponto (para mais e para menos), na mesma unidade do valor. */
  spreads?: (number | null)[];
};

type Props = {
  title: string;
  /** Uma frase sobre como ler o gráfico. */
  note?: string;
  labels: string[];
  series: TrendSeries[];
  /** Como escrever um valor: "62", "62%", "2,4ª". */
  format: "pontos" | "percentual" | "posicao";
  /** Limites do eixo. Sem valor, de 0 a 100. */
  min?: number;
  max?: number;
  /** Menor é melhor (posição): o eixo é invertido, com 1 no topo. */
  inverted?: boolean;
  /** Rodadas em que a biblioteca de perguntas mudou em relação à anterior. */
  changed?: boolean[];
};

const H = 250;

function text(value: number, format: Props["format"]): string {
  if (format === "percentual") return `${Math.round(value)}%`;
  if (format === "posicao") return `${value.toFixed(1).replace(".", ",")}ª`;
  return String(Math.round(value));
}

/**
 * Gráfico de linha da evolução de um ou mais indicadores entre rodadas.
 * Um só eixo; a faixa clara em volta da linha é a oscilação normal entre
 * repetições. Ao passar o mouse ou focar uma rodada, mostra todos os valores.
 */
export function TrendChart({ title, note, labels, series, format, min = 0, max = 100, inverted, changed }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const id = useId();
  // O desenho usa a largura real do cartão, para o texto não encolher nem esticar.
  const frame = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setW(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Espaço à direita para o rótulo do fim de cada linha.
  const PAD = { top: 16, right: series.length > 1 ? 128 : 56, bottom: 34, left: 44 };
  const count = labels.length;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (count <= 1 ? innerW / 2 : (innerW * index) / (count - 1));
  const y = (value: number) => {
    const ratio = (Math.min(Math.max(value, min), max) - min) / (max - min || 1);
    return PAD.top + innerH * (inverted ? ratio : 1 - ratio);
  };
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((step) => min + (max - min) * step);
  const every = Math.max(1, Math.ceil(count / 8));
  const hasData = series.some((item) => item.values.some((value) => value !== null));

  // Rótulo no fim de cada linha, afastando os que ficariam um em cima do outro.
  const ends = series
    .map((item) => {
      const index = item.values.findLastIndex((value) => value !== null);
      return index === -1 ? null : { item, index, value: item.values[index] as number, y: y(item.values[index] as number) };
    })
    .filter((end): end is NonNullable<typeof end> => end !== null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i += 1) {
    if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
  }

  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <figcaption className="flex flex-col gap-1">
        <span className="text-[15px] font-semibold">{title}</span>
        {note ? <span className="text-[13px] leading-relaxed text-muted">{note}</span> : null}
      </figcaption>

      {series.length > 1 ? (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
          {series.map((item) => (
            <li key={item.name} className="inline-flex items-center gap-2">
              <span aria-hidden="true" className="inline-block h-0.5 w-5 rounded-full" style={{ background: item.color }} />
              {item.name}
            </li>
          ))}
        </ul>
      ) : null}

      {!hasData ? (
        <p className="rounded-[16px] bg-ground px-5 py-4 text-sm text-muted">Sem base nas rodadas completas até agora.</p>
      ) : (
        <div className="relative" ref={frame}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            className="block"
            role="img"
            aria-labelledby={`${id}-title`}
            onPointerLeave={() => setActive(null)}
          >
            <title id={`${id}-title`}>{`${title}. Os valores estão na tabela abaixo do gráfico.`}</title>

            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="#e3e5e8" strokeWidth="1" />
                <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#4c4c4c">
                  {text(tick, format)}
                </text>
              </g>
            ))}

            {labels.map((label, index) =>
              index % every === 0 || index === count - 1 ? (
                <text key={index} x={x(index)} y={H - 10} textAnchor="middle" fontSize="11" fill="#4c4c4c">
                  {label}
                </text>
              ) : null,
            )}

            {(changed ?? []).map((flag, index) =>
              flag ? (
                <g key={index}>
                  <line
                    x1={x(index)}
                    x2={x(index)}
                    y1={PAD.top}
                    y2={H - PAD.bottom}
                    stroke="#4c4c4c"
                    strokeWidth="1"
                    strokeDasharray="3 4"
                  />
                  <text x={x(index) + 4} y={PAD.top + 8} fontSize="10" fill="#4c4c4c">
                    perguntas mudaram
                  </text>
                </g>
              ) : null,
            )}

            {series.map((item) => {
              const points = item.values
                .map((value, index) => (value === null ? null : { index, value, spread: item.spreads?.[index] ?? null }))
                .filter((point): point is NonNullable<typeof point> => point !== null);
              const band = points.filter((point) => point.spread !== null && point.spread > 0);
              return (
                <g key={item.name}>
                  {band.length > 1 ? (
                    <path
                      d={`M ${band.map((point) => `${x(point.index)} ${y(point.value + (point.spread as number))}`).join(" L ")} L ${[...band]
                        .reverse()
                        .map((point) => `${x(point.index)} ${y(point.value - (point.spread as number))}`)
                        .join(" L ")} Z`}
                      fill={item.color}
                      opacity="0.14"
                    />
                  ) : null}
                  {band.length === 1 ? (
                    <line
                      x1={x(band[0].index)}
                      x2={x(band[0].index)}
                      y1={y(band[0].value + (band[0].spread as number))}
                      y2={y(band[0].value - (band[0].spread as number))}
                      stroke={item.color}
                      strokeWidth="6"
                      strokeLinecap="round"
                      opacity="0.2"
                    />
                  ) : null}
                  {points.length > 1 ? (
                    <path
                      d={`M ${points.map((point) => `${x(point.index)} ${y(point.value)}`).join(" L ")}`}
                      fill="none"
                      stroke={item.color}
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ) : null}
                  {points.map((point) => (
                    <circle
                      key={point.index}
                      cx={x(point.index)}
                      cy={y(point.value)}
                      r={active === point.index ? 6 : 4}
                      fill={item.color}
                      stroke="#ffffff"
                      strokeWidth="2"
                    />
                  ))}
                </g>
              );
            })}

            {ends.map((end) => (
              <text key={end.item.name} x={x(end.index) + 10} y={end.y + 4} fontSize="12" fontWeight="600" fill="#000000">
                {text(end.value, format)}
                {series.length > 1 ? (
                  <tspan fontWeight="400" fill="#4c4c4c">
                    {` ${end.item.name.split(" ").pop()}`}
                  </tspan>
                ) : null}
              </text>
            ))}

            {active !== null ? (
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={H - PAD.bottom} stroke="#000000" strokeWidth="1" />
            ) : null}

            {labels.map((label, index) => {
              const width = count <= 1 ? innerW : innerW / (count - 1);
              return (
                <rect
                  key={index}
                  x={x(index) - width / 2}
                  y={PAD.top}
                  width={width}
                  height={innerH}
                  fill="transparent"
                  tabIndex={0}
                  role="button"
                  aria-label={`Rodada de ${label}: ${series
                    .map((item) => `${item.name} ${item.values[index] === null ? "sem base" : text(item.values[index] as number, format)}`)
                    .join(", ")}`}
                  onPointerMove={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  style={{ outline: "none" }}
                />
              );
            })}
          </svg>

          {active !== null ? (
            <div
              className="pointer-events-none absolute top-2 z-10 flex min-w-[170px] flex-col gap-1 rounded-[14px] bg-ink px-4 py-3 text-[13px] text-paper shadow-lg"
              style={
                x(active) > W / 2
                  ? { right: `${100 - (x(active) / W) * 100 + 2}%` }
                  : { left: `${(x(active) / W) * 100 + 2}%` }
              }
            >
              <span className="text-xs text-[#cfd1d3]">
                Rodada de {labels[active]}
                {changed?.[active] ? " · perguntas mudaram" : ""}
              </span>
              {series.map((item) => {
                const value = item.values[active];
                const spread = item.spreads?.[active] ?? null;
                return (
                  <span key={item.name} className="flex items-center gap-2">
                    <span aria-hidden="true" className="inline-block h-0.5 w-4 rounded-full" style={{ background: item.color }} />
                    <span className="font-semibold">{value === null ? "sem base" : text(value, format)}</span>
                    <span className="text-[#cfd1d3]">
                      {item.name}
                      {value !== null && spread ? ` (oscila ± ${text(spread, format).replace("ª", "")})` : ""}
                    </span>
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      )}

      {hasData ? (
        <details className="text-[13px]">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold underline">Ver os valores em tabela</summary>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[420px] border-collapse">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th scope="col" className="py-2 pr-3 font-semibold">Rodada</th>
                  {series.map((item) => (
                    <th key={item.name} scope="col" className="px-3 py-2 font-semibold">{item.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {labels.map((label, index) => (
                  <tr key={index} className="border-t border-[#e3e5e8]">
                    <th scope="row" className="py-2 pr-3 text-left font-medium">
                      {label}
                      {changed?.[index] ? " (perguntas mudaram)" : ""}
                    </th>
                    {series.map((item) => {
                      const value = item.values[index];
                      const spread = item.spreads?.[index] ?? null;
                      return (
                        <td key={item.name} className="px-3 py-2">
                          {value === null ? "sem base" : text(value, format)}
                          {value !== null && spread ? ` (± ${text(spread, format).replace("ª", "")})` : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </figure>
  );
}
