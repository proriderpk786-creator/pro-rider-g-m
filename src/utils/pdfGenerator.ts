import { jsPDF } from 'jspdf';
import type { Booking, WalletTransaction } from '../types';

export function formatPkr(val: number): string {
  return `Rs. ${Math.round(Number(val || 0)).toLocaleString('en-PK')}`;
}

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const ARABIC_SCRIPT_GLOBAL_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/g;

/**
 * Normalizes strings for jsPDF's built-in Helvetica (WinAnsi) font so bilingual labels
 * such as "Economy · اکانومی" or "پک اپ" never produce mojibake glyphs (e.g. "ûýpāþî").
 */
export function toPdfSafeText(raw: unknown, fallback = 'N/A'): string {
  if (raw === null || raw === undefined) return fallback;
  let str = String(raw)
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[\u2022\u00B7]/g, '|')
    .replace(/\u2192/g, '->')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  if (!str) return fallback;

  // If mixed bilingual separated by "|" or "/", keep clean Latin segments
  if (ARABIC_SCRIPT_RE.test(str)) {
    const segments = str
      .split(/\s*(?:\||\/)\s*/)
      .map((seg) => seg.trim())
      .filter((seg) => seg.length > 0 && !ARABIC_SCRIPT_RE.test(seg));

    if (segments.length > 0) {
      str = segments.join(' | ');
    } else {
      // Strip Arabic/Urdu runs if any Latin tokens exist inside the string
      str = str
        .replace(ARABIC_SCRIPT_GLOBAL_RE, ' ')
        .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
        .replace(/\s*\(\s*\)\s*/g, ' ')
        .replace(/^[-|,\s]+|[-|,\s]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  } else {
    str = str
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return str || fallback;
}

/**
 * When a user-supplied field (such as a hand-typed Urdu pickup address) contains ONLY Arabic/Urdu
 * characters with zero Latin letters, render that line crisp via an offscreen canvas bitmap.
 */
function renderUrduCanvasLine(
  text: string,
  maxWidthPt: number,
  fontSizePt = 10
): { dataUrl: string; widthPt: number; heightPt: number } | null {
  if (typeof document === 'undefined') return null;
  try {
    const scale = 3;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const pxFont = Math.round(fontSizePt * 1.35);
    const maxPxWidth = Math.max(120, Math.round(maxWidthPt * 1.35));
    ctx.font = `600 ${pxFont}px "Noto Nastaliq Urdu", "Plus Jakarta Sans", sans-serif`;

    const measured = Math.min(maxPxWidth, Math.ceil(ctx.measureText(text).width) + 12);
    const heightPx = Math.round(pxFont * 2.1);

    canvas.width = measured * scale;
    canvas.height = heightPx * scale;
    ctx.scale(scale, scale);

    ctx.fillStyle = '#0D0D10';
    ctx.font = `600 ${pxFont}px "Noto Nastaliq Urdu", "Plus Jakarta Sans", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillText(text, measured - 4, heightPx / 2, measured - 8);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      widthPt: measured / 1.35,
      heightPt: heightPx / 1.35,
    };
  } catch {
    return null;
  }
}

export interface InvoiceFinancialBreakdown {
  baseFarePkr: number;
  distanceChargePkr: number;
  waitingChargePkr: number;
  extraStopsChargePkr: number;
  totalBillPkr: number;
  amountPaidPkr: number;
  remainingPkr: number;
  commissionPct: number;
  commissionPkr: number;
  driverPayoutPkr: number;
  isPackageOrCustom: boolean;
}

export function getInvoiceFinancialBreakdown(booking: Booking): InvoiceFinancialBreakdown {
  const totalBillPkr = Math.max(0, Math.round(Number(booking.total_bill_pkr || 0)));
  const amountPaidPkr = Math.max(0, Math.round(Number(booking.amount_paid_pkr || 0)));
  const remainingPkr = Math.max(0, totalBillPkr - amountPaidPkr);

  const rawBase = Math.max(0, Math.round(Number(booking.base_fare_pkr || 0)));
  const rawWait = Math.max(0, Math.round(Number(booking.waiting_charge_pkr || 0)));
  const rawStops = Math.max(0, Math.round(Number(booking.extra_stops_charge_pkr || 0)));

  const computedDistance =
    booking.rate_per_km_pkr && booking.distance_km
      ? Math.max(0, Math.round(Number(booking.distance_km) * Number(booking.rate_per_km_pkr)))
      : 0;

  // Ensure line items reconcile cleanly with totalBillPkr
  const extraSum = rawBase + rawWait + rawStops;
  const remainderAfterExtras = Math.max(0, totalBillPkr - extraSum);
  const isPackageOrCustom = booking.booking_mode === 'schedule' || computedDistance === 0 || Math.abs(computedDistance - remainderAfterExtras) > 15;
  const distanceChargePkr = isPackageOrCustom ? remainderAfterExtras : computedDistance;

  const commissionPct = Number(booking.commission_pct ?? 15);
  const commissionPkr = Math.max(0, Math.round(Number(booking.commission_pkr || 0)));
  const driverPayoutPkr = Math.max(
    0,
    Math.round(Number(booking.driver_payout_pkr ?? Math.max(0, totalBillPkr - commissionPkr)))
  );

  return {
    baseFarePkr: rawBase,
    distanceChargePkr,
    waitingChargePkr: rawWait,
    extraStopsChargePkr: rawStops,
    totalBillPkr,
    amountPaidPkr,
    remainingPkr,
    commissionPct,
    commissionPkr,
    driverPayoutPkr,
    isPackageOrCustom,
  };
}

function drawSafeValueOrUrduBitmap(
  doc: jsPDF,
  rawVal: unknown,
  fallback: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize = 9.5
): number {
  const safe = toPdfSafeText(rawVal, '');
  if (safe) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(fontSize);
    doc.setTextColor(13, 13, 16);
    const wrapped = doc.splitTextToSize(safe, maxWidth);
    doc.text(wrapped, x, y);
    return wrapped.length;
  }

  const rawStr = String(rawVal || '').trim();
  if (rawStr && ARABIC_SCRIPT_RE.test(rawStr)) {
    const bmp = renderUrduCanvasLine(rawStr, maxWidth, fontSize);
    if (bmp) {
      doc.addImage(bmp.dataUrl, 'PNG', x, y - bmp.heightPt * 0.68, bmp.widthPt, bmp.heightPt);
      return 1;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(13, 13, 16);
  doc.text(fallback, x, y);
  return 1;
}

export function buildBookingInvoicePdf(
  booking: Booking,
  options: { viewerRole: 'passenger' | 'partner' | 'admin'; passengerName?: string }
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 38;
  const contentWidth = pageWidth - margin * 2;
  let y = 0;

  // ── 1. Executive Obsidian Header Banner + Gold Accent Rule ──
  doc.setFillColor(13, 13, 16);
  doc.rect(0, 0, pageWidth, 102, 'F');
  doc.setFillColor(212, 160, 23);
  doc.rect(0, 102, pageWidth, 4, 'F');

  // Brand Emblem Ring
  doc.setDrawColor(212, 160, 23);
  doc.setLineWidth(2.2);
  doc.circle(margin + 21, 51, 19, 'S');
  doc.setTextColor(244, 196, 48);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('PR', margin + 21, 56, { align: 'center' });

  // Title & Tagline
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('PRO RIDER AI', margin + 52, 44);

  doc.setTextColor(244, 196, 48);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('OFFICIAL DIGITAL INVOICE  |  TRAVEL WITH TRUST', margin + 52, 60);

  doc.setTextColor(185, 185, 198);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Helpline: 03125007782  |  ProRider.pk786@gmail.com', margin + 52, 76);

  // Invoice Meta Top Right
  const issuedDate = (booking.created_at || new Date().toISOString()).slice(0, 10);
  doc.setTextColor(244, 196, 48);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(`INVOICE # ${toPdfSafeText(booking.invoice_number, booking.id)}`, pageWidth - margin, 40, { align: 'right' });

  doc.setTextColor(245, 245, 250);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Booking ID: ${toPdfSafeText(booking.id)}`, pageWidth - margin, 56, { align: 'right' });
  doc.text(`Issued Date: ${issuedDate}`, pageWidth - margin, 71, { align: 'right' });

  const tripStatusText = toPdfSafeText(booking.status, 'PENDING').replaceAll('_', ' ').toUpperCase();
  doc.setTextColor(200, 205, 215);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text(`TRIP STATUS: ${tripStatusText}`, pageWidth - margin, 86, { align: 'right' });

  y = 124;

  // ── 2. Structured Parties & Vehicle Information Card ──
  const cardHeight = 104;
  doc.setFillColor(248, 248, 250);
  doc.roundedRect(margin, y, contentWidth, cardHeight, 6, 6, 'F');
  doc.setDrawColor(224, 224, 232);
  doc.setLineWidth(0.9);
  doc.roundedRect(margin, y, contentWidth, cardHeight, 6, 6, 'S');

  // Center vertical hairline divider
  const midX = margin + contentWidth / 2;
  doc.setDrawColor(228, 228, 235);
  doc.line(midX, y + 12, midX, y + cardHeight - 12);

  const col1X = margin + 16;
  const col2X = midX + 16;
  const colMaxW = contentWidth / 2 - 30;

  // Left Column Header
  doc.setTextColor(143, 100, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PASSENGER & SERVICE DETAILS', col1X, y + 20);

  // Stacked label/value pairs (Col 1)
  const pNameRaw = options.passengerName || booking.passenger_name || 'Verified Passenger';
  doc.setTextColor(110, 110, 122);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('PASSENGER', col1X, y + 36);
  drawSafeValueOrUrduBitmap(doc, pNameRaw, 'Verified Passenger', col1X, y + 48, colMaxW, 9.5);

  const serviceLabel = `${toPdfSafeText(booking.service_type, 'RIDE').replaceAll('_', ' ').toUpperCase()} (${
    booking.booking_mode === 'go_now' ? 'INSTANT' : 'MONTHLY PACKAGE'
  })`;
  doc.setTextColor(110, 110, 122);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('SERVICE & SEATS', col1X, y + 66);
  doc.setTextColor(13, 13, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`${serviceLabel}  |  ${booking.seats_requested || 1} Seat(s)`, col1X, y + 79, { maxWidth: colMaxW });

  // Right Column Header
  doc.setTextColor(143, 100, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PRO PARTNER & VEHICLE', col2X, y + 20);

  doc.setTextColor(110, 110, 122);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('PRO PARTNER', col2X, y + 36);
  drawSafeValueOrUrduBitmap(
    doc,
    booking.partner_name || 'Pending Assignment',
    'Pending Assignment',
    col2X,
    y + 48,
    colMaxW,
    9.5
  );

  const cleanCategory = toPdfSafeText(booking.vehicle_category_name || booking.vehicle_category_id, 'Standard');
  const cleanVehicleName = toPdfSafeText(booking.partner_vehicle_name, '');
  const cleanPlate = toPdfSafeText(booking.partner_vehicle_number, '');
  const vehicleCombined = [
    cleanCategory,
    cleanVehicleName ? cleanVehicleName : null,
    cleanPlate ? `[${cleanPlate}]` : null,
  ]
    .filter(Boolean)
    .join('  |  ');

  doc.setTextColor(110, 110, 122);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('FLEET CATEGORY & VEHICLE', col2X, y + 66);
  doc.setTextColor(13, 13, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(vehicleCombined || cleanCategory, col2X, y + 79, { maxWidth: colMaxW });

  y += cardHeight + 20;

  // ── 3. Bordered Route & Schedule Ledger Table ──
  doc.setFillColor(13, 13, 16);
  doc.roundedRect(margin, y, contentWidth, 24, 4, 4, 'F');
  doc.setTextColor(244, 196, 48);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ROUTE & SCHEDULE DETAILS', margin + 12, y + 15.5);

  const osmUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${booking.pickup_lat},${booking.pickup_lng};${booking.dropoff_lat},${booking.dropoff_lng}`;
  doc.setTextColor(147, 197, 253);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.textWithLink('View Route on OpenStreetMap ->', pageWidth - margin - 12, y + 15.5, {
    align: 'right',
    url: osmUrl,
  });

  y += 26;

  const routeRows: Array<{ label: string; rawValue: unknown; fallback: string }> = [
    { label: 'Pickup Location', rawValue: booking.pickup_address, fallback: 'Pickup Location' },
    { label: 'Drop-off Destination', rawValue: booking.dropoff_address, fallback: 'Drop-off Destination' },
    {
      label: 'Scheduled Pickup',
      rawValue: `${booking.pickup_date} at ${booking.pickup_time}`,
      fallback: `${booking.pickup_date}`,
    },
    {
      label: 'Expected Drop-off',
      rawValue: `${booking.expected_dropoff_date || booking.pickup_date} ${booking.expected_dropoff_time || ''}`.trim(),
      fallback: 'Scheduled',
    },
    {
      label: 'Actual Completion',
      rawValue: booking.actual_dropoff_time || 'Pending / Not Recorded',
      fallback: 'Pending / Not Recorded',
    },
    {
      label: 'Distance & Duration',
      rawValue: `${booking.distance_km} km  (${booking.duration_min} minutes est.)`,
      fallback: `${booking.distance_km} km`,
    },
  ];

  const labelColWidth = 148;
  const valColWidth = contentWidth - labelColWidth - 22;

  routeRows.forEach((row, idx) => {
    const safeVal = toPdfSafeText(row.rawValue, '');
    const wrappedLines = safeVal ? doc.splitTextToSize(safeVal, valColWidth) : [''];
    const rowHeight = Math.max(22, wrappedLines.length * 13 + 9);

    if (idx % 2 === 0) {
      doc.setFillColor(255, 255, 255);
    } else {
      doc.setFillColor(248, 248, 250);
    }
    doc.rect(margin, y, contentWidth, rowHeight, 'F');
    doc.setDrawColor(228, 228, 235);
    doc.setLineWidth(0.7);
    doc.rect(margin, y, contentWidth, rowHeight, 'S');
    doc.line(margin + labelColWidth, y, margin + labelColWidth, y + rowHeight);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(92, 92, 104);
    doc.text(row.label.toUpperCase(), margin + 10, y + 14.5);

    if (safeVal) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(13, 13, 16);
      doc.text(wrappedLines, margin + labelColWidth + 10, y + 14.5);
    } else {
      drawSafeValueOrUrduBitmap(
        doc,
        row.rawValue,
        row.fallback,
        margin + labelColWidth + 10,
        y + 14.5,
        valColWidth,
        9
      );
    }

    y += rowHeight;
  });

  y += 18;

  // ── 4. Itemized Financial Ledger Table ──
  const fin = getInvoiceFinancialBreakdown(booking);

  doc.setFillColor(244, 196, 48);
  doc.roundedRect(margin, y, contentWidth, 23, 4, 4, 'F');
  doc.setTextColor(13, 13, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('FINANCIAL SUMMARY & FARE ITEMIZATION', margin + 12, y + 15);
  doc.text('AMOUNT (PKR)', pageWidth - margin - 12, y + 15, { align: 'right' });

  y += 25;

  const ledgerRows: Array<{ label: string; amount: string; bold?: boolean; muted?: boolean }> = [];
  if (fin.baseFarePkr > 0) {
    ledgerRows.push({ label: 'Base Booking Tariff', amount: formatPkr(fin.baseFarePkr) });
  }
  ledgerRows.push({
    label: fin.isPackageOrCustom
      ? `Agreed Ride / Package Fare (${booking.distance_km} km)`
      : `Road Distance Fare (${booking.distance_km} km @ Rs. ${booking.rate_per_km_pkr}/km)`,
    amount: formatPkr(fin.distanceChargePkr),
  });
  if (fin.waitingChargePkr > 0) {
    ledgerRows.push({
      label: `Waiting Charges (${booking.waiting_minutes || 0} mins)`,
      amount: formatPkr(fin.waitingChargePkr),
    });
  }
  if (fin.extraStopsChargePkr > 0) {
    ledgerRows.push({
      label: `Extra Stops (${booking.extra_stops_count || 0})`,
      amount: formatPkr(fin.extraStopsChargePkr),
    });
  }
  ledgerRows.push({ label: 'Total Invoice Bill', amount: formatPkr(fin.totalBillPkr), bold: true });
  ledgerRows.push({ label: 'Confirmed Amount Paid', amount: formatPkr(fin.amountPaidPkr), bold: true });

  if (options.viewerRole !== 'passenger' && fin.commissionPkr > 0) {
    ledgerRows.push({
      label: `Platform Commission (${fin.commissionPct}%)`,
      amount: formatPkr(fin.commissionPkr),
      muted: true,
    });
    ledgerRows.push({
      label: 'Net Pro Partner Payout',
      amount: formatPkr(fin.driverPayoutPkr),
      bold: true,
    });
  }

  ledgerRows.forEach((item, idx) => {
    const rowH = item.bold ? 23 : 20;
    doc.setFillColor(item.bold ? 248 : idx % 2 === 0 ? 255 : 252, item.bold ? 248 : idx % 2 === 0 ? 255 : 252, item.bold ? 250 : idx % 2 === 0 ? 255 : 253);
    doc.rect(margin, y, contentWidth, rowH, 'F');
    doc.setDrawColor(228, 228, 235);
    doc.setLineWidth(0.7);
    doc.rect(margin, y, contentWidth, rowH, 'S');

    doc.setFont('helvetica', item.bold ? 'bold' : 'normal');
    doc.setFontSize(item.bold ? 9.5 : 9);
    doc.setTextColor(item.muted ? 110 : 13, item.muted ? 110 : 13, item.muted ? 120 : 16);
    doc.text(item.label, margin + 12, y + (item.bold ? 15 : 13.5));
    doc.text(item.amount, pageWidth - margin - 12, y + (item.bold ? 15 : 13.5), { align: 'right' });
    y += rowH;
  });

  y += 10;

  // ── 5. Executive Obsidian Settlement Bar (Generous Margins — No Border Clipping) ──
  const summaryH = 56;
  doc.setFillColor(13, 13, 16);
  doc.roundedRect(margin, y, contentWidth, summaryH, 6, 6, 'F');
  doc.setDrawColor(212, 160, 23);
  doc.setLineWidth(1.2);
  doc.roundedRect(margin, y, contentWidth, summaryH, 6, 6, 'S');

  doc.setTextColor(212, 160, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('REMAINING BALANCE DUE', margin + 16, y + 20);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(formatPkr(fin.remainingPkr), margin + 16, y + 40);

  // Payment Status Pill (Vertically Centered on Right)
  const paymentStatusClean = toPdfSafeText(booking.payment_status, 'UNPAID').toUpperCase();
  const isPaid = paymentStatusClean === 'PAID';
  const pillW = 138;
  const pillH = 26;
  const pillX = pageWidth - margin - pillW - 14;
  const pillY = y + (summaryH - pillH) / 2;

  if (isPaid) {
    doc.setFillColor(16, 185, 129);
    doc.roundedRect(pillX, pillY, pillW, pillH, 5, 5, 'F');
    doc.setTextColor(255, 255, 255);
  } else {
    doc.setFillColor(244, 196, 48);
    doc.roundedRect(pillX, pillY, pillW, pillH, 5, 5, 'F');
    doc.setTextColor(13, 13, 16);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`STATUS: ${paymentStatusClean}`, pillX + pillW / 2, pillY + 16.5, { align: 'center' });

  y += summaryH + 18;

  // ── 6. Confirmed Payment Transactions Table ──
  const confirmedTxs = (booking.transactions || []).filter((tx) => tx.status === 'confirmed');
  if (confirmedTxs.length > 0 && y < pageHeight - 105) {
    doc.setTextColor(13, 13, 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('CONFIRMED PAYMENT TRANSACTIONS', margin, y);
    y += 8;

    // Header Row
    doc.setFillColor(244, 244, 248);
    doc.rect(margin, y, contentWidth, 20, 'F');
    doc.setDrawColor(220, 220, 228);
    doc.rect(margin, y, contentWidth, 20, 'S');
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 92);
    doc.text('TX REFERENCE', margin + 10, y + 13);
    doc.text('CHANNEL', margin + 150, y + 13);
    doc.text('DATE', margin + 250, y + 13);
    doc.text('STATUS', margin + 365, y + 13);
    doc.text('AMOUNT', pageWidth - margin - 10, y + 13, { align: 'right' });
    y += 20;

    doc.setFont('helvetica', 'normal');
    for (const tx of confirmedTxs.slice(0, 5)) {
      if (y > pageHeight - 62) break;
      doc.setFillColor(255, 255, 255);
      doc.rect(margin, y, contentWidth, 19, 'F');
      doc.setDrawColor(228, 228, 235);
      doc.rect(margin, y, contentWidth, 19, 'S');
      doc.setTextColor(13, 13, 16);
      doc.setFont('helvetica', 'bold');
      doc.text(toPdfSafeText(tx.tx_ref, tx.id), margin + 10, y + 13);
      doc.setFont('helvetica', 'normal');
      doc.text(toPdfSafeText(tx.payment_method, 'CASH').toUpperCase(), margin + 150, y + 13);
      doc.text(toPdfSafeText(tx.created_at.slice(0, 16)), margin + 250, y + 13);
      doc.setTextColor(16, 125, 85);
      doc.setFont('helvetica', 'bold');
      doc.text(toPdfSafeText(tx.status, 'CONFIRMED').toUpperCase(), margin + 365, y + 13);
      doc.setTextColor(13, 13, 16);
      doc.text(formatPkr(tx.amount_pkr), pageWidth - margin - 10, y + 13, { align: 'right' });
      y += 19;
    }
  }

  // ── 7. Corporate Footer ──
  const footerY = pageHeight - 30;
  doc.setDrawColor(224, 224, 232);
  doc.setLineWidth(0.8);
  doc.line(margin, footerY - 12, pageWidth - margin, footerY - 12);
  doc.setTextColor(100, 100, 112);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    'PRO RIDER AI  |  Travel with Trust  |  Helpline: 03125007782  |  ProRider.pk786@gmail.com  |  Official Digital Receipt',
    pageWidth / 2,
    footerY,
    { align: 'center' }
  );

  return doc;
}

export function downloadBookingPdf(booking: Booking, viewerRole: 'passenger' | 'partner' | 'admin', passengerName?: string) {
  const doc = buildBookingInvoicePdf(booking, { viewerRole, passengerName });
  doc.save(`${toPdfSafeText(booking.invoice_number, booking.id)}.pdf`);
}

export async function shareBookingPdf(booking: Booking, viewerRole: 'passenger' | 'partner' | 'admin', passengerName?: string) {
  const doc = buildBookingInvoicePdf(booking, { viewerRole, passengerName });
  const blob = doc.output('blob');
  const safeName = toPdfSafeText(booking.invoice_number, booking.id);
  const file = new File([blob], `${safeName}.pdf`, { type: 'application/pdf' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: `PRO RIDER AI Invoice ${safeName}`,
      text: `Booking ${booking.id}: ${toPdfSafeText(booking.pickup_address)} to ${toPdfSafeText(booking.dropoff_address)} (${formatPkr(booking.total_bill_pkr)})`,
      files: [file],
    });
    return 'shared';
  }
  doc.save(`${safeName}.pdf`);
  return 'downloaded';
}

export function downloadWalletStatementPdf(
  ownerName: string,
  roleLabel: string,
  balancePkr: number,
  transactions: WalletTransaction[]
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 38;
  const contentWidth = pageWidth - margin * 2;

  // Obsidian Corporate Header + Gold Rule
  doc.setFillColor(13, 13, 16);
  doc.rect(0, 0, pageWidth, 96, 'F');
  doc.setFillColor(212, 160, 23);
  doc.rect(0, 96, pageWidth, 4, 'F');

  doc.setDrawColor(212, 160, 23);
  doc.setLineWidth(2);
  doc.circle(margin + 20, 48, 18, 'S');
  doc.setTextColor(244, 196, 48);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('PR', margin + 20, 52.5, { align: 'center' });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text('PRO RIDER AI — WALLET STATEMENT', margin + 50, 44);
  doc.setTextColor(244, 196, 48);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(`${toPdfSafeText(roleLabel, 'ACCOUNT').toUpperCase()} FINANCIAL LEDGER`, margin + 50, 62);

  doc.setTextColor(210, 210, 222);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`, pageWidth - margin, 46, { align: 'right' });
  doc.text('Helpline: 03125007782', pageWidth - margin, 62, { align: 'right' });

  // Account & Balance Summary Card
  let y = 118;
  doc.setFillColor(248, 248, 250);
  doc.roundedRect(margin, y, contentWidth, 58, 6, 6, 'F');
  doc.setDrawColor(224, 224, 232);
  doc.roundedRect(margin, y, contentWidth, 58, 6, 6, 'S');

  doc.setTextColor(110, 110, 122);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('ACCOUNT HOLDER', margin + 16, y + 20);
  drawSafeValueOrUrduBitmap(doc, ownerName, 'Verified Account', margin + 16, y + 36, 260, 11);

  doc.setTextColor(143, 100, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('AVAILABLE BALANCE (PKR)', pageWidth - margin - 16, y + 20, { align: 'right' });
  doc.setTextColor(13, 13, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(formatPkr(balancePkr), pageWidth - margin - 16, y + 40, { align: 'right' });

  y += 76;

  // Ledger Table Header
  doc.setFillColor(13, 13, 16);
  doc.rect(margin, y, contentWidth, 24, 'F');
  doc.setTextColor(244, 196, 48);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('TX REF', margin + 10, y + 15.5);
  doc.text('DATE', margin + 105, y + 15.5);
  doc.text('TYPE', margin + 185, y + 15.5);
  doc.text('METHOD', margin + 255, y + 15.5);
  doc.text('STATUS', margin + 355, y + 15.5);
  doc.text('AMOUNT', pageWidth - margin - 10, y + 15.5, { align: 'right' });
  y += 24;

  const list = transactions.slice(0, 30);
  if (list.length === 0) {
    doc.setFillColor(255, 255, 255);
    doc.rect(margin, y, contentWidth, 34, 'F');
    doc.setDrawColor(228, 228, 235);
    doc.rect(margin, y, contentWidth, 34, 'S');
    doc.setTextColor(110, 110, 122);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('No wallet transactions recorded during this period.', pageWidth / 2, y + 20, { align: 'center' });
  } else {
    list.forEach((tx, idx) => {
      if (y > pageHeight - 66) return;
      doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250);
      doc.rect(margin, y, contentWidth, 21, 'F');
      doc.setDrawColor(228, 228, 235);
      doc.setLineWidth(0.6);
      doc.rect(margin, y, contentWidth, 21, 'S');

      doc.setTextColor(13, 13, 16);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(toPdfSafeText(tx.tx_ref, tx.id).slice(0, 15), margin + 10, y + 14);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(80, 80, 92);
      doc.text(toPdfSafeText(tx.created_at.slice(0, 10)), margin + 105, y + 14);
      doc.text(toPdfSafeText(tx.type).toUpperCase().slice(0, 11), margin + 185, y + 14);
      doc.text(toPdfSafeText(tx.payment_method).toUpperCase().slice(0, 14), margin + 255, y + 14);
      doc.text(toPdfSafeText(tx.status).toUpperCase().slice(0, 12), margin + 355, y + 14);

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(tx.type === 'credit' ? 16 : 13, tx.type === 'credit' ? 125 : 13, tx.type === 'credit' ? 85 : 16);
      const sign = tx.type === 'credit' ? '+' : '-';
      doc.text(`${sign}${formatPkr(tx.amount_pkr)}`, pageWidth - margin - 10, y + 14, { align: 'right' });
      y += 21;
    });
  }

  // Footer
  const footerY = pageHeight - 30;
  doc.setDrawColor(224, 224, 232);
  doc.line(margin, footerY - 12, pageWidth - margin, footerY - 12);
  doc.setTextColor(100, 100, 112);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    'PRO RIDER AI  |  Travel with Trust  |  Support: 03125007782  |  Official Wallet Ledger',
    pageWidth / 2,
    footerY,
    { align: 'center' }
  );

  doc.save(`PRO-RIDER-Statement-${Date.now()}.pdf`);
}
