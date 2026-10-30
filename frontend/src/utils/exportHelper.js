// xlsx and jspdf are large; they are loaded only when someone actually exports, so they stay out of the initial bundle.

const download = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const exportToCSV = async (data, filename = 'export.csv') => {
  if (!data || !data.length) return;
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(data);
  const csvOutput = XLSX.utils.sheet_to_csv(worksheet);

  download(new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' }), filename);
};

export const exportToExcel = async (data, filename = '7Heaven_Report.xlsx', sheetName = 'Data') => {
  if (!data || !data.length) return;
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
};

export const exportToPDF = async (headers, rows, title = '7Heaven Luxury Report', filename = '7Heaven_Report.pdf') => {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF('l', 'pt', 'a4');

  // Header styling
  doc.setFillColor(11, 19, 43); // Dark navy
  doc.rect(0, 0, doc.internal.pageSize.width, 60, 'F');

  doc.setTextColor(212, 175, 55); // Gold
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('7Heaven Luxury Operations', 40, 38);

  doc.setFontSize(10);
  doc.setTextColor(200, 200, 200);
  doc.text(`Generated: ${new Date().toLocaleDateString()} | ${title}`, 40, 52);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 80,
    theme: 'grid',
    headStyles: {
      fillColor: [18, 24, 41],
      textColor: [212, 175, 55],
      fontStyle: 'bold'
    },
    styles: {
      fontSize: 8,
      cellPadding: 6
    },
    alternateRowStyles: {
      fillColor: [248, 249, 250]
    }
  });

  doc.save(filename);
};
