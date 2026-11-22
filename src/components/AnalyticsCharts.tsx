import React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { StudentAnalyticsData } from '../types/domain';

export const StudentTimelineChart: React.FC<{
  timeline: StudentAnalyticsData['timeline'];
}> = ({ timeline }) => {
  if (!timeline.length) return null;

  return (
    <div className="h-72 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={timeline} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id="goldAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.38} />
              <stop offset="95%" stopColor="#D4AF37" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
          <XAxis
            dataKey="examTitle"
            tick={{ fill: '#94A3B8', fontSize: 11 }}
            stroke="rgba(148,163,184,0.2)"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#94A3B8', fontSize: 11 }}
            stroke="rgba(148,163,184,0.2)"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0B1120',
              borderColor: 'rgba(212,175,55,0.4)',
              borderRadius: '10px',
              color: '#F8FAFC',
              direction: 'rtl',
            }}
            formatter={(val: unknown) => [`${val}%`, 'النسبة المئوية']}
          />
          <Area
            type="monotone"
            dataKey="percentage"
            stroke="#D4AF37"
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#goldAreaGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export const AccuracyPieChart: React.FC<{
  totalCorrect: number;
  totalWrong: number;
}> = ({ totalCorrect, totalWrong }) => {
  const data = [
    { name: 'إجابات صحيحة', value: totalCorrect, color: '#D4AF37' },
    { name: 'إجابات خاطئة', value: totalWrong, color: '#334155' },
  ];

  if (totalCorrect === 0 && totalWrong === 0) return null;

  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={56}
            outerRadius={86}
            paddingAngle={3}
          >
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#0B1120',
              borderColor: 'rgba(212,175,55,0.4)',
              borderRadius: '10px',
              color: '#F8FAFC',
              direction: 'rtl',
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export const GradeComparisonBarChart: React.FC<{
  rows: Array<{ gradeName: string; avgPercentage: number; studentsCount: number }>;
}> = ({ rows }) => {
  if (!rows.length) return null;
  return (
    <div className="h-72 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
          <XAxis
            dataKey="gradeName"
            tick={{ fill: '#94A3B8', fontSize: 11 }}
            stroke="rgba(148,163,184,0.2)"
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#94A3B8', fontSize: 11 }}
            stroke="rgba(148,163,184,0.2)"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#0B1120',
              borderColor: 'rgba(212,175,55,0.4)',
              borderRadius: '10px',
              color: '#F8FAFC',
              direction: 'rtl',
            }}
            formatter={(val: unknown) => [`${val}%`, 'متوسط النسبة']}
          />
          <Bar dataKey="avgPercentage" fill="#D4AF37" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
