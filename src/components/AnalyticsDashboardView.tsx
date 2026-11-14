import { useEffect, useRef, useState } from 'react';
import Plotly from 'plotly.js-dist-min';
import { RefreshCw, TrendingUp } from 'lucide-react';
import type { AnalyticsSummary, PredictionsResponse } from '../types/civic';

interface AnalyticsDashboardViewProps {
  analytics: AnalyticsSummary | null;
}

export function AnalyticsDashboardView({ analytics }: AnalyticsDashboardViewProps) {
  const deptChartRef = useRef<HTMLDivElement | null>(null);
  const statusChartRef = useRef<HTMLDivElement | null>(null);
  const categoryChartRef = useRef<HTMLDivElement | null>(null);
  const trendChartRef = useRef<HTMLDivElement | null>(null);

  const [predictions, setPredictions] = useState<PredictionsResponse | null>(null);
  const [loadingPred, setLoadingPred] = useState(false);

  const fetchPredictions = async () => {
    setLoadingPred(true);
    try {
      const res = await fetch('/api/analytics/predictions');
      if (res.ok) {
        const data = await res.json();
        setPredictions(data);
      }
    } finally {
      setLoadingPred(false);
    }
  };

  useEffect(() => {
    fetchPredictions();
  }, []);

  useEffect(() => {
    if (!analytics) return;

    const commonFont = { family: 'DM Sans, sans-serif', color: '#334155', size: 12 };
    const plotConfig = { displayModeBar: false, responsive: true };

    if (deptChartRef.current) {
      const depts = analytics.byDepartment.map((d) =>
        d.department.replace(' & ', '\n& ')
      );
      Plotly.newPlot(
        deptChartRef.current,
        [
          {
            name: 'Resolved',
            x: depts,
            y: analytics.byDepartment.map((d) => d.resolved),
            type: 'bar',
            marker: { color: '#16a34a' },
          },
          {
            name: 'Pending / Active',
            x: depts,
            y: analytics.byDepartment.map((d) => Math.max(0, d.pending - d.escalated)),
            type: 'bar',
            marker: { color: '#1d4ed8' },
          },
          {
            name: 'Escalated',
            x: depts,
            y: analytics.byDepartment.map((d) => d.escalated),
            type: 'bar',
            marker: { color: '#dc2626' },
          },
        ],
        {
          barmode: 'stack',
          margin: { t: 16, r: 16, b: 64, l: 40 },
          font: commonFont,
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          legend: { orientation: 'h', y: 1.15 },
          yaxis: { gridcolor: '#e2e8f0', zeroline: false },
        },
        plotConfig
      );
    }

    if (statusChartRef.current) {
      const statusColors: Record<string, string> = {
        Resolved: '#16a34a',
        'In Progress': '#d97706',
        Accepted: '#2563eb',
        Submitted: '#64748b',
        Escalated: '#dc2626',
      };
      Plotly.newPlot(
        statusChartRef.current,
        [
          {
            labels: analytics.byStatus.map((s) => s.status),
            values: analytics.byStatus.map((s) => s.count),
            type: 'pie',
            hole: 0.56,
            marker: {
              colors: analytics.byStatus.map((s) => statusColors[s.status] || '#475569'),
            },
            textinfo: 'label+value',
          },
        ],
        {
          margin: { t: 16, r: 16, b: 16, l: 16 },
          font: commonFont,
          paper_bgcolor: 'transparent',
          showlegend: false,
        },
        plotConfig
      );
    }

    if (categoryChartRef.current) {
      const sorted = [...analytics.byCategory].reverse();
      Plotly.newPlot(
        categoryChartRef.current,
        [
          {
            y: sorted.map((c) => c.category),
            x: sorted.map((c) => c.count),
            type: 'bar',
            orientation: 'h',
            marker: { color: '#0f172a' },
          },
        ],
        {
          margin: { t: 12, r: 24, b: 32, l: 150 },
          font: commonFont,
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          xaxis: { gridcolor: '#e2e8f0', zeroline: false, dtick: 1 },
        },
        plotConfig
      );
    }

    if (trendChartRef.current) {
      Plotly.newPlot(
        trendChartRef.current,
        [
          {
            name: 'Reported',
            x: analytics.monthlyTrend.map((m) => m.month),
            y: analytics.monthlyTrend.map((m) => m.reported),
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: '#1d4ed8', width: 2.5 },
          },
          {
            name: 'Resolved',
            x: analytics.monthlyTrend.map((m) => m.month),
            y: analytics.monthlyTrend.map((m) => m.resolved),
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: '#16a34a', width: 2.5 },
          },
        ],
        {
          margin: { t: 16, r: 16, b: 36, l: 40 },
          font: commonFont,
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          legend: { orientation: 'h', y: 1.15 },
          yaxis: { gridcolor: '#e2e8f0', zeroline: false },
        },
        plotConfig
      );
    }
  }, [analytics]);

  if (!analytics) {
    return (
      <div className="py-16 text-center text-sm text-slate-500">
        Loading municipal analytics...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Public Transparency &amp; Municipal Analytics
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Live department turnaround times, issue category frequency, and AI civic risk forecasts.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-600 tabular-nums">
          <span>
            Avg Citizen Rating: <strong className="text-slate-900">{analytics.totals.avgCitizenRating}/5</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Community Verifications:{' '}
            <strong className="text-slate-900">{analytics.totals.communityVerificationsTotal}</strong>
          </span>
        </div>
      </div>

      {/* Plotly Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">
            Department-wise Complaint Resolution
          </h2>
          <div ref={deptChartRef} className="w-full h-72" />
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Current Status Breakdown</h2>
          <div ref={statusChartRef} className="w-full h-72" />
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">
            Frequently Reported Civic Categories
          </h2>
          <div ref={categoryChartRef} className="w-full h-64" />
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-3">
            6-Month Intake vs. Resolution Trend
          </h2>
          <div ref={trendChartRef} className="w-full h-64" />
        </div>
      </div>

      {/* Department SLA Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200">
          <h2 className="text-sm font-bold text-slate-900">Department Performance Ledger</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-3 px-5 font-semibold">Department</th>
                <th className="py-3 px-4 font-semibold text-right">Total</th>
                <th className="py-3 px-4 font-semibold text-right">Resolved</th>
                <th className="py-3 px-4 font-semibold text-right">Pending</th>
                <th className="py-3 px-4 font-semibold text-right">Escalated</th>
                <th className="py-3 px-5 font-semibold text-right">Avg Resolution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analytics.byDepartment.map((d) => (
                <tr key={d.department} className="hover:bg-slate-50/70">
                  <td className="py-3 px-5 font-medium text-slate-900">{d.department}</td>
                  <td className="py-3 px-4 text-right font-mono-tabular">{d.total}</td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-emerald-700 font-semibold">
                    {d.resolved}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular">{d.pending}</td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-red-700 font-semibold">
                    {d.escalated}
                  </td>
                  <td className="py-3 px-5 text-right font-mono-tabular text-slate-700">
                    {d.avgHours} hrs
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Civic Issue Prediction Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <TrendingUp className="w-5 h-5 text-blue-700 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Civic Issue Prediction &amp; Preventive Maintenance Forecast
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                AI analysis of ward complaint history to anticipate recurring infrastructure stress.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchPredictions}
            disabled={loadingPred}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingPred ? 'animate-spin' : ''}`} />
            <span>{loadingPred ? 'Forecasting...' : 'Refresh AI Forecast'}</span>
          </button>
        </div>

        {predictions && (
          <>
            <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-4">
              {predictions.executiveBrief}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {predictions.predictions.map((pred, idx) => (
                <div
                  key={`${pred.ward}-${idx}`}
                  className="border border-slate-200 rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-900">{pred.ward}</span>
                    <span
                      className={`font-semibold font-mono-tabular ${
                        pred.riskLevel === 'High'
                          ? 'text-red-700'
                          : pred.riskLevel === 'Elevated'
                            ? 'text-amber-700'
                            : 'text-blue-700'
                      }`}
                    >
                      {pred.riskLevel} Risk · {pred.likelihoodPercent}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {pred.category} · {pred.forecastWindow}
                  </p>
                  <p className="text-xs text-slate-700 leading-relaxed">{pred.rationale}</p>
                  <p className="text-xs text-blue-900 font-medium pt-1 border-t border-slate-100">
                    Recommended Action: {pred.recommendedAction}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
