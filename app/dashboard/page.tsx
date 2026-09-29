'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

import type { Recommendation, RecommendationMode } from '@/src/lib/types';
import { MODE_WEIGHTS } from '@/src/lib/scoring';

type SearchPlayer = {
  id: string;
  providerSource: string;
  providerPlayerId: string;
  fullName: string;
  position?: string;
  team?: string;
};

type DashboardRecommendation = {
  target: { fullName: string };
  recommendations: Recommendation[];
  eligibleCandidateCount: number;
  marketValueCoveragePct: number | null;
};

type PipelineMetrics = {
  status: 'verified' | 'unverified' | 'late' | 'attention' | 'unavailable' | 'seed';
  checkedAt: string;
  latestRun: { status: string; logicalDate: string; startedAt: string; completedAt: string | null; errorCode: string | null } | null;
  latestAccepted: {
    logicalDate: string;
    completedAt: string | null;
    sourceReadAt: string;
    sourceCounts: { players: number; stats: number };
    martCounts: { facts: number; duplicate_keys: number; positive_facts: number } | null;
    metrics: { market_value_coverage_pct: number | null; positive_fact_pct: number | null } | null;
  } | null;
};

const statusText: Record<PipelineMetrics['status'], string> = {
  verified: 'Đã kiểm chứng',
  unverified: 'Nguồn mới hơn bản kiểm chứng',
  late: 'Lượt chạy hằng ngày bị trễ',
  attention: 'Lượt chạy mới nhất cần kiểm tra',
  unavailable: 'Chưa có bản kiểm chứng',
  seed: 'Dữ liệu mẫu, chưa kiểm chứng bởi pipeline',
};

function number(value: number | null | undefined, digits = 0): string {
  return typeof value === 'number' ? value.toLocaleString('vi-VN', { maximumFractionDigits: digits }) : 'Chưa có';
}

function time(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'UTC' }) + ' UTC' : 'Chưa có';
}

