import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Building2,
  Clock,
  DollarSign,
  ScanLine,
  ArrowRight,
  MapPin
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import CategoryIcon from '../components/CategoryIcon';
import guestService from '../services/guestService';
import supplierService from '../services/supplierService';
import { formatDate } from '../utils/dateHelper';
import { getErrorMessage } from '../services/api';

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export const DashboardPage = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [guestStats, setGuestStats] = useState(null);
  const [supplierStats, setSupplierStats] = useState(null);
  const [recentGuests, setRecentGuests] = useState([]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [gStatsRes, sStatsRes, guestsRes] = await Promise.all([
        guestService.getStats(),
        supplierService.getStats(),
        guestService.getGuests()
      ]);

      if (gStatsRes.success) {setGuestStats(gStatsRes.data);} else {showToast(gStatsRes.message, 'error');}
      if (sStatsRes.success) {setSupplierStats(sStatsRes.data);} else {showToast(sStatsRes.message, 'error');}
      if (guestsRes.success) {setRecentGuests(guestsRes.data.slice(0, 5));} else {showToast(guestsRes.message, 'error');}
    } catch (err) {
      showToast('Error loading dashboard metrics: ' + getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const stages = [
    { label: 'Under Process', count: guestStats?.underProcess || 0, color: '#F79009' },
    { label: 'Quoted', count: guestStats?.quoted || 0, color: '#2E90FA' },
    { label: 'Confirmed', count: guestStats?.confirmed || 0, color: '#7A5AF8' },
    { label: 'Confirmed & Payment received', count: guestStats?.confirmedAndPaid || 0, color: '#12B76A' },
    { label: 'Travelled', count: guestStats?.travelled || 0, color: 'var(--fg-0E9AA7)' },
    { label: 'Cancelled', count: guestStats?.cancelled || 0, color: '#F04438' }
  ];

  const categories = [
    { cat: 'Domestic', count: supplierStats?.domestic || 0 },
    { cat: 'International', count: supplierStats?.international || 0 },
    { cat: 'Flight Consolidator', count: supplierStats?.flightConsolidator || 0 },
    { cat: 'Visa', count: supplierStats?.visa || 0 },
    { cat: 'General', count: supplierStats?.general || 0 }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} aria-busy={loading}>
      {/* Page header */}
      <div className="page-header animate-fade-in">
        <div className="page-header-text">
          <h2 className="page-title">
            {greeting()}, {user?.firstName}
          </h2>
          <p className="page-subtitle">
            Your live inquiry pipeline, supplier directory and scanner activity at a glance.
          </p>
        </div>

        <div className="page-actions">
          <button onClick={() => navigate('/guests')} className="btn btn-outline">
            <span>View All Inquiries</span>
            <ArrowRight size={15} />
          </button>
          <button onClick={() => navigate('/scanner')} className="btn btn-primary">
            <ScanLine size={15} />
            <span>Launch Scanner</span>
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="kpi-grid">
        <StatCard
          title="Total Inquiries"
          value={guestStats?.total || 0}
          subtitle="All generated leads"
          icon={Users}
          color="#2563EB"
        />

        <StatCard
          title="Under Process"
          value={guestStats?.underProcess || 0}
          subtitle="Pending quotes & discussion"
          icon={Clock}
          color="#F79009"
        />

        <StatCard
          title="Confirmed & Paid"
          value={guestStats?.confirmedAndPaid || 0}
          subtitle="Ready for operations execution"
          icon={DollarSign}
          color="#12B76A"
        />

        <StatCard
          title="Active Suppliers"
          value={supplierStats?.total || 0}
          subtitle="Across 5 supplier categories"
          icon={Building2}
          color="#0284C7"
        />
      </div>

      {/* Pipeline breakdown + supplier categories */}
      <div className="rs-two-col" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px' }}>
        <section className="section-card">
          <div className="section-card-header">
            <div>
              <h3 className="section-card-title">Inquiry Stage Distribution</h3>
              <p className="section-card-sub">Conversion tracking across the inquiry life-cycle</p>
            </div>
            <span className="count-chip">{guestStats?.total || 0} total</span>
          </div>

          <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {stages.map((stage) => {
              const total = guestStats?.total || 1;
              const pct = Math.round((stage.count / total) * 100) || 0;

              return (
                <div key={stage.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '0.8125rem', marginBottom: '7px' }}>
                    <span style={{ color: 'var(--neutral-muted)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, flexShrink: 0 }} />
                      {stage.label}
                    </span>
                    <span style={{ color: 'var(--neutral-gray)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <span style={{ color: 'var(--text-primary)' }}>{stage.count}</span> · {pct}%
                    </span>
                  </div>
                  <div style={{ height: '8px', width: '100%', background: 'var(--bg-F2F4F7)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: stage.color,
                        borderRadius: '9999px',
                        transition: 'width 0.6s ease'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="section-card">
          <div className="section-card-header">
            <div>
              <h3 className="section-card-title">Suppliers by Category</h3>
              <p className="section-card-sub">Vendor network segregation</p>
            </div>
            <button
              onClick={() => navigate('/suppliers')}
              className="btn-icon btn-outline btn-sm"
              title="View Suppliers"
              aria-label="View suppliers"
            >
              <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column' }}>
            {categories.map((item) => (
              <div
                key={item.cat}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '10px 8px',
                  borderBottom: '1px solid var(--border-subtle)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <CategoryIcon category={item.cat} size={16} tile />
                  <span style={{ fontSize: '0.855rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.cat}</span>
                </div>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--neutral-subtle)' }}>
                  {item.count} {item.count === 1 ? 'vendor' : 'vendors'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Recent inquiries */}
      <section className="section-card">
        <div className="section-card-header">
          <div>
            <h3 className="section-card-title">Recent Guest Inquiries</h3>
            <p className="section-card-sub">The five newest inquiries</p>
          </div>
          <button onClick={() => navigate('/guests')} className="btn btn-secondary btn-sm">
            <span>Manage All Inquiries</span>
            <ArrowRight size={14} />
          </button>
        </div>

        <div className="table-container" style={{ border: 'none', borderRadius: '0 0 12px 12px', boxShadow: 'none' }}>
          <table className="luxury-table table-stack">
            <thead>
              <tr>
                <th>Sr No</th>
                <th>Inquiry Date</th>
                <th>Guest Names</th>
                <th>Destination</th>
                <th>Travel Date</th>
                <th>Status</th>
                <th>Sales / Ops</th>
              </tr>
            </thead>
            <tbody>
              {recentGuests.map((g) => (
                <tr key={g._id || g.srNo}>
                  <td data-label="Sr No" style={{ fontWeight: 650, color: 'var(--primary-text)' }}>{g.srNo}</td>
                  <td data-label="Inquiry Date" style={{ color: 'var(--neutral-gray)' }}>{formatDate(g.inquiryDate)}</td>
                  <td data-label="Guest">
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{g.guestNames}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--neutral-gray)' }}>{g.contactNumber}</div>
                  </td>
                  <td data-label="Destination">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--neutral-muted)' }}>
                      <MapPin size={13} color="#2563EB" />
                      <span>{g.destination}</span>
                    </div>
                  </td>
                  <td data-label="Travel Date" style={{ color: 'var(--neutral-subtle)' }}>{formatDate(g.travelDate)}</td>
                  <td data-label="Status">
                    <StatusBadge status={g.status} />
                  </td>
                  <td data-label="Sales / Ops">
                    <div style={{ fontSize: '0.78rem', color: 'var(--neutral-subtle)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Sales</span> <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{g.sales}</strong>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--neutral-subtle)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Ops</span> <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{g.ops}</strong>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && recentGuests.length === 0 && (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No inquiries yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default DashboardPage;
