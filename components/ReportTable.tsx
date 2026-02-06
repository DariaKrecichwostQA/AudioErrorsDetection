
import React, { useState } from 'react';
import { Anomaly } from '../types';
import { AlertCircle, CheckCircle2, Clock, Volume2, ShieldAlert, ShieldCheck, Info, Activity } from 'lucide-react';
import SpectralAnalysisChart from './SpectralAnalysisChart';
import { detector } from '../services/anomalyModel';

interface ReportTableProps {
  anomalies: Anomaly[];
}

const ReportTable: React.FC<ReportTableProps> = ({ anomalies }) => {
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<string | null>(null);
  const totalAnomalies = anomalies.length;
  const currentSampleRate = detector.getSampleRate();

  const selectedAnomaly = anomalies.find(a => a.id === selectedAnomalyId);

  return (
    <div className="space-y-8 pb-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl">
          <div className="flex items-center gap-3 mb-2 text-slate-400">
            <AlertCircle className="text-red-500 w-5 h-5" />
            <span className="text-xs font-black uppercase tracking-widest">Liczba incydentów</span>
          </div>
          <span className="text-4xl font-black text-white">{totalAnomalies}</span>
        </div>
        <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl">
          <div className="flex items-center gap-3 mb-2 text-slate-400">
            <Clock className="text-indigo-500 w-5 h-5" />
            <span className="text-xs font-black uppercase tracking-widest">Suma trwania awarii</span>
          </div>
          <span className="text-4xl font-black text-white">
            {anomalies.reduce((s, a) => s + a.durationSeconds, 0).toFixed(2)}s
          </span>
        </div>
        <div className="bg-slate-950 border border-slate-800 p-6 rounded-2xl">
          <div className="flex items-center gap-3 mb-2 text-slate-400">
            <CheckCircle2 className="text-emerald-500 w-5 h-5" />
            <span className="text-xs font-black uppercase tracking-widest">Werdykt Diagnostyczny</span>
          </div>
          <span className={`text-xl font-black uppercase italic ${totalAnomalies > 5 ? 'text-red-500' : 'text-emerald-500'}`}>
            {totalAnomalies > 10 ? 'KRYTYCZNA' : totalAnomalies > 5 ? 'WYMAGA SERWISU' : 'OPTYMALNA'}
          </span>
        </div>
      </div>

      {selectedAnomaly && selectedAnomaly.spectralData && (
        <div className="bg-slate-950 border border-indigo-500/30 p-8 rounded-3xl animate-in fade-in slide-in-from-top-4 duration-500 shadow-2xl shadow-indigo-500/5">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="bg-indigo-600/20 p-3 rounded-2xl border border-indigo-500/20">
                <Activity className="w-6 h-6 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase italic tracking-tighter">Profil Widmowy Awarii ({currentSampleRate/1000}kHz)</h3>
                <p className="text-[10px] text-slate-500 font-mono">
                   Start: {selectedAnomaly.offsetSeconds?.toFixed(3)}s | Czas trwania: {selectedAnomaly.durationSeconds.toFixed(3)}s
                </p>
              </div>
            </div>
            <button 
              onClick={() => setSelectedAnomalyId(null)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 text-[10px] font-black uppercase rounded-xl transition-all border border-slate-800"
            >
              Zamknij
            </button>
          </div>
          <SpectralAnalysisChart spectralFrame={selectedAnomaly.spectralData[0]} sampleRate={currentSampleRate} />
        </div>
      )}

      <div className="bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/50 text-slate-500 border-b border-slate-800 text-[10px] font-black uppercase tracking-widest">
              <th className="py-6 px-6">Czas startu</th>
              <th className="py-6 px-6">Czas trwania</th>
              <th className="py-6 px-6">Przedział (Od - Do)</th>
              <th className="py-6 px-6">Poziom zagrożenia</th>
              <th className="py-6 px-6 text-right">Akcje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {anomalies.length === 0 ? (
              <tr><td colSpan={5} className="py-20 text-center text-slate-600 font-bold italic tracking-widest uppercase">Log diagnostyczny jest pusty</td></tr>
            ) : (
              anomalies.map((a) => (
                <tr 
                  key={a.id} 
                  className={`text-slate-300 transition-colors group ${selectedAnomalyId === a.id ? 'bg-indigo-500/10' : 'hover:bg-slate-800/20'}`}
                >
                  <td className="py-6 px-6 font-mono text-xs">
                    {a.offsetSeconds !== undefined ? (
                      <span className="text-indigo-400 font-bold">{a.offsetSeconds.toFixed(2)}s</span>
                    ) : (
                      a.timestamp.toLocaleTimeString()
                    )}
                  </td>
                  <td className="py-6 px-6 font-mono text-xs text-white font-bold">
                    {a.durationSeconds.toFixed(3)}s
                  </td>
                  <td className="py-6 px-6 font-mono text-[10px] text-slate-500">
                    {a.offsetSeconds?.toFixed(2)}s — {(a.offsetSeconds! + a.durationSeconds).toFixed(2)}s
                  </td>
                  <td className="py-6 px-6">
                    <div className="flex items-center gap-2">
                       {a.severity === 'High' ? <ShieldAlert className="w-4 h-4 text-red-500" /> : <Info className="w-4 h-4 text-amber-500" />}
                       <span className={`text-[10px] font-black uppercase ${a.severity === 'High' ? 'text-red-500' : 'text-amber-500'}`}>
                         {a.severity === 'High' ? 'KRYTYCZNA' : 'ODCHYLENIE'}
                       </span>
                    </div>
                  </td>
                  <td className="py-6 px-6 text-right">
                    <button 
                      onClick={() => setSelectedAnomalyId(a.id === selectedAnomalyId ? null : a.id)}
                      className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase border transition-all ${selectedAnomalyId === a.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-indigo-400 hover:border-indigo-500/50'}`}
                    >
                      Analiza
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportTable;
