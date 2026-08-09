import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatILS } from '@/lib/i18n';

interface ReportData {
  revenueData: Array<{ date: string; sessions: number; products: number; total: number }>;
  totalRevenue: number;
  sessionRevenue: number;
  productRevenue: number;
  totalTickets: number;
  avgTicketValue?: number;
  cogs?: number;
  grossProductProfit?: number;
  operatingExpenses?: number;
  operatingResult?: number;
  profitMargin?: number;
  sessionsCount?: number;
  avgSessionMinutes?: number;
  lowStockCount?: number;
  shiftCashDifference?: number;
  devices?: Array<{ name: string; sessions: number; revenue: number; utilization: number }>;
  employeeStats: Array<{ name: string; sessionsStarted: number; ticketsClosed: number; totalRevenue: number }>;
  topProducts: Array<{ name: string; quantity: number; revenue: number; profit?: number }>;
  expenses: Array<{ title: string; amount: number; date: string }>;
  periodLabel: string;
}

export function exportReportPDF(data: ReportData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Use default font (no Arabic shaping, but numbers/layout work)
  doc.setFont('helvetica');

  let y = 20;

  // Title
  doc.setFontSize(18);
  doc.text('NexaCafe Report', 105, y, { align: 'center' });
  y += 8;
  doc.setFontSize(10);
  doc.text(data.periodLabel, 105, y, { align: 'center' });
  y += 12;

  // Summary
  doc.setFontSize(12);
  doc.text('Revenue & Profit Summary', 14, y);
  y += 8;

  (doc as any).autoTable({
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Total Revenue', formatILS(data.totalRevenue)],
      ['Session Revenue', formatILS(data.sessionRevenue)],
      ['Product Revenue', formatILS(data.productRevenue)],
      ['Total Tickets', String(data.totalTickets)],
      ['Average Ticket Value', formatILS(data.avgTicketValue ?? 0)],
      ['Product COGS', formatILS(data.cogs ?? 0)],
      ['Gross Product Profit', formatILS(data.grossProductProfit ?? 0)],
      ['Operating Expenses', formatILS(data.operatingExpenses ?? 0)],
      ['Operating Result (Revenue - COGS - Expenses)', formatILS(data.operatingResult ?? 0)],
      ['Profit Margin', `${(data.profitMargin ?? 0).toFixed(1)}%`],
    ],
    theme: 'grid',
    styles: { fontSize: 10, halign: 'center' },
    headStyles: { fillColor: [0, 188, 212] },
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // Operations
  doc.setFontSize(12);
  doc.text('Operations', 14, y);
  y += 8;

  (doc as any).autoTable({
    startY: y,
    head: [['Metric', 'Value']],
    body: [
      ['Sessions', String(data.sessionsCount ?? 0)],
      ['Avg Session Duration (min)', String(Math.round(data.avgSessionMinutes ?? 0))],
      ['Low Stock Products', String(data.lowStockCount ?? 0)],
      ['Shift Cash Difference', formatILS(data.shiftCashDifference ?? 0)],
    ],
    theme: 'grid',
    styles: { fontSize: 10, halign: 'center' },
    headStyles: { fillColor: [0, 188, 212] },
  });

  y = (doc as any).lastAutoTable.finalY + 12;

  // Revenue by period
  if (data.revenueData.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.text('Revenue Breakdown', 14, y);
    y += 8;

    (doc as any).autoTable({
      startY: y,
      head: [['Date', 'Sessions', 'Products', 'Total']],
      body: data.revenueData.map(r => [
        r.date,
        formatILS(r.sessions),
        formatILS(r.products),
        formatILS(r.total),
      ]),
      theme: 'grid',
      styles: { fontSize: 9, halign: 'center' },
      headStyles: { fillColor: [0, 188, 212] },
    });

    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // Devices
  if (data.devices && data.devices.length > 0) {
    if (y > 220) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.text('Devices', 14, y);
    y += 8;

    (doc as any).autoTable({
      startY: y,
      head: [['Device', 'Sessions', 'Revenue', 'Utilization %']],
      body: data.devices.map(d => [
        d.name,
        String(d.sessions),
        formatILS(d.revenue),
        `${d.utilization.toFixed(1)}%`,
      ]),
      theme: 'grid',
      styles: { fontSize: 9, halign: 'center' },
      headStyles: { fillColor: [0, 188, 212] },
    });

    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // Employee performance
  if (data.employeeStats.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.text('Employee Performance', 14, y);
    y += 8;

    (doc as any).autoTable({
      startY: y,
      head: [['Employee', 'Sessions', 'Tickets', 'Revenue']],
      body: data.employeeStats.map(e => [
        e.name,
        String(e.sessionsStarted),
        String(e.ticketsClosed),
        formatILS(e.totalRevenue),
      ]),
      theme: 'grid',
      styles: { fontSize: 9, halign: 'center' },
      headStyles: { fillColor: [0, 188, 212] },
    });

    y = (doc as any).lastAutoTable.finalY + 12;
  }

  // Top products
  if (data.topProducts.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.text('Top Products', 14, y);
    y += 8;

    (doc as any).autoTable({
      startY: y,
      head: [['Product', 'Qty', 'Revenue', 'Gross Profit']],
      body: data.topProducts.map(p => [
        p.name,
        String(p.quantity),
        formatILS(p.revenue),
        formatILS(p.profit ?? 0),
      ]),
      theme: 'grid',
      styles: { fontSize: 9, halign: 'center' },
      headStyles: { fillColor: [0, 188, 212] },
    });
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 285);
    doc.text(`Page ${i}/${pageCount}`, 196, 285, { align: 'right' });
  }

  doc.save(`nexacafe-report-${new Date().toISOString().split('T')[0]}.pdf`);
}

export function exportReportExcel(data: ReportData) {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['NexaCafe Report', '', data.periodLabel],
    [],
    ['Metric', 'Value'],
    ['Total Revenue', data.totalRevenue],
    ['Session Revenue', data.sessionRevenue],
    ['Product Revenue', data.productRevenue],
    ['Total Tickets', data.totalTickets],
    ['Average Ticket Value', data.avgTicketValue ?? 0],
    ['Product COGS', data.cogs ?? 0],
    ['Gross Product Profit', data.grossProductProfit ?? 0],
    ['Operating Expenses', data.operatingExpenses ?? 0],
    ['Operating Result (Revenue - COGS - Expenses)', data.operatingResult ?? 0],
    ['Profit Margin %', Number((data.profitMargin ?? 0).toFixed(1))],
    [],
    ['Sessions', data.sessionsCount ?? 0],
    ['Avg Session Duration (min)', Math.round(data.avgSessionMinutes ?? 0)],
    ['Low Stock Products', data.lowStockCount ?? 0],
    ['Shift Cash Difference', data.shiftCashDifference ?? 0],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 42 }, { wch: 15 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // Revenue sheet
  if (data.revenueData.length > 0) {
    const revenueSheet = XLSX.utils.json_to_sheet(
      data.revenueData.map(r => ({
        'Date': r.date,
        'Sessions Revenue': r.sessions,
        'Products Revenue': r.products,
        'Total': r.total,
      }))
    );
    revenueSheet['!cols'] = [{ wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, revenueSheet, 'Revenue');
  }

  // Devices sheet
  if (data.devices && data.devices.length > 0) {
    const devSheet = XLSX.utils.json_to_sheet(
      data.devices.map(d => ({
        'Device': d.name,
        'Sessions': d.sessions,
        'Revenue': d.revenue,
        'Utilization %': d.utilization,
      }))
    );
    devSheet['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, devSheet, 'Devices');
  }

  // Employees sheet
  if (data.employeeStats.length > 0) {
    const empSheet = XLSX.utils.json_to_sheet(
      data.employeeStats.map(e => ({
        'Employee': e.name,
        'Sessions Started': e.sessionsStarted,
        'Tickets Closed': e.ticketsClosed,
        'Total Revenue': e.totalRevenue,
      }))
    );
    empSheet['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, empSheet, 'Employees');
  }

  // Top Products sheet
  if (data.topProducts.length > 0) {
    const prodSheet = XLSX.utils.json_to_sheet(
      data.topProducts.map(p => ({
        'Product': p.name,
        'Quantity': p.quantity,
        'Revenue': p.revenue,
        'Gross Profit': p.profit ?? 0,
      }))
    );
    prodSheet['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, prodSheet, 'Top Products');
  }

  XLSX.writeFile(wb, `nexacafe-report-${new Date().toISOString().split('T')[0]}.xlsx`);
}
