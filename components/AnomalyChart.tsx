
import React from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea 
} from 'recharts';
import { AudioChartData, Anomaly } from '../types';

interface AnomalyChartProps {
  data: AudioChartData[];
  threshold: number;
  anomalies?: Anomaly[];
  currentTime?: number;
  onPointClick?: (point: AudioChartData) => void;
}

const AnomalyChart: React.FC<AnomalyChartProps> = ({ data, threshold, anomalies = [], currentTime, onPointClick }) => {
  const safeData = data.filter(d => d.second !== undefined && !isNaN(d.anomalyLevel));
  const displayData = safeData.length > 800 ? safeData.filter((_, i) => i % Math.ceil(safeData.length / 800) === 0) : safeData;
  
  // Fix: added default value 0 for map to avoid Math.max crash on empty array
  const scores = displayData.map(d => d.anomalyLevel);
  const maxDataScore = scores.length > 0 ? Math.max(...scores) : 0;
  const maxVal = Math.max(maxDataScore, threshold * 1.5, 10);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart 
        data={displayData} 
        margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
        onClick={(e: any) => {
          if (e && e.activeLabel !== undefined && onPointClick) {
            onPointClick({ second: parseFloat(e.activeLabel) } as AudioChartData);
          }
        }}
      >
        <defs>
          <linearGradient id="colorAnom" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
        
        <XAxis 
          dataKey="second" 
          type="number"
          domain={['auto', 'auto']}
          stroke="#475569" 
          fontSize={10} 
          tickFormatter={(val) => `${val.toFixed(1)}s`}
          tickLine={false}
          axisLine={false}
        />
        
        <YAxis 
          stroke="#475569" 
          fontSize={10} 
          tickLine={false}
          axisLine={false}
          domain={[0, Math.ceil(maxVal * 1.1)]} 
        />
        
        <Tooltip 
          contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', color: '#fff' }}
          itemStyle={{ color: '#ef4444' }}
          labelFormatter={(val) => `Czas: ${Number(val).toFixed(2)}s`}
          formatter={(value: any) => [Number(value).toFixed(2), "Indeks Anomalii"]}
        />
        
        {anomalies.map((anom, idx) => (
          anom.offsetSeconds !== undefined && (
            <ReferenceArea 
              key={`anom-area-${idx}`}
              x1={anom.offsetSeconds}
              x2={anom.offsetSeconds + (anom.durationSeconds || 0.1)}
              fill="#ef4444"
              fillOpacity={0.2}
              stroke="none"
            />
          )
        ))}

        <ReferenceLine 
          y={threshold} 
          stroke="#ef4444" 
          strokeDasharray="5 5" 
          label={{ position: 'right', value: `PROG`, fill: '#ef4444', fontSize: 9, fontWeight: '900' }} 
        />

        <Area
          type="monotone"
          dataKey="anomalyLevel"
          stroke="#ef4444"
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorAnom)"
          isAnimationActive={false}
        />

        {currentTime !== undefined && (
          <ReferenceLine 
            x={currentTime} 
            stroke="#818cf8" 
            strokeWidth={2}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default AnomalyChart;
