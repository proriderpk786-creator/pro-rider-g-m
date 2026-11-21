import { jsPDF } from 'jspdf';
import type { Booking, WalletTransaction } from '../types';

function formatPkr(val: number): string {
  return `Rs. ${Math.round(Number(val || 0)).toLocaleString('en-PK')}`;
}

export function buildBookingInvoicePdf(
  booking: Booking,
  options: { viewerRole: 'passenger' | 'partner' | 'admin'; passengerName?: string }
): jsPDF {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 0;

  // Obsidian Black Top Corporate Header
  doc.setFillColor(13, 13, 16);
  doc.rect(0, 0, pageWidth, 108, 'F');

  // Gold accent bar
  doc.setFillColor(212, 160, 23);
  doc.rect(0, 108, pageWidth, 4, 'F');

  // Brand Emblem Circle
  doc.setDrawColor(212, 160, 23);
  doc.setLineWidth(2);
  doc.circle(margin + 22, 54, 20, 'S');
  doc.setTextColor(212, 160, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('PR', margin + 22, 59, { align: 'center' });

  // Title & Tagline
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('PRO RIDER AI — DIGITAL INVOICE', margin + 56, 48);
  doc.setTextColor(212, 160, 23);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Travel with Trust  |  Official Support: 03125007782', margin + 56, 68);

  // Invoice Meta Top Right
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Invoice: ${booking.invoice_number}`, pageWidth - margin, 44, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.text(`Booking ID: ${booking.id}`, pageWidth - margin, 60, { align: 'right' });
  doc.text(`Issued: ${new Date().toISOString().slice(0, 10)}`, pageWidth - margin, 76, { align: 'right' });

  y = 136;

  // Parties & Vehicle Section
  doc.setFillColor(248, 248, 250);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 92, 6, 6, 'F');
  doc.setDrawColor(228, 228, 234);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 92, 6, 6, 'S');

  doc.setTextColor(13, 13, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PASSENGER & SERVICE', margin + 16, y + 22);
  doc.text('PRO PARTNER & VEHICLE', pageWidth / 2 + 10, y + 22);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(60, 60, 70);
  const pName = options.passengerName || booking.passenger_name || 'Verified Passenger';
  doc.text(`Passenger: ${pName}`, margin + 16, y + 40);
  doc.text(`Service: ${booking.service_type.replaceAll('_', ' ').toUpperCase()} (${booking.booking_mode.replaceAll('_', ' ').toUpperCase()})`, margin + 16, y + 56);
  doc.text(`Seats Booked: ${booking.seats_requested}`, margin + 16, y + 72);

  doc.text(`Pro Partner: ${booking.partner_name || 'Pending Assignment'}`, pageWidth / 2 + 10, y + 40);
  doc.text(`Category: ${booking.vehicle_category_name || booking.vehicle_category_id}`, pageWidth / 2 + 10, y + 56);
  doc.text(`Vehicle: ${booking.partner_vehicle_name || '-'} (${booking.partner_vehicle_number || 'N/A'})`, pageWidth / 2 + 10, y + 72);

  y += 112;

  // Route & Schedule Details
  doc.setTextColor(13, 13, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('ROUTE & SCHEDULE DETAILS', margin, y);
  y += 12;

  doc.setDrawColor(212, 160, 23);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  const rows: [string, string][] = [
    ['Pickup Address', booking.pickup_address],
    ['Drop-off Address', booking.dropoff_address],
    ['Pickup Date & Time', `${booking.pickup_date} at ${booking.pickup_time}`],
    ['Expected Drop-off', `${booking.expected_dropoff_date || booking.pickup_date} ${booking.expected_dropoff_time || ''}`.trim()],
    ['Actual Drop-off Time', booking.actual_dropoff_time || 'Pending / Not Recorded'],
    ['Actual Road Distance', `${booking.distance_km} km`],
    ['Estimated Travel Duration', `${booking.duration_min} minutes`],
    ['Trip Status', booking.status.replaceAll('_', ' ').toUpperCase()],
  ];

  doc.setFontSize(9.5);
  for (const [label, val] of rows) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 90);
    doc.text(label, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(13, 13, 16);
    const wrapped = doc.splitTextToSize(String(val), pageWidth - margin * 2 - 150);
    doc.text(wrapped, margin + 150, y);
    y += Math.max(18, wrapped.length * 13);
  }

  // OpenStreetMap route link
  const osmUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${booking.pickup_lat},${booking.pickup_lng};${booking.dropoff_lat},${booking.dropoff_lng}`;
  doc.setTextColor(37, 99, 235);
  doc.setFontSize(8.5);
  doc.textWithLink('Open Route on OpenStreetMap', margin, y + 4, { url: osmUrl });
  y += 26;

  // Financial Summary Box (Strict Black/White/Gold)
  const totalBill = Number(booking.total_bill_pkr || 0);
  const amountPaid = Number(booking.amount_paid_pkr || 0);
  const remaining = Math.max(0, totalBill - amountPaid);

  doc.setFillColor(13, 13, 16);
  doc.roundedRect(margin, y, pageWidth - margin * 2, 114, 6, 6, 'F');

  doc.setTextColor(212, 160, 23);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('FINANCIAL SUMMARY (PKR)', margin + 18, y + 24);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.text(`TOTAL BILL:`, margin + 18, y + 48);
  doc.text(formatPkr(totalBill), pageWidth - margin - 18, y + 48, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`AMOUNT PAID (Confirmed):`, margin + 18, y + 68);
  doc.text(formatPkr(amountPaid), pageWidth - margin - 18, y + 68, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.text(`REMAINING BALANCE:`, margin + 18, y + 88);
  doc.text(formatPkr(remaining), pageWidth - margin - 18, y + 88, { align: 'right' });

  doc.setTextColor(212, 160, 23);
  doc.text(`PAYMENT STATUS: ${booking.payment_status}`, margin + 18, y + 104);

  if (options.viewerRole !== 'passenger' && booking.commission_pkr > 0) {
    doc.setTextColor(210, 210, 220);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Platform Commission: ${formatPkr(booking.commission_pkr)}`, pageWidth - margin - 18, y + 104, {
      align: 'right',
    });
  }

  y += 134;

  // Confirmed Transactions Table
  const confirmedTxs = (booking.transactions || []).filter((tx) => tx.status === 'confirmed');
  if (confirmedTxs.length > 0 && y < 740) {
    doc.setTextColor(13, 13, 16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('CONFIRMED PAYMENT TRANSACTIONS', margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    for (const tx of confirmedTxs.slice(0, 6)) {
      doc.text(
        `${tx.tx_ref}  |  ${tx.payment_method.toUpperCase()}  |  ${tx.created_at.slice(0, 16)}  |  ${formatPkr(tx.amount_pkr)}`,
        margin,
        y
      );
      y += 14;
    }
  }

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 36;
  doc.setDrawColor(225, 225, 230);
  doc.line(margin, footerY - 12, pageWidth - margin, footerY - 12);
  doc.setTextColor(110, 110, 120);
  doc.setFontSize(8);
  doc.text(
    'PRO RIDER AI — Travel with Trust  |  Support: 03125007782  |  ProRider.pk786@gmail.com',
    pageWidth / 2,
    footerY,
    { align: 'center' }
  );

  return doc;
}

export function downloadBookingPdf(booking: Booking, viewerRole: 'passenger' | 'partner' | 'admin', passengerName?: string) {
  const doc = buildBookingInvoicePdf(booking, { viewerRole, passengerName });
  doc.save(`${booking.invoice_number}.pdf`);
}

export async function shareBookingPdf(booking: Booking, viewerRole: 'passenger' | 'partner' | 'admin', passengerName?: string) {
  const doc = buildBookingInvoicePdf(booking, { viewerRole, passengerName });
  const blob = doc.output('blob');
  const file = new File([blob], `${booking.invoice_number}.pdf`, { type: 'application/pdf' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: `PRO RIDER AI Invoice ${booking.invoice_number}`,
      text: `Booking ${booking.id}: ${booking.pickup_address} to ${booking.dropoff_address} (${formatPkr(booking.total_bill_pkr)})`,
      files: [file],
    });
    return 'shared';
  }
  doc.save(`${booking.invoice_number}.pdf`);
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
  const margin = 40;

  doc.setFillColor(13, 13, 16);
  doc.rect(0, 0, pageWidth, 88, 'F');
  doc.setFillColor(212, 160, 23);
  doc.rect(0, 88, pageWidth, 4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('PRO RIDER AI — WALLET STATEMENT', margin, 44);
  doc.setTextColor(212, 160, 23);
  doc.setFontSize(9.5);
  doc.text(`${ownerName} (${roleLabel})  |  Generated: ${new Date().toISOString().slice(0, 10)}`, margin, 66);

  let y = 120;
  doc.setTextColor(13, 13, 16);
  doc.setFontSize(12);
  doc.text(`Current Available Balance: ${formatPkr(balancePkr)}`, margin, y);
  y += 26;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('REF ID', margin, y);
  doc.text('TYPE', margin + 115, y);
  doc.text('METHOD', margin + 190, y);
  doc.text('STATUS', margin + 275, y);
  doc.text('AMOUNT', pageWidth - margin, y, { align: 'right' });
  y += 10;
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  for (const tx of transactions.slice(0, 32)) {
    if (y > 770) break;
    doc.text(tx.tx_ref, margin, y);
    doc.text(tx.type.toUpperCase(), margin + 115, y);
    doc.text(tx.payment_method.toUpperCase(), margin + 190, y);
    doc.text(tx.status.toUpperCase(), margin + 275, y);
    doc.text(formatPkr(tx.amount_pkr), pageWidth - margin, y, { align: 'right' });
    y += 18;
  }

  doc.save(`PRO-RIDER-Statement-${Date.now()}.pdf`);
}
