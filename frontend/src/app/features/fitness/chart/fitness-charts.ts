import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, Directive, ElementRef, Input, OnChanges, OnDestroy,
  inject,
} from '@angular/core';
import { formatNumber, parseDay } from '../utils/fitness-utils';

/**
 * Small SVG charts for the fitness page (no chart library).
 * Palette: dark categorical steps validated against the app surface (#1a242d) – fixed order, by entity.
 */
export const SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  points: { date: string; value: number }[];
}

const H = 220;
const PAD = { top: 14, right: 16, bottom: 28, left: 46 };

function niceStep(range: number, ticks = 4): number {
  const raw = range / ticks || 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

function shortDate(value: string): string {
  const d = parseDay(value);
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

/** Charts draw in real pixels (no stretched text): the width follows the container. */
@Directive()
abstract class Sized implements AfterViewInit, OnDestroy {
  W = 640;
  readonly H = H;
  readonly PAD = PAD;
  private readonly host = inject(ElementRef<HTMLElement>);
  protected readonly cdr = inject(ChangeDetectorRef);
  private observer?: ResizeObserver;

  abstract ngOnChanges(): void;

  ngAfterViewInit(): void {
    const measure = () => {
      const width = Math.round(this.host.nativeElement.clientWidth);
      if (width > 0 && width !== this.W) {
        this.W = width;
        this.ngOnChanges();
        this.cdr.markForCheck();
      }
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(measure);
      this.observer.observe(this.host.nativeElement);
    }
  }

  ngOnDestroy(): void { this.observer?.disconnect(); }
}

/** Progress over time: 2px lines, markers, crosshair tooltip, legend for 2+ series, table view. */
@Component({
  selector: 'app-line-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (series.length > 1) {
      <ul class="legend" aria-label="Legende">
        @for (s of series; track s.key) {
          <li><span class="swatch" [style.background]="s.color"></span>{{ s.label }}</li>
        }
      </ul>
    }
    <div class="plot" (mouseleave)="hover = null">
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" [attr.aria-label]="ariaLabel">
        @for (t of yTicks; track t.value) {
          <line class="grid" [attr.x1]="PAD.left" [attr.x2]="W - PAD.right" [attr.y1]="t.y" [attr.y2]="t.y" />
          <text class="tick" [attr.x]="PAD.left - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.label }}</text>
        }
        @for (t of xTicks; track t.date) {
          <text class="tick" [attr.x]="t.x" [attr.y]="H - 8" text-anchor="middle">{{ t.label }}</text>
        }
        @if (hover) {
          <line class="cross" [attr.x1]="hover.x" [attr.x2]="hover.x" [attr.y1]="PAD.top" [attr.y2]="H - PAD.bottom" />
        }
        @for (s of drawn; track s.key) {
          <path [attr.d]="s.path" [attr.stroke]="s.color" class="line" />
          @for (p of s.dots; track p.date) {
            <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="hover?.date === p.date ? 5.5 : 4" [attr.fill]="s.color"
              class="dot" />
          }
        }
        <rect class="hit" [attr.x]="PAD.left" [attr.y]="0" [attr.width]="W - PAD.left - PAD.right" [attr.height]="H"
          (mousemove)="move($event)" (touchstart)="move($event)" />
      </svg>
      @if (hover) {
        <div class="tip" [style.left.%]="(hover.x / W) * 100" [class.flip]="hover.x > W * 0.6">
          <strong>{{ hover.label }}</strong>
          @for (row of hover.rows; track row.label) {
            <span><i [style.background]="row.color"></i>{{ row.label }}: <b>{{ row.value }}</b></span>
          }
        </div>
      }
    </div>
    <details class="table-view">
      <summary>Als Tabelle</summary>
      <table>
        <thead><tr><th>Datum</th>@for (s of series; track s.key) {<th>{{ s.label }}</th>}</tr></thead>
        <tbody>
          @for (d of dates; track d) {
            <tr><td>{{ fmtDate(d) }}</td>@for (s of series; track s.key) {<td>{{ valueAt(s, d) }}</td>}</tr>
          }
        </tbody>
      </table>
    </details>
  `,
  styleUrl: './fitness-charts.css',
})
export class LineChart extends Sized implements OnChanges {
  @Input() series: ChartSeries[] = [];
  @Input() unit = '';
  @Input() ariaLabel = 'Verlauf';

  drawn: { key: string; color: string; path: string; dots: { date: string; x: number; y: number }[] }[] = [];
  yTicks: { value: number; y: number; label: string }[] = [];
  xTicks: { date: string; x: number; label: string }[] = [];
  dates: string[] = [];
  hover: { x: number; date: string; label: string; rows: { label: string; color: string; value: string }[] } | null =
    null;
  private xOf = (_d: string) => 0;

  ngOnChanges(): void {
    this.dates = [...new Set(this.series.flatMap((s) => s.points.map((p) => p.date)))].sort();
    const values = this.series.flatMap((s) => s.points.map((p) => p.value));
    if (!values.length) { this.drawn = []; return; }
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min -= Math.max(1, min * 0.1); max += Math.max(1, max * 0.1); }
    const step = niceStep(max - min);
    const lo = Math.max(0, Math.floor((min - step * 0.25) / step) * step);
    const hi = Math.ceil((max + step * 0.25) / step) * step;
    const yOf = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * (H - PAD.top - PAD.bottom);
    const t0 = parseDay(this.dates[0]).getTime();
    const t1 = parseDay(this.dates[this.dates.length - 1]).getTime();
    const inner = this.W - PAD.left - PAD.right;
    this.xOf = (d: string) => t1 === t0 ? PAD.left + inner / 2 : PAD.left + ((parseDay(d).getTime() - t0) / (t1 - t0)) * inner;
    this.yTicks = [];
    for (let v = lo; v <= hi + step / 2; v += step) this.yTicks.push({ value: v, y: yOf(v), label: formatNumber(v) });
    const every = Math.max(1, Math.ceil(this.dates.length / Math.max(3, Math.floor(this.W / 80))));
    const ticks = this.dates.filter((_, i) => i % every === 0).map((d) => ({ date: d, x: this.xOf(d), label: shortDate(d) }));
    const lastDate = this.dates[this.dates.length - 1];
    if (ticks[ticks.length - 1]?.date !== lastDate) {
      // The newest date always gets a label; a neighbour that would collide makes room.
      if (ticks.length && this.xOf(lastDate) - ticks[ticks.length - 1].x < 48) ticks.pop();
      ticks.push({ date: lastDate, x: this.xOf(lastDate), label: shortDate(lastDate) });
    }
    this.xTicks = ticks;
    this.drawn = this.series.map((s) => {
      const dots = s.points.map((p) => ({ date: p.date, x: this.xOf(p.date), y: yOf(p.value) }));
      return { key: s.key, color: s.color, dots,
        path: dots.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') };
    });
  }

  move(event: MouseEvent | TouchEvent): void {
    const target = event.currentTarget as SVGRectElement;
    const svg = target.ownerSVGElement!;
    const box = svg.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0]?.clientX ?? 0 : event.clientX;
    const x = ((clientX - box.left) / box.width) * this.W;
    let best = this.dates[0];
    for (const d of this.dates) if (Math.abs(this.xOf(d) - x) < Math.abs(this.xOf(best) - x)) best = d;
    const rows = this.series.flatMap((s) => {
      const p = s.points.find((point) => point.date === best);
      return p ? [{ label: s.label, color: s.color, value: `${formatNumber(p.value)} ${this.unit}`.trim() }] : [];
    });
    this.hover = { x: this.xOf(best), date: best, label: this.fmtDate(best), rows };
  }

  fmtDate(value: string): string {
    return parseDay(value).toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'numeric', year: '2-digit' });
  }

  valueAt(s: ChartSeries, date: string): string {
    const p = s.points.find((point) => point.date === date);
    return p ? `${formatNumber(p.value)} ${this.unit}`.trim() : '–';
  }
}

/** One value per week: thin bars with rounded tops, per-bar tooltip, table view. */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="plot" (mouseleave)="hover = null">
      <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" role="img" [attr.aria-label]="ariaLabel">
        @for (t of yTicks; track t.value) {
          <line class="grid" [attr.x1]="PAD.left" [attr.x2]="W - PAD.right" [attr.y1]="t.y" [attr.y2]="t.y" />
          <text class="tick" [attr.x]="PAD.left - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.label }}</text>
        }
        @for (b of drawn; track b.label; let i = $index) {
          <path [attr.d]="b.path" [attr.fill]="color" class="bar" [class.dim]="hover && hover.index !== i" />
          @if (i % labelEvery === 0 || i === drawn.length - 1) {
            <text class="tick" [attr.x]="b.cx" [attr.y]="H - 8" text-anchor="middle">{{ b.label }}</text>
          }
          <rect class="hit" [attr.x]="b.cx - slot / 2" y="0" [attr.width]="slot" [attr.height]="H"
            (mouseenter)="hover = { index: i, x: b.cx }" (touchstart)="hover = { index: i, x: b.cx }" />
        }
        <line class="baseline" [attr.x1]="PAD.left" [attr.x2]="W - PAD.right" [attr.y1]="H - PAD.bottom"
          [attr.y2]="H - PAD.bottom" />
      </svg>
      @if (hover) {
        <div class="tip" [style.left.%]="(hover.x / W) * 100" [class.flip]="hover.x > W * 0.6">
          <strong>Woche ab {{ bars[hover.index].label }}</strong>
          <span><i [style.background]="color"></i><b>{{ fmt(bars[hover.index].value) }} {{ unit }}</b></span>
          @if (bars[hover.index].note) { <span>{{ bars[hover.index].note }}</span> }
        </div>
      }
    </div>
    <details class="table-view">
      <summary>Als Tabelle</summary>
      <table>
        <thead><tr><th>Woche ab</th><th>{{ unit }}</th></tr></thead>
        <tbody>@for (b of bars; track b.label) {<tr><td>{{ b.label }}</td><td>{{ fmt(b.value) }}</td></tr>}</tbody>
      </table>
    </details>
  `,
  styleUrl: './fitness-charts.css',
})
export class BarChart extends Sized implements OnChanges {
  @Input() bars: { label: string; value: number; note?: string }[] = [];
  @Input() unit = '';
  @Input() color = SERIES_COLORS[0];
  @Input() ariaLabel = 'Wochenwerte';

  drawn: { label: string; cx: number; path: string }[] = [];
  yTicks: { value: number; y: number; label: string }[] = [];
  slot = 0;
  labelEvery = 1;
  hover: { index: number; x: number } | null = null;

  ngOnChanges(): void {
    const max = Math.max(0, ...this.bars.map((b) => b.value));
    const step = niceStep(max || 1);
    const hi = Math.max(step, Math.ceil(max / step) * step);
    const base = H - PAD.bottom;
    const yOf = (v: number) => base - (v / hi) * (H - PAD.top - PAD.bottom);
    this.yTicks = [];
    for (let v = 0; v <= hi + step / 2; v += step) this.yTicks.push({ value: v, y: yOf(v), label: formatNumber(v, 0) });
    this.slot = (this.W - PAD.left - PAD.right) / Math.max(1, this.bars.length);
    const width = Math.min(28, this.slot - 4); // 2px surface gap each side at least
    this.labelEvery = Math.max(1, Math.ceil(this.bars.length / Math.max(3, Math.floor(this.W / 70))));
    this.drawn = this.bars.map((b, i) => {
      const cx = PAD.left + this.slot * (i + 0.5);
      const top = yOf(b.value);
      const r = Math.min(4, (base - top) / 2, width / 2);
      const x0 = cx - width / 2;
      const x1 = cx + width / 2;
      const path = b.value <= 0 ? '' :
        `M${x0},${base} L${x0},${top + r} Q${x0},${top} ${x0 + r},${top} L${x1 - r},${top} Q${x1},${top} ${x1},${top + r} L${x1},${base} Z`;
      return { label: b.label, cx, path };
    });
  }

  fmt(value: number): string { return formatNumber(value, 0); }
}
