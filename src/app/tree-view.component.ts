import { Component, DestroyRef, ElementRef, effect, inject } from '@angular/core';
import * as d3 from 'd3';
import { FamilyStore } from './family-store.service';
import { CARD_H, CARD_W, CardBox, computeLayout } from './tree-layout';
import { displayName, lifeSpan } from './models';

/**
 * D3 hourglass view: ancestors of the focus person above, descendants (with spouses) below.
 * Click a card to edit it, double-click to re-centre the tree on that person.
 */
@Component({
  selector: 'app-tree-view',
  template: `
    <div class="zoom-controls" role="group" aria-label="Zoom">
      <button type="button" (click)="zoomBy(1.25)" aria-label="Zoom in">+</button>
      <button type="button" (click)="zoomBy(0.8)" aria-label="Zoom out">−</button>
      <button type="button" (click)="recenter(true)" aria-label="Fit focus person">⌖</button>
    </div>
  `,
  styles: [`
    :host { display: block; position: relative; width: 100%; height: 100%; overflow: hidden; }
    :host ::ng-deep svg { display: block; width: 100%; height: 100%; touch-action: none; cursor: grab; }
    :host ::ng-deep svg:active { cursor: grabbing; }
    .zoom-controls {
      position: absolute; right: 12px; bottom: 12px; display: flex; flex-direction: column;
      border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--panel);
    }
    .zoom-controls button {
      width: 38px; height: 36px; border: 0; background: transparent; color: var(--ink);
      font: 600 18px/1 var(--font-ui); cursor: pointer;
    }
    .zoom-controls button + button { border-top: 1px solid var(--line); }
    .zoom-controls button:hover { background: var(--hover); }
    .zoom-controls button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  `],
})
export class TreeViewComponent {
  private store = inject(FamilyStore);
  private host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private viewport: d3.Selection<SVGGElement, unknown, null, undefined>;
  private zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private lastFocus = '';
  private focusCenter = { x: 0, y: 0 };

