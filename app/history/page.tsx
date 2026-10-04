'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { currentStreak, localDateKey, readHistory, recentDays, type PlankHistory } from '@/lib/squat-history';

export default function HistoryPage() {
  const [history, setHistory] = useState<PlankHistory>({});

  useEffect(() => {
    const frame = requestAnimationFrame(() => setHistory(readHistory()));
    return () => cancelAnimationFrame(frame);
  }, []);

  const chartData = useMemo(() => recentDays(history, 14), [history]);
  const weekTotal = chartData.slice(-7).reduce((sum, day) => sum + day.count, 0);
  const today = history[localDateKey()] ?? 0;
  const streak = currentStreak(history);
  const activeDays = [...chartData].reverse().filter((day) => day.count > 0);

  return (
    <main className="history-shell">
      <div className="history-page">
        <header className="history-header">
          <a href="/" className="back-link" aria-label="プランク画面に戻る">
            <ArrowLeft />
          </a>
          <div>
            <p>PLANK</p>
            <h1>プランク記録</h1>
          </div>
        </header>

        <section className="summary-grid" aria-label="記録の概要">
          <article className="summary-card summary-primary">
            <span>今日</span><strong>{today}</strong><small>秒</small>
          </article>
          <article className="summary-card">
            <span>直近7日</span><strong>{weekTotal}</strong><small>秒</small>
          </article>
          <article className="summary-card">
            <span>連続記録</span><strong>{streak}</strong><small>日</small>
          </article>
        </section>

        <section className="chart-card">
          <div className="section-heading">
            <div><p>ACTIVITY</p><h2>直近14日</h2></div>
            <span>秒数</span>
          </div>
          <div className="chart-wrap" aria-label="直近14日間の日別プランク秒数グラフ">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 0, bottom: 0, left: -28 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,.09)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#858b81', fontSize: 11 }} interval={1} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#858b81', fontSize: 11 }} />
                <Tooltip cursor={{ fill: 'rgba(119,231,194,.05)' }} contentStyle={{ background: '#1a1d19', border: '1px solid rgba(255,255,255,.12)', borderRadius: 12 }} labelStyle={{ color: '#a8ada4' }} itemStyle={{ color: '#77e7c2' }} formatter={(value) => [`${Number(value)} 秒`, 'プランク']} />
                <Bar dataKey="count" fill="#77e7c2" radius={[5, 5, 2, 2]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="log-card">
          <div className="section-heading"><div><p>DAILY LOG</p><h2>日別記録</h2></div></div>
          {activeDays.length ? (
            <ul className="daily-list">
              {activeDays.map((day) => (
                <li key={day.key}><span>{day.label}（{day.weekday}）</span><strong>{day.count}<small>秒</small></strong></li>
              ))}
            </ul>
          ) : <p className="empty-history">最初のプランクを記録すると、ここに表示されます。</p>}
        </section>

        <p className="storage-note">記録はこの端末のブラウザ内に保存されます。</p>
      </div>
    </main>
  );
}
