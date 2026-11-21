import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import type { DemandHotspot, DemandPoint } from '../types';

interface D3DemandLayerProps {
  hotspots: DemandHotspot[];
  points: DemandPoint[];
  visible: boolean;
  audience: 'partner' | 'passenger';
  interactive?: boolean;
  selectedHotspotId?: string | null;
  onHotspotSelect?: (hotspot: DemandHotspot) => void;
  onHotspotHover?: (hotspot: DemandHotspot | null) => void;
}

interface ProjectedHotspot {
  hotspot: DemandHotspot;
  x: number;
  y: number;
  pxRadius: number;
}

interface ProjectedPoint {
  point: DemandPoint;
  x: number;
  y: number;
  weight: number;
}

export const D3DemandLayer: React.FC<D3DemandLayerProps> = ({
  hotspots,
  points,
  visible,
  audience,
  interactive = true,
  selectedHotspotId = null,
  onHotspotSelect,
  onHotspotHover,
}) => {
  const map = useMap();
  const coreLib = useMapsLibrary('core');

  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  const dataRef = useRef({
    hotspots,
    points,
    visible,
    audience,
    interactive,
    selectedHotspotId,
    onHotspotSelect,
    onHotspotHover,
  });

  dataRef.current = {
    hotspots,
    points,
    visible,
    audience,
    interactive,
    selectedHotspotId,
    onHotspotSelect,
    onHotspotHover,
  };

  useEffect(() => {
    const gMaps = (window as any).google?.maps;
    const OverlayCtor = ((coreLib as any)?.OverlayView || gMaps?.OverlayView) as
      | (typeof google.maps.OverlayView)
      | undefined;
    const LatLngCtor = ((coreLib as any)?.LatLng || gMaps?.LatLng) as
      | (typeof google.maps.LatLng)
      | undefined;

    if (!map || !OverlayCtor || !LatLngCtor) return;
    const SafeOverlay = OverlayCtor;
    const SafeLatLng = LatLngCtor;

    class DemandOverlayView extends SafeOverlay {
      private svgEl: SVGSVGElement | null = null;

      onAdd() {
        const panes = this.getPanes();
        if (!panes) return;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.pointerEvents = 'none';
        svg.style.overflow = 'visible';
        svg.setAttribute('aria-label', 'D3 Booking Demand and Surge Layer');

        const targetPane = panes.overlayMouseTarget || panes.overlayLayer;
        targetPane.appendChild(svg);
        this.svgEl = svg;
      }

      draw() {
        const svgEl = this.svgEl;
        if (!svgEl) return;

        const {
          hotspots: currentHotspots,
          points: currentPoints,
          visible: isVisible,
          audience: currentAudience,
          interactive: isInteractive,
          selectedHotspotId: currentSelectedId,
          onHotspotSelect: handleSelect,
          onHotspotHover: handleHover,
        } = dataRef.current;

        const svg = d3.select(svgEl);
        svg.selectAll('*').remove();

        if (!isVisible || (currentHotspots.length === 0 && currentPoints.length === 0)) {
          svgEl.style.display = 'none';
          return;
        }

        const projection = this.getProjection();
        if (!projection) return;

        const mapBounds = (map as any).getBounds?.();
        const mapDiv = (map as any).getDiv?.() as HTMLElement | undefined;
        const divWidth = mapDiv?.clientWidth || 800;
        const divHeight = mapDiv?.clientHeight || 420;
        const pad = 180;

        let viewLeft = 0;
        let viewTop = 0;
        let svgWidth = divWidth + pad * 2;
        let svgHeight = divHeight + pad * 2;

        const ne = mapBounds?.getNorthEast?.();
        const sw = mapBounds?.getSouthWest?.();
        const pNe = ne ? projection.fromLatLngToDivPixel(ne) : null;
        const pSw = sw ? projection.fromLatLngToDivPixel(sw) : null;

        if (pNe && pSw && pNe.x > pSw.x && pSw.y > pNe.y) {
          viewLeft = Math.floor(pSw.x - pad);
          viewTop = Math.floor(pNe.y - pad);
          svgWidth = Math.min(3600, Math.max(240, Math.ceil(pNe.x - pSw.x + pad * 2)));
          svgHeight = Math.min(3600, Math.max(240, Math.ceil(pSw.y - pNe.y + pad * 2)));
        } else {
          const center = (map as any).getCenter?.();
          const cPx = center ? projection.fromLatLngToDivPixel(center) : null;
          if (!cPx) return;
          viewLeft = Math.floor(cPx.x - divWidth / 2 - pad);
          viewTop = Math.floor(cPx.y - divHeight / 2 - pad);
        }

        svgEl.style.display = 'block';
        svgEl.style.left = `${viewLeft}px`;
        svgEl.style.top = `${viewTop}px`;
        svgEl.style.width = `${svgWidth}px`;
        svgEl.style.height = `${svgHeight}px`;
        svg.attr('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

        // Project hotspots into local SVG pixel space
        const projectedHotspots: ProjectedHotspot[] = [];
        for (const hs of currentHotspots) {
          const centerPx = projection.fromLatLngToDivPixel(new SafeLatLng(hs.lat, hs.lng));
          if (!centerPx) continue;
          const x = centerPx.x - viewLeft;
          const y = centerPx.y - viewTop;
          if (x < -300 || x > svgWidth + 300 || y < -300 || y > svgHeight + 300) continue;

          // Geographic radius in current zoom pixels
          const edgeLat = hs.lat + hs.radiusKm / 111.32;
          const edgePx = projection.fromLatLngToDivPixel(new SafeLatLng(edgeLat, hs.lng));
          const geoPxRadius = edgePx ? Math.abs(centerPx.y - edgePx.y) * 0.42 : 48;
          const pxRadius = Math.max(28, Math.min(220, geoPxRadius));

          projectedHotspots.push({ hotspot: hs, x, y, pxRadius });
        }

        // Project density points
        const projectedPoints: ProjectedPoint[] = [];
        for (const pt of currentPoints) {
          const px = projection.fromLatLngToDivPixel(new SafeLatLng(pt.lat, pt.lng));
          if (!px) continue;
          const x = px.x - viewLeft;
          const y = px.y - viewTop;
          if (x < -120 || x > svgWidth + 120 || y < -120 || y > svgHeight + 120) continue;
          projectedPoints.push({ point: pt, x, y, weight: pt.weight });
        }

        // D3 scales for demand score, color intensity, and hotspot radius
        const surgeColorInterpolator = d3.interpolateRgbBasis([
          '#16A34A',
          '#D4A017',
          '#EA580C',
          '#DC2626',
        ]);
        const demandNormalized = (hs: DemandHotspot) =>
          Math.max(0, Math.min(1, (hs.demandScore - 20) / 75));

        const defs = svg.append('defs');

        // 1. Radial heat gradients per hotspot using D3
        projectedHotspots.forEach(({ hotspot }) => {
          const baseColor = surgeColorInterpolator(demandNormalized(hotspot));
          const grad = defs
            .append('radialGradient')
            .attr('id', `d3-surge-grad-${hotspot.id}`)
            .attr('cx', '50%')
            .attr('cy', '50%')
            .attr('r', '50%');

          grad
            .append('stop')
            .attr('offset', '0%')
            .attr('stop-color', baseColor)
            .attr('stop-opacity', hotspot.demandLevel === 'high' ? 0.34 : 0.24);
          grad
            .append('stop')
            .attr('offset', '58%')
            .attr('stop-color', baseColor)
            .attr('stop-opacity', hotspot.demandLevel === 'high' ? 0.16 : 0.09);
          grad
            .append('stop')
            .attr('offset', '100%')
            .attr('stop-color', baseColor)
            .attr('stop-opacity', 0);
        });

        // Layer 1: Soft radial demand fields
        const haloGroup = svg.append('g').attr('class', 'd3-demand-halos');
        haloGroup
          .selectAll('circle')
          .data(projectedHotspots, (d: any) => d.hotspot.id)
          .join('circle')
          .attr('cx', (d) => d.x)
          .attr('cy', (d) => d.y)
          .attr('r', (d) => d.pxRadius * 1.45)
          .attr('fill', (d) => `url(#d3-surge-grad-${d.hotspot.id})`);

        // Layer 2: True D3 2D Kernel Density Contours (`d3.contourDensity`)
        if (projectedPoints.length >= 2) {
          const avgRadius =
            projectedHotspots.length > 0
              ? d3.mean(projectedHotspots, (d) => d.pxRadius) || 44
              : 44;
          const bandwidth = Math.max(22, Math.min(64, avgRadius * 0.68));

          const densityGenerator = d3
            .contourDensity<ProjectedPoint>()
            .x((d) => d.x)
            .y((d) => d.y)
            .weight((d) => d.weight)
            .size([svgWidth, svgHeight])
            .bandwidth(bandwidth)
            .thresholds(5);

          const contours = densityGenerator(projectedPoints);
          const maxContourVal = d3.max(contours, (c) => c.value) || 0.01;
          const contourColor = d3
            .scaleSequential((t) => d3.interpolateYlOrRd(0.28 + t * 0.66))
            .domain([0, maxContourVal]);

          const contourGroup = svg.append('g').attr('class', 'd3-demand-contours');
          const geoPath = d3.geoPath();

          contourGroup
            .selectAll('path')
            .data(contours)
            .join('path')
            .attr('d', (d) => geoPath(d as any) || '')
            .attr('fill', (d) => contourColor(d.value))
            .attr('fill-opacity', (_d, i) => 0.1 + i * 0.045)
            .attr('stroke', (d) => contourColor(d.value))
            .attr('stroke-opacity', 0.42)
            .attr('stroke-width', 1.1);
        }

        // Layer 3: Live anonymized booking pickup clusters
        const liveBookings = projectedPoints.filter((p) => p.point.isLiveBooking);
        if (liveBookings.length > 0) {
          const rScale = d3.scaleSqrt().domain([0.8, 2.4]).range([3.5, 6]);
          const scatterGroup = svg.append('g').attr('class', 'd3-live-booking-nodes');
          scatterGroup
            .selectAll('circle')
            .data(liveBookings)
            .join('circle')
            .attr('cx', (d) => d.x)
            .attr('cy', (d) => d.y)
            .attr('r', (d) => rScale(d.weight))
            .attr('fill', currentAudience === 'partner' ? '#D4A017' : '#DC2626')
            .attr('fill-opacity', 0.88)
            .attr('stroke', '#FFFFFF')
            .attr('stroke-width', 1.5);
        }

        // Layer 4: Dashed geographic boundary rings & interactive hotspot surge labels
        const ringGroup = svg.append('g').attr('class', 'd3-hotspot-rings');
        ringGroup
          .selectAll('circle')
          .data(projectedHotspots, (d: any) => d.hotspot.id)
          .join('circle')
          .attr('cx', (d) => d.x)
          .attr('cy', (d) => d.y)
          .attr('r', (d) => d.pxRadius)
          .attr('fill', 'none')
          .attr('stroke', (d) => surgeColorInterpolator(demandNormalized(d.hotspot)))
          .attr('stroke-width', (d) => (d.hotspot.id === currentSelectedId ? 2.4 : 1.4))
          .attr('stroke-dasharray', (d) => (d.hotspot.demandLevel === 'high' ? 'none' : '5 4'))
          .attr('stroke-opacity', (d) => (d.hotspot.id === currentSelectedId ? 0.95 : 0.65));

        const nodeScale = d3.scaleSqrt().domain([0, 100]).range([13, 21]);

        const markersGroup = svg.append('g').attr('class', 'd3-hotspot-nodes');
        const nodes = markersGroup
          .selectAll<SVGGElement, ProjectedHotspot>('g.d3-hotspot-node')
          .data(projectedHotspots, (d: any) => d.hotspot.id)
          .join('g')
          .attr('class', 'd3-hotspot-node')
          .attr('transform', (d) => `translate(${d.x}, ${d.y})`)
          .style('pointer-events', isInteractive ? 'auto' : 'none')
          .style('cursor', isInteractive ? 'pointer' : 'default')
          .on('mouseenter', (_ev, d) => {
            if (isInteractive && handleHover) handleHover(d.hotspot);
          })
          .on('mouseleave', () => {
            if (isInteractive && handleHover) handleHover(null);
          })
          .on('click', (ev: MouseEvent, d) => {
            if (!isInteractive) return;
            ev.stopPropagation();
            if (handleSelect) handleSelect(d.hotspot);
          });

        // Core target ring
        nodes
          .append('circle')
          .attr('r', (d) => nodeScale(d.hotspot.demandScore))
          .attr('fill', (d) => surgeColorInterpolator(demandNormalized(d.hotspot)))
          .attr('fill-opacity', 0.22)
          .attr('stroke', '#FFFFFF')
          .attr('stroke-width', 1.8);

        // Compact numeric surge tag (e.g., 1.4x | 3 req)
        nodes.each(function (d) {
          const g = d3.select(this);
          const hs = d.hotspot;
          const isHigh = hs.demandLevel === 'high';
          const isSelected = hs.id === currentSelectedId;
          const labelText =
            currentAudience === 'partner' && hs.openRequests > 0
              ? `${hs.surgeMultiplier.toFixed(1)}x · ${hs.openRequests} req`
              : `${hs.surgeMultiplier.toFixed(1)}x · ${hs.areaName.slice(0, 14)}`;
          const boxWidth = Math.max(66, labelText.length * 6.4 + 14);
          const bgFill = isSelected
            ? '#D4A017'
            : isHigh
            ? '#991B1B'
            : hs.demandLevel === 'medium'
            ? '#0D0D10'
            : '#14532D';
          const txtFill = isSelected ? '#0D0D10' : '#FFFFFF';

          g.append('rect')
            .attr('x', -boxWidth / 2)
            .attr('y', -11)
            .attr('width', boxWidth)
            .attr('height', 22)
            .attr('rx', 6)
            .attr('fill', bgFill)
            .attr('stroke', isSelected ? '#0D0D10' : '#FFFFFF')
            .attr('stroke-width', isSelected ? 1.8 : 1.2);

          g.append('text')
            .attr('x', 0)
            .attr('y', 3.5)
            .attr('text-anchor', 'middle')
            .attr('fill', txtFill)
            .attr('font-size', '10px')
            .attr('font-weight', '700')
            .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace')
            .text(labelText);
        });
      }

      onRemove() {
        if (this.svgEl?.parentNode) {
          this.svgEl.parentNode.removeChild(this.svgEl);
        }
        this.svgEl = null;
      }
    }

    const overlay = new DemandOverlayView();
    overlay.setMap(map);
    overlayRef.current = overlay;

    return () => {
      overlay.setMap(null);
      if (overlayRef.current === overlay) {
        overlayRef.current = null;
      }
    };
  }, [map, coreLib]);

  // Redraw D3 SVG layer whenever demand metrics, visibility, or selection updates
  useEffect(() => {
    overlayRef.current?.draw();
  }, [hotspots, points, visible, audience, interactive, selectedHotspotId]);

  return null;
};
