import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search,
  MapPin,
  Users,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type {
  AnalyticsSummary,
  CivicUser,
  Complaint,
  LanguageCode,
  UserRole,
} from './types/civic';
import { TRANSLATIONS } from './i18n/translations';
import { AuthModal } from './components/AuthModal';
import { ComplaintDetailModal } from './components/ComplaintDetailModal';
import { InteractiveMap } from './components/InteractiveMap';
import { ReportIssueView } from './components/ReportIssueView';
import { OfficialDeskView } from './components/OfficialDeskView';
import { AnalyticsDashboardView } from './components/AnalyticsDashboardView';
import { BeforeAfterSlider } from './components/BeforeAfterSlider';
import { StatusIndicator, PriorityText, formatDeadlineCountdown } from './components/StatusLabel';

type ActiveTab = 'overview' | 'report' | 'map' | 'analytics' | 'official';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [lang, setLang] = useState<LanguageCode>('en');

  const [token, setToken] = useState<string | null>(() => localStorage.getItem('civic_token'));
  const [user, setUser] = useState<CivicUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authInitialRole, setAuthInitialRole] = useState<UserRole>('citizen');

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [trackingInput, setTrackingInput] = useState('');
  const [trackingError, setTrackingError] = useState<string | null>(null);

  // Public transparency filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [mapPinSelected, setMapPinSelected] = useState<Complaint | null>(null);
  const [showcaseIdx, setShowcaseIdx] = useState(0);

  const t = TRANSLATIONS[lang];

  const loadData = useCallback(async (authToken: string | null) => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers.Authorization = `Bearer ${authToken}`;

      const [compRes, analyticsRes] = await Promise.all([
        fetch('/api/complaints', { headers }),
        fetch('/api/analytics/summary'),
      ]);

      if (compRes.ok) {
        const compJson = await compRes.json();
        setComplaints(compJson.complaints || []);
      }
      if (analyticsRes.ok) {
        const analJson = await analyticsRes.json();
        setAnalytics(analJson);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const verifyStoredToken = async () => {
      if (token) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
          } else {
            localStorage.removeItem('civic_token');
            setToken(null);
          }
        } catch {
          // ignore network hiccup
        }
      }
      await loadData(token);
    };
    verifyStoredToken();
  }, [token, loadData]);

  const handleAuthSuccess = (newToken: string, newUser: CivicUser) => {
    localStorage.setItem('civic_token', newToken);
    setToken(newToken);
    setUser(newUser);
    if (newUser.role === 'official') {
      setActiveTab('official');
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('civic_token');
    setToken(null);
    setUser(null);
    if (activeTab === 'official') {
      setActiveTab('overview');
    }
  };

  const openComplaintDetail = async (idOrTracking: number | string) => {
    setTrackingError(null);
    try {
      const endpoint =
        typeof idOrTracking === 'number'
          ? `/api/complaints/${idOrTracking}`
          : `/api/complaints/track/${encodeURIComponent(idOrTracking)}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      if (!res.ok) {
        setTrackingError(data.error || 'Complaint not found.');
        return;
      }
      setSelectedComplaint(data.complaint);
    } catch {
      setTrackingError('Unable to fetch complaint details.');
    }
  };

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingInput.trim()) return;
    openComplaintDetail(trackingInput.trim());
  };

  const handleComplaintCreated = (created: Complaint) => {
    setComplaints((prev) => [created, ...prev]);
    loadData(token);
  };

  const handleComplaintUpdated = (updated: Complaint) => {
    setComplaints((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    if (selectedComplaint?.id === updated.id) {
      setSelectedComplaint(updated);
    }
    if (mapPinSelected?.id === updated.id) {
      setMapPinSelected(updated);
    }
    loadData(token);
  };

  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      if (categoryFilter !== 'All' && c.category !== categoryFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hit =
          c.tracking_id.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q) ||
          c.ward.toLowerCase().includes(q) ||
          c.department.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [complaints, statusFilter, categoryFilter, searchQuery]);

  const myComplaints = useMemo(() => {
    if (!user) return [];
    return complaints.filter((c) => c.citizen_id === user.id);
  }, [complaints, user]);

  const resolvedWithComparison = useMemo(
    () => complaints.filter((c) => c.status === 'Resolved' && c.before_image && c.after_image),
    [complaints]
  );

  const featuredComparison = resolvedWithComparison[showcaseIdx % Math.max(1, resolvedWithComparison.length)];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className="text-xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0 font-display"
          >
            {t.brand}
          </button>

          {/* Zone 2: 5 concise single-line text nav links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {(
              [
                ['overview', t.nav.overview],
                ['report', t.nav.report],
                ['map', t.nav.map],
                ['analytics', t.nav.analytics],
                ['official', t.nav.official],
              ] as Array<[ActiveTab, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 ${
                  activeTab === key
                    ? 'text-blue-700 border-blue-700 font-semibold'
                    : 'text-slate-600 border-transparent hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="shrink-0">
            {user ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {t.actions.signOut} · {user.name.split(' ')[0]}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthInitialRole(activeTab === 'official' ? 'official' : 'citizen');
                  setAuthModalOpen(true);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {t.actions.signIn}
              </button>
            )}
          </div>
        </div>

        {/* Mobile navigation row */}
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium">
          {(
            [
              ['overview', t.nav.overview],
              ['report', t.nav.report],
              ['map', t.nav.map],
              ['analytics', t.nav.analytics],
              ['official', t.nav.official],
            ] as Array<[ActiveTab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`py-1 whitespace-nowrap shrink-0 ${
                activeTab === key ? 'text-blue-700 font-semibold' : 'text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Workspace Language & Session Context Toolbar (Below Header) */}
      <div className="bg-white border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="text-slate-600 flex items-center gap-2">
            {user ? (
              <>
                <span className="font-semibold text-slate-900">{user.name}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {user.role === 'official'
                    ? `Official (${user.department || 'All Departments'})`
                    : 'Registered Citizen'}
                </span>
              </>
            ) : (
              <span>Public Transparency Mode · Sign in for Citizen or Official actions</span>
            )}
          </div>

          <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                lang === 'en' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => setLang('kn')}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                lang === 'kn' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              ಕನ್ನಡ
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'overview' && (
          <div className="space-y-10">
            {/* Hero Section + Live Tracking Lookup */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              <div className="lg:col-span-7 flex flex-col justify-between bg-white border border-slate-200 rounded-xl p-7 sm:p-8">
                <div>
                  <p className="text-xs font-semibold text-blue-700">{t.hero.kicker}</p>
                  <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight mt-2 leading-tight text-balance">
                    {t.hero.title}
                  </h1>
                  <p className="text-sm sm:text-base text-slate-600 mt-4 leading-relaxed max-w-2xl">
                    {t.hero.subtitle}
                  </p>
                </div>

                <div className="mt-7 space-y-4">
                  <form onSubmit={handleTrackSubmit} className="flex flex-col sm:flex-row gap-2.5">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={trackingInput}
                        onChange={(e) => setTrackingInput(e.target.value)}
                        placeholder={t.hero.trackPlaceholder}
                        className="w-full pl-10 pr-4 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700 font-mono-tabular"
                      />
                    </div>
                    <button
                      type="submit"
                      className="px-4 py-2.5 text-sm font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                    >
                      {t.actions.trackNow}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('report')}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <span>{t.actions.reportIssue}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </form>
                  {trackingError && <p className="text-xs text-red-700">{trackingError}</p>}
                </div>
              </div>

              {/* Right Column: Interactive Before & After Verification Showcase */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
                {featuredComparison ? (
                  <>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-emerald-700">
                          Verified Public Resolution ·{' '}
                          <span className="font-mono-tabular">
                            {featuredComparison.tracking_id}
                          </span>
                        </p>
                        <h2 className="text-sm font-bold text-slate-900 truncate mt-0.5">
                          {featuredComparison.title}
                        </h2>
                      </div>
                      {resolvedWithComparison.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setShowcaseIdx((i) => i + 1)}
                          className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
                        >
                          Next Repair
                        </button>
                      )}
                    </div>

                    <BeforeAfterSlider
                      beforeSrc={featuredComparison.before_image}
                      afterSrc={featuredComparison.after_image}
                      title={featuredComparison.title}
                    />

                    <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                      <span>
                        {featuredComparison.ward} · {featuredComparison.community_verifications}{' '}
                        verifications
                      </span>
                      <button
                        type="button"
                        onClick={() => openComplaintDetail(featuredComparison.id)}
                        className="font-semibold text-slate-900 hover:text-blue-700"
                      >
                        Inspect Timeline →
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    Before &amp; After repair verifications appear here.
                  </div>
                )}
              </div>
            </section>

            {/* 4-Column Full-Width KPI Strip */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500">{t.kpis.total}</p>
                <p className="text-3xl font-bold text-slate-900 mt-1 font-mono-tabular">
                  {analytics?.totals.total ?? complaints.length}
                </p>
                <p className="text-xs text-slate-500 mt-1">Across 10 municipal wards</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500">{t.kpis.resolved}</p>
                <p className="text-3xl font-bold text-emerald-700 mt-1 font-mono-tabular">
                  {analytics?.totals.resolved ?? 0}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {analytics?.totals.total
                    ? `${Math.round((analytics.totals.resolved / analytics.totals.total) * 100)}% completion rate`
                    : 'Verified with evidence'}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500">{t.kpis.avgTime}</p>
                <p className="text-3xl font-bold text-slate-900 mt-1 font-mono-tabular">
                  {analytics?.totals.avgResolutionHours ?? 36}h
                </p>
                <p className="text-xs text-slate-500 mt-1">From submission to closure</p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500">{t.kpis.escalated}</p>
                <p className="text-3xl font-bold text-red-700 mt-1 font-mono-tabular">
                  {analytics?.totals.escalated ?? 0}
                </p>
                <p className="text-xs text-slate-500 mt-1">Auto-flagged past SLA deadline</p>
              </div>
            </section>

            {/* Public Transparency Ledger */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    Public Grievance Transparency Ledger
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Inspect live civic complaints, verify local issues, and review official actions.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search ID, street, ward..."
                      className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-700"
                    />
                  </div>

                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    aria-label="Filter by category"
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {Object.entries(t.categories).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    aria-label="Filter by status"
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {Object.entries(t.statuses).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {loading ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  Loading public civic records...
                </div>
              ) : filteredComplaints.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <p className="text-sm text-slate-600">
                    No complaints match your current search or filter criteria.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('All');
                      setCategoryFilter('All');
                    }}
                    className="px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="py-3 px-5 font-semibold">Tracking ID</th>
                        <th className="py-3 px-4 font-semibold">Issue &amp; Location</th>
                        <th className="py-3 px-4 font-semibold">Department</th>
                        <th className="py-3 px-4 font-semibold">Priority</th>
                        <th className="py-3 px-4 font-semibold">Status &amp; SLA</th>
                        <th className="py-3 px-4 font-semibold text-right">Verified</th>
                        <th className="py-3 px-5 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredComplaints.map((c) => (
                        <tr
                          key={c.id}
                          onClick={() => openComplaintDetail(c.id)}
                          className="hover:bg-slate-50/90 cursor-pointer transition-colors"
                        >
                          <td className="py-3.5 px-5 font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                            {c.tracking_id}
                          </td>
                          <td className="py-3.5 px-4 max-w-md">
                            <p className="font-semibold text-slate-900 line-clamp-1">{c.title}</p>
                            <p className="text-slate-500 mt-0.5 line-clamp-1">
                              {c.category} · {c.ward} · {c.address}
                            </p>
                          </td>
                          <td className="py-3.5 px-4 text-slate-700 whitespace-nowrap">
                            {c.department}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <PriorityText priority={c.priority} />
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <StatusIndicator status={c.status} isOverdue={c.is_overdue} />
                            <div className="text-slate-400 mt-0.5 font-mono-tabular">
                              {formatDeadlineCountdown(c.deadline_at, c.status)}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono-tabular text-slate-700">
                            <span className="inline-flex items-center gap-1">
                              <Users className="w-3.5 h-3.5 text-slate-400" />
                              {c.community_verifications}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openComplaintDetail(c.id);
                              }}
                              className="font-semibold text-blue-700 hover:underline"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {activeTab === 'report' && (
          <ReportIssueView
            user={user}
            token={token}
            lang={lang}
            myComplaints={myComplaints}
            onRequireAuth={() => {
              setAuthInitialRole('citizen');
              setAuthModalOpen(true);
            }}
            onComplaintCreated={handleComplaintCreated}
            onSelectComplaint={(c) => openComplaintDetail(c.id)}
          />
        )}

        {activeTab === 'map' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                  Interactive Civic Issue Map
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Geographic distribution of reported public grievances across wards. Click any pin
                  to inspect status and evidence.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  Critical / Escalated
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  In Progress
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-700" />
                  Submitted / Accepted
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Resolved
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-8">
                <InteractiveMap
                  complaints={filteredComplaints}
                  selectedId={mapPinSelected?.id}
                  onSelectComplaint={(c) => setMapPinSelected(c)}
                  heightClass="h-[560px]"
                />
              </div>

              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                {mapPinSelected ? (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono-tabular font-bold text-blue-700">
                        {mapPinSelected.tracking_id}
                      </span>
                      <StatusIndicator
                        status={mapPinSelected.status}
                        isOverdue={mapPinSelected.is_overdue}
                      />
                    </div>
                    <h2 className="text-base font-bold text-slate-900">{mapPinSelected.title}</h2>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {mapPinSelected.ai_summary || mapPinSelected.description}
                    </p>
                    <div className="text-xs text-slate-500 space-y-1 pt-2 border-t border-slate-100">
                      <p>
                        <strong>Department:</strong> {mapPinSelected.department}
                      </p>
                      <p>
                        <strong>Location:</strong> {mapPinSelected.address} ({mapPinSelected.ward})
                      </p>
                      <p className="font-mono-tabular">
                        <strong>Coordinates:</strong> {mapPinSelected.latitude.toFixed(5)},{' '}
                        {mapPinSelected.longitude.toFixed(5)}
                      </p>
                    </div>
                    {mapPinSelected.before_image && (
                      <img
                        src={mapPinSelected.before_image}
                        alt={mapPinSelected.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-40 object-cover rounded-lg border border-slate-200"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => openComplaintDetail(mapPinSelected.id)}
                      className="w-full py-2.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                    >
                      Open Full Dossier &amp; Timeline
                    </button>
                  </>
                ) : (
                  <div className="py-12 text-center space-y-2 text-xs text-slate-500">
                    <MapPin className="w-7 h-7 mx-auto text-slate-400" />
                    <p className="font-semibold text-slate-700">Select a map marker</p>
                    <p>
                      Click any pin on the street map to inspect complaint details, photos, and
                      escalation status.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && <AnalyticsDashboardView analytics={analytics} />}

        {activeTab === 'official' && (
          <OfficialDeskView
            user={user}
            token={token}
            complaints={complaints}
            onRequireOfficialAuth={() => {
              setAuthInitialRole('official');
              setAuthModalOpen(true);
            }}
            onComplaintUpdated={handleComplaintUpdated}
          />
        )}
      </main>

      {/* Clean Institutional Footer */}
      <footer className="bg-white border-t border-slate-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <p className="max-w-3xl leading-relaxed">{t.footer.disclaimer}</p>
          <p className="font-semibold text-slate-700 whitespace-nowrap">CIVIC Platform</p>
        </div>
      </footer>

      {/* Modals */}
      <AuthModal
        isOpen={authModalOpen}
        initialRole={authInitialRole}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />

      <ComplaintDetailModal
        complaint={selectedComplaint}
        user={user}
        token={token}
        onClose={() => setSelectedComplaint(null)}
        onComplaintUpdated={handleComplaintUpdated}
        onOpenTrackingId={(tid) => openComplaintDetail(tid)}
        onRequireAuth={() => {
          setAuthInitialRole('citizen');
          setAuthModalOpen(true);
        }}
      />
    </div>
  );
}