  constructor() {
    this.svg = d3.select(this.host).insert<SVGSVGElement>('svg', ':first-child')
      .attr('role', 'img').attr('aria-label', 'Family tree diagram');
    const defs = this.svg.append('defs');
    defs.append('clipPath').attr('id', 'card-clip')
      .append('rect').attr('width', CARD_W).attr('height', CARD_H).attr('rx', 9);
    this.viewport = this.svg.append('g').attr('class', 'viewport');
    this.viewport.append('g').attr('class', 'links');
    this.viewport.append('g').attr('class', 'cards');
    this.zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 2.5])
      .on('zoom', ev => this.viewport.attr('transform', ev.transform.toString()));
    this.svg.call(this.zoom).on('dblclick.zoom', null);
    this.svg.on('click', (ev: MouseEvent) => { if (ev.target === this.svg.node()) this.store.select(null); });

    const ro = new ResizeObserver(() => { if (!this.lastFocus) return; this.recenter(false); });
    ro.observe(this.host);
    inject(DestroyRef).onDestroy(() => ro.disconnect());

    effect(() => {
      const data = this.store.data();
      const focus = this.store.focusId();
      const layout = computeLayout(data, focus, this.store.ancestorDepth(), this.store.descendantDepth());
      this.render(layout.cards, layout.links, this.store.selectedId(), this.store.you().personId);
      this.focusCenter = layout.focusCenter;
      if (focus !== this.lastFocus) {
        const first = !this.lastFocus;
        this.lastFocus = focus;
        requestAnimationFrame(() => this.recenter(!first));
      }
    });
  }

  zoomBy(k: number) {
    this.svg.transition().duration(250).call(this.zoom.scaleBy, k);
  }

  recenter(animate: boolean) {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    const k = w < 600 ? 0.62 : 0.9;
    const t = d3.zoomIdentity.translate(w / 2 - this.focusCenter.x * k, h * 0.48 - this.focusCenter.y * k).scale(k);
    if (animate) this.svg.transition().duration(550).ease(d3.easeCubicInOut).call(this.zoom.transform, t);
    else this.svg.call(this.zoom.transform, t);
  }

  private render(
    cards: CardBox[], links: { key: string; path: string; kind: string; former?: boolean }[],
    selectedId: string | null, youId: string | null,
  ) {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 0 : 420;

    this.viewport.select<SVGGElement>('g.links')
      .selectAll<SVGPathElement, (typeof links)[number]>('path')
      .data(links, d => d.key)
      .join(
        enter => enter.append('path').attr('opacity', 0).attr('d', d => d.path)
          .call(e => e.transition().duration(dur).attr('opacity', 1)),
        update => update.call(u => u.transition().duration(dur).attr('d', d => d.path).attr('opacity', 1)),
        exit => exit.remove(),
      )
      .attr('class', d => `link ${d.kind}${d.former ? ' former' : ''}`);

    const cardSel = this.viewport.select<SVGGElement>('g.cards')
      .selectAll<SVGGElement, CardBox>('g.card')
      .data(cards, d => d.key)
      .join(
        enter => {
          const g = enter.append('g').attr('class', 'card')
            .attr('transform', d => `translate(${d.x},${d.y})`).attr('opacity', 0)
            .attr('tabindex', 0).attr('role', 'button');
          g.append('rect').attr('class', 'card-bg').attr('width', CARD_W).attr('height', CARD_H).attr('rx', 9);
          g.append('circle').attr('class', 'sex-dot').attr('cx', 18).attr('cy', CARD_H / 2).attr('r', 9);
          g.append('text').attr('class', 'sex-glyph').attr('x', 18).attr('y', CARD_H / 2 + 4).attr('text-anchor', 'middle');
          g.append('text').attr('class', 'name').attr('x', 36).attr('y', 26).attr('clip-path', 'url(#card-clip)');
          g.append('text').attr('class', 'meta').attr('x', 36).attr('y', 44);
          g.append('text').attr('class', 'more').attr('x', CARD_W - 10).attr('y', 18).attr('text-anchor', 'end');
          g.append('text').attr('class', 'you-mark').attr('x', CARD_W - 10).attr('y', CARD_H - 9).attr('text-anchor', 'end');
          g.append('title');
          g.call(e => e.transition().duration(dur).attr('opacity', 1));
          return g;
        },
        update => update.call(u => u.transition().duration(dur)
          .attr('transform', d => `translate(${d.x},${d.y})`).attr('opacity', 1)),
        exit => exit.remove(),
      );

    cardSel
      .attr('class', d => [
        'card', d.role, `sex-${d.person.sex}`,
        d.person.deceased ? 'deceased' : '',
        d.person.id === selectedId ? 'selected' : '',
        d.person.id === youId ? 'you' : '',
      ].join(' '))
      .attr('aria-label', d => `${displayName(d.person)}${d.person.id === youId ? ' (you)' : ''}`
        + `${lifeSpan(d.person) ? ', ' + lifeSpan(d.person) : ''}`)
      .on('click', (ev: MouseEvent, d) => { ev.stopPropagation(); this.store.select(d.person.id); })
      .on('dblclick', (ev: MouseEvent, d) => { ev.stopPropagation(); this.store.setFocus(d.person.id); this.store.select(d.person.id); })
      .on('keydown', (ev: KeyboardEvent, d) => {
        if (ev.key === 'Enter') { ev.preventDefault(); this.store.setFocus(d.person.id); this.store.select(d.person.id); }
        if (ev.key === ' ') { ev.preventDefault(); this.store.select(d.person.id); }
      });

    cardSel.select('text.sex-glyph').text(d => (d.person.sex === 'M' ? '♂' : d.person.sex === 'F' ? '♀' : '?'));
    cardSel.select('text.name').text(d => truncate(displayName(d.person), 19));
    cardSel.select('text.meta').text(d => lifeSpan(d.person) || `@${d.person.id}@`);
    cardSel.select('text.more').text(d => (d.more && d.role !== 'focus' ? '+' : ''));
    cardSel.select('text.you-mark').text(d => (d.person.id === youId ? 'You' : ''));
    cardSel.select('title').text(d =>
      `${displayName(d.person)} (@${d.person.id}@)\nClick to edit · double-click to centre the tree here`);
  }
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
