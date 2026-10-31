import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, Lock, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { exportToCSV, exportToExcel, exportToPDF } from '../utils/exportHelper';

export const ExportButton = ({
  moduleName,
  data = [],
  excelFilename = '7Heaven_Data.xlsx',
  csvFilename = '7Heaven_Data.csv',
  pdfTitle = '7Heaven Export',
  pdfFilename = '7Heaven_Data.pdf',
  pdfHeaders = [],
  pdfRows = []
}) => {
  const { can } = useAuth();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const hasDownloadRight = can(moduleName, 'canDownload');

  // Exports load their libraries on demand, so they can fail (e.g. offline); tell the user instead of failing silently.
  const runExport = async (exporter) => {
    setIsOpen(false);
    try {
      await exporter();
    } catch (error) {
      console.error('Export failed:', error);
      showToast('Export failed. Check your connection and try again.', 'error');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!hasDownloadRight) {
    return (
      <div style={{ position: 'relative', display: 'inline-block' }} title="Download Restricted: You do not have data download permissions.">
        <button
          className="btn btn-outline"
          disabled
          style={{ opacity: 0.6, cursor: 'not-allowed', color: 'var(--fg-94A3B8)', borderStyle: 'dashed' }}
        >
          <Lock size={14} color="#f59e0b" />
          <span>Export Locked</span>
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-block',
        zIndex: isOpen ? 100 : 'auto'
      }}
      ref={dropdownRef}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="btn btn-outline-gold"
        type="button"
        aria-expanded={isOpen}
      >
        <Download size={15} />
        <span>Export Data</span>
        <ChevronDown
          size={14}
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease'
          }}
        />
      </button>

      {isOpen && (
        <div
          className="animate-fade-in"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 6px)',
            width: '190px',
            zIndex: 1000,
            padding: '6px',
            backgroundColor: 'var(--bg-FFFFFF)',
            borderRadius: '12px',
            boxShadow: '0 12px 28px -6px rgba(16, 24, 40, 0.18), 0 0 0 1px rgba(16, 24, 40, 0.04)',
            border: '1px solid var(--bd-E3E8EF)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px'
          }}
        >
          <button
            type="button"
            onClick={() => runExport(() => exportToExcel(data, excelFilename))}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px 12px',
              background: 'transparent',
              border: 'none',
              color: 'var(--fg-344054)',
              fontSize: '0.825rem',
              borderRadius: '8px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <FileSpreadsheet size={15} color="#10b981" />
            <span style={{ fontWeight: 500 }}>Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={() => runExport(() => exportToCSV(data, csvFilename))}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px 12px',
              background: 'transparent',
              border: 'none',
              color: 'var(--fg-344054)',
              fontSize: '0.825rem',
              borderRadius: '8px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <FileText size={15} color="#0ea5e9" />
            <span style={{ fontWeight: 500 }}>CSV File</span>
          </button>

          {pdfHeaders.length > 0 && (
            <button
              type="button"
              onClick={() => runExport(() => exportToPDF(pdfHeaders, pdfRows, pdfTitle, pdfFilename))}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                background: 'transparent',
                border: 'none',
                color: 'var(--fg-344054)',
                fontSize: '0.825rem',
                borderRadius: '8px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-3)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <FileText size={15} color="#f43f5e" />
              <span style={{ fontWeight: 500 }}>PDF Document</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ExportButton;
