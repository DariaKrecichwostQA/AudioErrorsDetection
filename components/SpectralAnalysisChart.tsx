
import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';

interface SpectralAnalysisChartProps {
  spectralFrame: number[];
  sampleRate?: number;
  title?: string;
}

const SpectralAnalysisChart: React.FC<SpectralAnalysisChartProps> = ({ spectralFrame, sampleRate = 16000, title }) => {
  // Rozdzielczość binów zależy od częstotliwości próbkowania (Rate / FFT Size)
  // W naszym modelu używamy FFT Size 256
  const binResolution = sampleRate / 256; 
  
  const chartData = spectralFrame.map((value, index) => ({
    frequency: Math.round(index * binResolution),
    amplitude: value,
    bin: index
  }));

  return (
    <div className="h-64 w-full bg-slate-950/50 rounded-2xl p-4 border border-slate-800 shadow-inner">
      {title && <h4 className="text-[10px] font-black uppercase text-indigo-400 mb-4 tracking-widest">{title}</h4>}
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
          <XAxis 
            dataKey="frequency" 
            stroke="#475569" 
            fontSize={9} 
            tickFormatter={(val) => val > 1000 ? `${(val/1000).toFixed(1)}kHz` : `${val}Hz`}
            interval={Math.floor(chartData.length / 8)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            stroke="#475569" 
            fontSize={9} 
            axisLine={false}
            tickLine={false}
            domain={[0, 255]}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px', border: '1px solid #334155' }}
            itemStyle={{ color: '#818cf8', fontSize: '10px', fontWeight: 'bold' }}
            labelStyle={{ color: '#fff', fontSize: '10px', marginBottom: '4px' }}
            labelFormatter={(label) => `Częstotliwość: ${label} Hz`}
            formatter={(value: any) => [value, "Amplituda"]}
            cursor={{ fill: '#1e293b', opacity: 0.4 }}
          />
          <Bar dataKey="amplitude" radius={[2, 2, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.amplitude > 150 ? '#ef4444' : entry.amplitude > 80 ? '#818cf8' : '#312e81'} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SpectralAnalysisChart;