export default function DashboardPage() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchPlayer[]>([]);
  const [selected, setSelected] = useState<SearchPlayer | null>(null);
  const [role, setRole] = useState('RW');
  const [mode, setMode] = useState<RecommendationMode>('like_for_like');
  const [maxAge, setMaxAge] = useState('30');
  const [maxMarketValue, setMaxMarketValue] = useState('');
  const [minMinutes, setMinMinutes] = useState('900');
  const [result, setResult] = useState<DashboardRecommendation | null>(null);
  const [pipeline, setPipeline] = useState<PipelineMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/analytics/metrics', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload: PipelineMetrics) => { if (live) setPipeline(payload); })
      .catch(() => { if (live) setPipeline({ status: 'unavailable', checkedAt: new Date().toISOString(), latestRun: null, latestAccepted: null }); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (selected || query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/players/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((payload: { results?: SearchPlayer[] }) => setSuggestions(payload.results ?? []))
        .catch(() => { if (!controller.signal.aborted) setSuggestions([]); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, selected]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) { setError('Hãy chọn đúng cầu thủ từ danh sách tìm kiếm.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/dashboard/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPlayerName: selected.fullName,
          targetPlayerIdentity: { providerSource: selected.providerSource, providerPlayerId: selected.providerPlayerId },
          role, mode,
          maxAge: maxAge === '' ? null : Number(maxAge),
          maxMarketValueEur: maxMarketValue === '' ? null : Number(maxMarketValue),
          minMinutes: minMinutes === '' ? null : Number(minMinutes),
        }),
      });
      if (!response.ok) throw new Error('Không tải được danh sách ứng viên. Hãy thử lại.');
      const payload = await response.json() as DashboardRecommendation;
      try {
        const statusResponse = await fetch('/api/analytics/metrics', { cache: 'no-store' });
        setPipeline(await statusResponse.json() as PipelineMetrics);
      } catch {
        setPipeline({ status: 'unavailable', checkedAt: new Date().toISOString(), latestRun: null, latestAccepted: null });
      }
      setResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được dữ liệu.');
    } finally {
      setLoading(false);
    }
  };

  const leader = result?.recommendations[0];
  const snapshot = pipeline?.latestAccepted;
  const weights = MODE_WEIGHTS[mode];
  const metrics = [
    { name: 'Fit score dẫn đầu', value: leader ? number(leader.score, 1) : 'Chưa chọn', unit: '/100', definition: `Tổng = similarity × ${weights.similarity} + role fit × ${weights.roleFit} + output × ${weights.output} + affordability × ${weights.affordability} + age upside × ${weights.ageUpside}.`, scope: 'Ứng viên xếp #1 trong bộ lọc hiện tại', missing: 'Không có ứng viên: chưa có điểm' },
    { name: 'Similarity', value: leader ? number(leader.breakdown.similarity, 1) : 'Chưa chọn', unit: '/100', definition: 'Độ tương đồng vector chỉ số với cầu thủ mục tiêu; chỉ dùng chỉ số nâng cao khi cả hai có dữ liệu.', scope: 'Ứng viên #1', missing: 'xG/xA thiếu được loại khỏi vector chung' },
    { name: 'Role fit / output', value: leader ? `${number(leader.breakdown.roleFit, 1)} / ${number(leader.breakdown.output, 1)}` : 'Chưa chọn', unit: '/100', definition: 'Hai thành phần dùng mức đầu ra đã chuẩn hóa theo vai trò trong bộ chấm điểm hiện tại.', scope: 'Ứng viên #1', missing: 'Chỉ số nâng cao thiếu không được tự tạo' },
    { name: 'Affordability / age upside', value: leader ? `${number(leader.breakdown.affordability, 1)} / ${number(leader.breakdown.ageUpside, 1)}` : 'Chưa chọn', unit: '/100', definition: 'Điểm khả năng chi trả theo ngân sách đã nhập và điểm tiềm năng theo nhóm tuổi.', scope: 'Ứng viên #1', missing: 'Giá trị chuyển nhượng thiếu dùng quy tắc trung tính của scoring engine' },
    { name: 'Ứng viên hợp lệ', value: result ? number(result.eligibleCandidateCount) : 'Chưa chọn', unit: 'cầu thủ', definition: 'Số cầu thủ còn lại sau loại mục tiêu và áp dụng tuổi, giá trị, phút thi đấu, chế độ tìm kiếm; trước giới hạn top 10.', scope: 'Bộ lọc hiện tại', missing: '0 nếu không có ứng viên' },
    { name: 'Độ phủ giá trị chuyển nhượng', value: result ? number(result.marketValueCoveragePct, 1) : 'Chưa chọn', unit: '%', definition: 'Ứng viên hợp lệ có market value / tổng ứng viên hợp lệ × 100.', scope: 'Bộ lọc hiện tại', missing: 'Chưa có nếu mẫu số bằng 0' },
    { name: 'Fact có chỉ số thi đấu dương', value: number(snapshot?.metrics?.positive_fact_pct, 1), unit: '%', definition: 'Fact đã kiểm chứng có appearances > 0 và minutes > 0 / tổng fact × 100.', scope: 'Toàn bộ mart tại lần build được chấp nhận', missing: 'Chưa có nếu chưa build hoặc mẫu số bằng 0' },
    { name: 'Fact được kiểm chứng', value: number(snapshot?.martCounts?.facts), unit: 'dòng', definition: 'Số dòng fact_player_season; phải bằng số season-stat nguồn và không có player_season_id trùng.', scope: 'Toàn bộ mart tại lần build được chấp nhận', missing: 'Chưa có nếu chưa có build đạt' },
    { name: 'Trạng thái kiểm chứng', value: pipeline ? statusText[pipeline.status] : 'Đang kiểm tra', unit: 'trạng thái', definition: 'Đã kiểm chứng khi nguồn chưa đổi, lần build gần nhất đạt và ngày logic hiện tại có lượt thành công trước hạn 08:47 UTC.', scope: 'Toàn bộ dữ liệu tại thời điểm kiểm tra', missing: 'Không đọc được ledger: chưa có bản kiểm chứng' },
    { name: 'Thời điểm build đạt', value: time(snapshot?.completedAt), unit: 'UTC', definition: 'Thời điểm hoàn tất lượt dbt và kiểm tra chất lượng mới nhất được chấp nhận.', scope: 'Toàn bộ mart', missing: 'Chưa có nếu chưa từng có lượt đạt' },
  ];

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">QuickScout · Dashboard tuyển trạch</h1>
          <p className="mt-1 text-sm text-slate-600">Chọn mục tiêu, xem shortlist và kiểm tra độ tin cậy của dữ liệu.</p>
        </div>
        <Link href="/" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold">Mở ứng dụng chính</Link>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Trạng thái dữ liệu">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Trạng thái dữ liệu</h2>
          <strong className={`rounded-full px-3 py-1 text-sm ${pipeline?.status === 'verified' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>
            {pipeline ? statusText[pipeline.status] : 'Đang kiểm tra…'}
          </strong>
        </div>
        <p className="mt-3 text-sm text-slate-700">Bản build được chấp nhận: {time(snapshot?.completedAt)} · Nguồn đọc: {time(snapshot?.sourceReadAt)} · Ngày logic: {snapshot?.logicalDate ?? 'Chưa có'}</p>
        <p className="mt-1 text-sm text-slate-700">Lượt chạy gần nhất: {pipeline?.latestRun?.status ?? 'Chưa có'}{pipeline?.latestRun?.errorCode ? ` (${pipeline.latestRun.errorCode})` : ''} · Kiểm tra trạng thái: {time(pipeline?.checkedAt)}</p>
        <p className="mt-2 text-sm text-amber-900">Dữ liệu API-Football mùa 2024 hiện chưa chứng minh độ phủ đầy đủ Big Five. Hãy xem độ phủ và dấu thời gian trước khi dùng shortlist để ra quyết định.</p>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Tạo shortlist</h2>
        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="relative flex flex-col gap-1 text-sm font-medium">Cầu thủ mục tiêu
            <input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); setSuggestions([]); setResult(null); }} autoComplete="off" placeholder="Ví dụ: Mohamed Salah" className="rounded-lg border border-slate-300 px-3 py-2" />
            {suggestions.length > 0 && <ul className="absolute top-full z-10 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {suggestions.map((player) => <li key={player.id}><button type="button" className="w-full px-3 py-2 text-left hover:bg-indigo-50" onClick={() => { setSelected(player); setQuery(player.fullName); setRole(player.position ?? 'RW'); setSuggestions([]); }}>{player.fullName} · {player.team ?? player.providerSource}</button></li>)}
            </ul>}
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Vai trò<input value={role} onChange={(event) => { setRole(event.target.value); setResult(null); }} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Chế độ<select value={mode} onChange={(event) => { setMode(event.target.value as RecommendationMode); setResult(null); }} className="rounded-lg border border-slate-300 px-3 py-2"><option value="like_for_like">Tương đồng</option><option value="cheaper">Chi phí thấp hơn</option><option value="young_upside">Tiềm năng trẻ</option></select></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Tuổi tối đa<input type="number" min="15" value={maxAge} onChange={(event) => { setMaxAge(event.target.value); setResult(null); }} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Giá trị tối đa (EUR)<input type="number" min="0" value={maxMarketValue} onChange={(event) => { setMaxMarketValue(event.target.value); setResult(null); }} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
          <label className="flex flex-col gap-1 text-sm font-medium">Số phút tối thiểu<input type="number" min="0" value={minMinutes} onChange={(event) => { setMinMinutes(event.target.value); setResult(null); }} className="rounded-lg border border-slate-300 px-3 py-2" /></label>
          <button type="submit" disabled={loading} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50 sm:col-span-2 lg:col-span-3">{loading ? 'Đang tính…' : 'Xem ứng viên'}</button>
        </form>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {result && <div className="mt-5 overflow-x-auto"><h3 className="font-semibold">Top {result.recommendations.length} cho {result.target.fullName}</h3>{pipeline?.status !== 'verified' && <p role="status" className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-950">Shortlist này chưa có trạng thái kiểm chứng đạt tại thời điểm hiển thị. Chỉ dùng để khảo sát, chưa dùng làm quyết định tuyển dụng cuối cùng.</p>}<table className="mt-2 w-full min-w-[550px] text-left text-sm"><thead className="border-b bg-slate-50"><tr><th className="p-2">#</th><th className="p-2">Cầu thủ</th><th className="p-2">CLB</th><th className="p-2">Fit score</th><th className="p-2">Lý do</th></tr></thead><tbody>{result.recommendations.map((item, index) => <tr key={item.player.id} className="border-b"><td className="p-2">{index + 1}</td><td className="p-2 font-medium">{item.player.fullName}</td><td className="p-2">{item.player.team ?? 'Chưa có'}</td><td className="p-2">{number(item.score, 1)}</td><td className="p-2 text-slate-600">{item.reasons.slice(1, 3).join(' ')}</td></tr>)}</tbody></table>{result.recommendations.length === 0 && <p className="mt-2 text-sm">Không có ứng viên phù hợp bộ lọc.</p>}</div>}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Bảng metrics và định nghĩa</h2>
        <p className="mt-1 text-sm text-slate-600">Các chỉ số tuyển trạch tính từ bộ lọc hiện tại; các chỉ số fact lấy từ lần build đã được chấp nhận.</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="border-b bg-slate-50"><tr><th className="p-2">Metric</th><th className="p-2">Giá trị</th><th className="p-2">Đơn vị</th><th className="p-2">Định nghĩa</th><th className="p-2">Phạm vi</th><th className="p-2">Thiếu dữ liệu</th></tr></thead><tbody>{metrics.map((metric) => <tr key={metric.name} className="border-b align-top"><th className="p-2 font-semibold">{metric.name}</th><td className="p-2">{metric.value}</td><td className="p-2">{metric.unit}</td><td className="p-2">{metric.definition}</td><td className="p-2">{metric.scope}</td><td className="p-2">{metric.missing}</td></tr>)}</tbody></table></div>
      </section>
    </main>
  );
}
