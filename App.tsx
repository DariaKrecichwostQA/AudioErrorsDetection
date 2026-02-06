
import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Square, AlertTriangle, BrainCircuit, MicOff, Loader2, GraduationCap, 
  ShieldCheck, ShieldAlert, Upload, FileAudio, History, Download, Settings,
  Cpu, SlidersHorizontal, Activity, Save, Filter, Database, Search, Mic, Zap, Volume2, Pause, BarChart2, FileSearch, TrendingUp, Clock, Info, FolderOpen, Trash2, ListChecks, ChevronDown, ChevronRight, Terminal, X, Wand2, Sparkles, ZapOff, BookOpen
} from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import { Anomaly, AudioChartData } from './types';
import AnomalyChart from './components/AnomalyChart';
import ReportTable from './components/ReportTable';
import SpectralAnalysisChart from './components/SpectralAnalysisChart';
import ModelDocs from './components/ModelDocs';
import { detector, ModelConfig } from './services/anomalyModel';

interface FileQueueItem {
  file: File;
  label: 'Normal' | 'Anomaly';
  status: 'pending' | 'processing' | 'done' | 'error';
}

interface LogEntry {
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  time: string;
}

const App: React.FC = () => {
  const [mode, setMode] = useState<'IDLE' | 'TRAINING' | 'MONITORING' | 'FILE_ANALYSIS'>('IDLE');
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [chartData, setChartData] = useState<AudioChartData[]>([]);
  const [status, setStatus] = useState('System gotowy');
  const [showReport, setShowReport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [trainingQueue, setTrainingQueue] = useState<FileQueueItem[]>([]);
  const [batchProgress, setBatchProgress] = useState(0);
  const [currentScore, setCurrentScore] = useState(0);
  const [voiceShield, setVoiceShield] = useState(true);
  const [analyzedFileUrl, setAnalyzedFileUrl] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [currentSampleRate, setCurrentSampleRate] = useState(detector.getSampleRate());
  const [sensitivity, setSensitivity] = useState(2.0);
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showConsole, setShowConsole] = useState(true);
  const [collapseNormal, setCollapseNormal] = useState(false);
  const [collapseAnomaly, setCollapseAnomaly] = useState(false);

  const [nnConfig, setNnConfig] = useState<ModelConfig>(detector.getConfig());

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  const threshold = detector.getThreshold();

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  useEffect(() => {
    if (chartData.length > 0 && mode === 'IDLE') {
      recalculateAnomaliesFromChart(chartData);
    }
  }, [sensitivity]);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    setLogs(prev => [...prev.slice(-99), {
      message,
      type,
      time: new Date().toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' })
    }]);
  };

  const handleTimeUpdate = () => {
    if (mainAudioRef.current) {
      setCurrentTime(mainAudioRef.current.currentTime);
    }
  };

  const seekTo = (seconds: number) => {
    if (mainAudioRef.current) {
      mainAudioRef.current.currentTime = seconds;
      mainAudioRef.current.play().catch(() => {});
    }
  };

  const addToQueue = (files: FileList | null, label: 'Normal' | 'Anomaly') => {
    if (!files) return;
    const newItems: FileQueueItem[] = Array.from(files)
      .filter(f => f.type.startsWith('audio/'))
      .map(f => ({ file: f, label, status: 'pending' }));
    setTrainingQueue(prev => [...prev, ...newItems]);
    addLog(`Dodano ${newItems.length} plików do bazy ${label}`, 'info');
  };

  const clearQueue = (label?: 'Normal' | 'Anomaly') => {
    if (!label) setTrainingQueue([]);
    else setTrainingQueue(prev => prev.filter(item => item.label !== label));
    addLog(`Wyczyszczono listę plików`, 'warning');
  };

  const updateParam = (key: keyof ModelConfig, val: number) => {
    setNnConfig(prev => ({ ...prev, [key]: val }));
    detector.updateConfig({ [key]: val });
    addLog(`Parametr ${key} zmieniony na ${val}`, 'warning');
  };

  const updateSensitivity = (val: number) => {
    setSensitivity(val);
    detector.setSensitivity(val);
  };

  const autoCalibrate = (silent = false) => {
    if (chartData.length === 0) {
      if (!silent) addLog("Najpierw wczytaj i przeanalizuj plik!", "error");
      return;
    }
    const scores = chartData.map(d => d.anomalyLevel);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const stdDev = Math.sqrt(scores.map(s => Math.pow(s - mean, 2)).reduce((a, b) => a + b, 0) / scores.length);
    const avgAmp = chartData.reduce((s, d) => s + d.amplitude, 0) / chartData.length;
    const energyFactor = 1.0 + (avgAmp / 100); 
    const targetThreshold = (mean + (3.5 * stdDev)) * energyFactor;
    const currentBase = detector.getThreshold() / (1 / sensitivity);
    const newSensitivityValue = currentBase / targetThreshold;
    updateSensitivity(Math.min(10, Math.max(0.1, newSensitivityValue)));
    if (!silent) {
      addLog(`Auto-Dostosowanie: Wykryto poziom bazowy szumu: ${mean.toFixed(2)}`, "info");
      addLog(`Kompensacja energii: +${((energyFactor-1)*100).toFixed(0)}%`, "info");
      addLog(`Nowy próg bezpieczeństwa: ${targetThreshold.toFixed(2)}`, "success");
    }
  };

  const recalculateAnomaliesFromChart = (data: AudioChartData[]) => {
    const tempAnomalies: Anomaly[] = [];
    const currentThreshold = detector.getThreshold();
    const frameDurationSec = data.length > 1 ? (data[1].second || 0) - (data[0].second || 0) : 0.032;
    for (let i = 0; i < data.length; i++) {
      const score = data[i].anomalyLevel;
      const timestamp = data[i].second || 0;
      if (score > currentThreshold) {
        const lastAnom = tempAnomalies[0];
        if (!lastAnom || (timestamp - (lastAnom.offsetSeconds! + lastAnom.durationSeconds)) > 0.8) {
          tempAnomalies.unshift({
            id: `anom-${i}`,
            timestamp: new Date(),
            offsetSeconds: timestamp,
            durationSeconds: frameDurationSec,
            intensity: score / (currentThreshold || 1),
            severity: score > currentThreshold * 3 ? 'High' : score > currentThreshold * 1.8 ? 'Medium' : 'Low',
            description: `AWARIA`,
            type: 'Mechanical'
          });
        } else {
          lastAnom.durationSeconds = timestamp - lastAnom.offsetSeconds!;
          lastAnom.intensity = Math.max(lastAnom.intensity, score / (currentThreshold || 1));
        }
      }
    }
    setAnomalies(tempAnomalies.reverse());
  };

  const runBatchTraining = async () => {
    if (trainingQueue.length === 0) {
      addLog("Brak plików w bazie!", "error");
      return;
    }
    setMode('TRAINING');
    setLogs([]);
    addLog("--- ROZPOCZĘTO PROCES UCZENIA ---", "info");
    detector.clearBuffer();
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    for (let i = 0; i < trainingQueue.length; i++) {
      const item = trainingQueue[i];
      setBatchProgress(Math.round((i / trainingQueue.length) * 100));
      try {
        const arrayBuffer = await item.file.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        const channelData = audioBuffer.getChannelData(0);
        const frames = tf.tidy(() => {
          const audioTensor = tf.tensor1d(channelData);
          const spectrogram = tf.signal.stft(audioTensor, 256, 512);
          const magnitudes = tf.abs(spectrogram);
          const rawData = magnitudes.arraySync() as number[][];
          const maxFrames = 100;
          const stride = Math.max(1, Math.floor(rawData.length / maxFrames));
          const result: number[][] = [];
          for (let j = 0; j < rawData.length; j += stride) {
            if (result.length >= maxFrames) break;
            result.push(rawData[j].slice(0, 128).map(v => Math.min(255, v * 1800)));
          }
          return result;
        });
        detector.addSampleToBuffer(item.file.name, frames, item.label, audioBuffer.sampleRate);
        if (i % 20 === 0) addLog(`Przetwarzanie: ${i+1}/${trainingQueue.length}...`);
      } catch (err) {
        addLog(`Błąd: ${item.file.name}`, 'error');
      }
      if (i % 5 === 0) await tf.nextFrame();
    }
    addLog("Ekstrakcja zakończona. Optymalizacja sieci neuronowej...", "info");
    const result = await detector.retrainAll((epoch, logs) => {
      if (epoch % 10 === 0 || epoch === 1) {
        addLog(`Epoka ${epoch}/${nnConfig.epochs} - Loss: ${logs?.loss?.toFixed(8)}`, "info");
      }
    });
    addLog(result.message, result.status);
    setBatchProgress(100);
    setMode('IDLE');
    setCurrentSampleRate(detector.getSampleRate());
  };

  const analyzeSingleFile = async (file: File) => {
    try {
      setMode('FILE_ANALYSIS');
      addLog(`Skanowanie urządzenia: ${file.name}`);
      setChartData([]);
      setAnomalies([]);
      const fileUrl = URL.createObjectURL(file);
      setAnalyzedFileUrl(fileUrl);
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const frameStep = 512;
      const frameDurationSec = frameStep / audioBuffer.sampleRate;
      const rawSpectrogram = tf.tidy(() => {
        const audioTensor = tf.tensor1d(audioBuffer.getChannelData(0));
        const spectrogram = tf.signal.stft(audioTensor, 256, frameStep);
        return tf.abs(spectrogram).arraySync() as number[][];
      });
      const newChartData: AudioChartData[] = [];
      const buffer: number[] = [];
      for (let i = 0; i < rawSpectrogram.length; i++) {
        const frame = rawSpectrogram[i].slice(0, 128).map(v => Math.min(255, v * 1800));
        const { score } = await detector.predict(frame);
        const timestamp = i * frameDurationSec;
        buffer.push(score);
        if (buffer.length > 8) buffer.shift();
        const smoothed = buffer.reduce((a,b)=>a+b,0) / buffer.length;
        newChartData.push({
          time: `${timestamp.toFixed(1)}s`,
          amplitude: frame.reduce((a,b)=>a+b,0)/128/2.55,
          anomalyLevel: smoothed,
          second: timestamp
        });
        if (i % 300 === 0) {
          setBatchProgress(Math.round((i / rawSpectrogram.length) * 100));
          await tf.nextFrame();
        }
      }
      setChartData(newChartData);
      autoCalibrate(true); 
      addLog(`Skan zakończony. System dostosował próg do częstotliwości pracy tego urządzenia.`, "success");
      setMode('IDLE');
    } catch (err) {
      addLog("Błąd analizy pliku", "error");
      setMode('IDLE');
    }
  };

  const startLive = async () => {
    try {
      setMode('MONITORING');
      setChartData([]);
      addLog("Tryb Live aktywny", "success");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const analyzer = audioCtx.createAnalyser();
      analyzer.fftSize = 256;
      audioCtx.createMediaStreamSource(stream).connect(analyzer);
      const liveBuffer: number[] = [];
      const loop = async () => {
        if (mode !== 'MONITORING') return;
        const data = new Uint8Array(analyzer.frequencyBinCount);
        analyzer.getByteFrequencyData(data);
        const processed = Array.from(data).map((v, i) => (voiceShield && i > 8 && i < 40) ? v * 0.2 : v);
        const { score } = await detector.predict(processed);
        liveBuffer.push(score);
        if (liveBuffer.length > 5) liveBuffer.shift();
        const smoothed = liveBuffer.reduce((a,b)=>a+b,0) / liveBuffer.length;
        setCurrentScore(smoothed);
        setChartData(prev => [...prev.slice(-150), {
          time: new Date().toLocaleTimeString(),
          amplitude: data.reduce((a,b)=>a+b,0)/data.length/2.55,
          anomalyLevel: smoothed,
          second: Date.now()/1000
        }]);
        requestAnimationFrame(loop);
      };
      loop();
    } catch (err) {
      addLog("Mikrofon niedostępny", "error");
      setMode('IDLE');
    }
  };

  const normalQueue = trainingQueue.filter(q => q.label === 'Normal');
  const anomalyQueue = trainingQueue.filter(q => q.label === 'Anomaly');

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 p-4 lg:p-6 overflow-hidden font-sans">
      <header className="flex flex-col xl:flex-row items-center justify-between gap-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-3 rounded-2xl shadow-xl shadow-indigo-500/20">
            <BrainCircuit className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tighter italic uppercase leading-none">AUDIO<span className="text-indigo-400">SENTINEL</span></h1>
            <div className="flex items-center gap-2 mt-2">
                 <span className={`w-2.5 h-2.5 rounded-full ${mode !== 'IDLE' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}></span>
                 <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{status}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 bg-slate-900/60 p-3 rounded-[2rem] border border-slate-800 shadow-2xl backdrop-blur-xl">
           <button onClick={() => setShowDocs(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-xl border border-indigo-500/20 transition-all text-[10px] font-black uppercase">
             <BookOpen className="w-4 h-4" /> Dokumentacja Modelu
           </button>
           
           <div className="flex items-center gap-2 bg-slate-800/50 p-2 rounded-2xl border border-slate-700/50">
             <div className="flex flex-col gap-1">
                <button className="relative group bg-emerald-600/10 hover:bg-emerald-600 text-emerald-500 hover:text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 border border-emerald-500/30">
                  <FolderOpen className="w-4 h-4" /> Baza: Normal
                  <input type="file" multiple {...{ webkitdirectory: "", directory: "" } as any} className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => addToQueue(e.target.files, 'Normal')} />
                </button>
                <button className="relative group bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 border border-red-500/30">
                  <FolderOpen className="w-4 h-4" /> Baza: Awarie
                  <input type="file" multiple {...{ webkitdirectory: "", directory: "" } as any} className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => addToQueue(e.target.files, 'Anomaly')} />
                </button>
             </div>
             <button 
                disabled={trainingQueue.length === 0 || mode === 'TRAINING'} 
                onClick={runBatchTraining} 
                className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white p-4 rounded-2xl transition-all shadow-lg flex flex-col items-center justify-center gap-1 min-w-[100px]"
             >
                {mode === 'TRAINING' ? <Loader2 className="w-6 h-6 animate-spin" /> : <Zap className="w-6 h-6 fill-current" />}
                <span className="text-[9px] font-black uppercase">Ucz Model</span>
             </button>
           </div>

           <div className="w-px h-12 bg-slate-800 hidden xl:block"></div>

           <div className="flex items-center gap-3">
              <button className="relative bg-slate-800 hover:bg-slate-700 text-indigo-400 px-5 py-3 rounded-2xl text-[11px] font-black uppercase border border-slate-700 flex items-center gap-2">
                <FileSearch className="w-4 h-4" /> Analiza Pliku
                <input type="file" accept="audio/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => e.target.files?.[0] && analyzeSingleFile(e.target.files[0])} />
              </button>
              {mode !== 'MONITORING' ? (
                <button onClick={startLive} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-2xl text-[11px] font-black uppercase flex items-center gap-2 transition-all"><Mic className="w-4 h-4" /> Start Live</button>
              ) : (
                <button onClick={() => { mediaStreamRef.current?.getTracks().forEach(t=>t.stop()); setMode('IDLE'); }} className="bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-2xl text-[11px] font-black uppercase flex items-center gap-2 transition-all"><Square className="w-4 h-4" /> Stop</button>
              )}
           </div>

           <button onClick={() => setShowSettings(true)} className="p-4 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-2xl transition-all border border-slate-700">
             <Settings className="w-5 h-5" />
           </button>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-3 bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-6 flex flex-col shadow-2xl backdrop-blur-md min-h-0">
           <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4"><Database className="w-4 h-4 text-indigo-500" /> Biblioteka Projektu</h2>
           <div className="flex-1 overflow-hidden flex flex-col gap-3 min-h-0">
             <div className="flex-1 flex flex-col min-h-0">
                <button onClick={() => setCollapseNormal(!collapseNormal)} className="flex items-center justify-between w-full p-3 bg-slate-800/30 rounded-xl hover:bg-slate-800/50 transition-all border border-slate-800 shrink-0">
                  <div className="flex items-center gap-2">
                    {collapseNormal ? <ChevronRight className="w-4 h-4 text-emerald-500" /> : <ChevronDown className="w-4 h-4 text-emerald-500" />}
                    <span className="text-[10px] font-black uppercase text-emerald-400">Prawidłowe ({normalQueue.length})</span>
                  </div>
                  <X className="w-3 h-3 text-slate-600 hover:text-red-500" onClick={(e) => { e.stopPropagation(); clearQueue('Normal'); }} />
                </button>
                {!collapseNormal && (
                  <div className="flex-1 overflow-y-auto mt-2 space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-800 min-h-0" style={{ flexBasis: 0 }}>
                    {normalQueue.map((item, idx) => (
                      <div key={idx} className="bg-slate-950/30 border border-slate-800/50 p-2 rounded-lg flex items-center justify-between group">
                         <p className="text-[9px] font-medium truncate text-slate-400 uppercase max-w-[150px]">{item.file.name}</p>
                      </div>
                    ))}
                  </div>
                )}
             </div>
             <div className="flex-1 flex flex-col min-h-0">
                <button onClick={() => setCollapseAnomaly(!collapseAnomaly)} className="flex items-center justify-between w-full p-3 bg-slate-800/30 rounded-xl hover:bg-slate-800/50 transition-all border border-slate-800 shrink-0">
                  <div className="flex items-center gap-2">
                    {collapseAnomaly ? <ChevronRight className="w-4 h-4 text-red-500" /> : <ChevronDown className="w-4 h-4 text-red-500" />}
                    <span className="text-[10px] font-black uppercase text-red-400">Uszkodzone ({anomalyQueue.length})</span>
                  </div>
                  <X className="w-3 h-3 text-slate-600 hover:text-red-500" onClick={(e) => { e.stopPropagation(); clearQueue('Anomaly'); }} />
                </button>
                {!collapseAnomaly && (
                  <div className="flex-1 overflow-y-auto mt-2 space-y-1 pr-1 scrollbar-thin scrollbar-thumb-slate-800 min-h-0" style={{ flexBasis: 0 }}>
                    {anomalyQueue.map((item, idx) => (
                      <div key={idx} className="bg-slate-950/30 border border-slate-800/50 p-2 rounded-lg flex items-center justify-between group">
                         <p className="text-[9px] font-medium truncate text-slate-400 uppercase max-w-[150px]">{item.file.name}</p>
                      </div>
                    ))}
                  </div>
                )}
             </div>
           </div>
           <div className={`mt-4 border-t border-slate-800 pt-4 flex flex-col transition-all ${showConsole ? 'h-64' : 'h-10'}`}>
              <button onClick={() => setShowConsole(!showConsole)} className="flex items-center justify-between w-full text-[10px] font-black uppercase text-slate-500 hover:text-white mb-2 transition-all">
                 <div className="flex items-center gap-2"><Terminal className="w-3.5 h-3.5" /> Konsola Logów AI</div>
              </button>
              {showConsole && (
                <div ref={consoleRef} className="flex-1 bg-black/60 rounded-xl p-3 font-mono text-[9px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 space-y-1 shadow-inner">
                   {logs.map((log, i) => (
                     <div key={i} className={`flex gap-2 ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-emerald-400' : log.type === 'warning' ? 'text-amber-400' : 'text-indigo-300'}`}>
                        <span className="opacity-40">{log.time}</span>
                        <span className="font-bold">{log.message}</span>
                     </div>
                   ))}
                </div>
              )}
           </div>
        </div>

        <div className="lg:col-span-6 flex flex-col gap-6">
           <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl border-t-indigo-500/20">
                <p className="text-slate-500 text-[10px] uppercase font-black mb-1">Błąd Maszynowy</p>
                <span className={`text-2xl font-mono font-black ${currentScore > threshold ? 'text-red-500 animate-pulse' : 'text-indigo-400'}`}>
                   {currentScore.toFixed(1)}
                </span>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl border-t-indigo-500/20">
                <p className="text-slate-500 text-[10px] uppercase font-black mb-1">Próbkowanie</p>
                <p className="text-2xl font-black text-white">{currentSampleRate / 1000} kHz</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl border-t-indigo-500/20">
                <p className="text-slate-500 text-[10px] uppercase font-black mb-1">Incydenty</p>
                <p className="text-2xl font-black text-white">{anomalies.length}</p>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl border-t-indigo-500/20 text-center flex flex-col items-center justify-center relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-2 opacity-20 group-hover:opacity-100 transition-opacity">
                   <Sparkles className="w-3 h-3 text-indigo-400" />
                </div>
                <p className="text-slate-500 text-[10px] uppercase font-black mb-1">Próg (Sigma Adapt.)</p>
                <div className="flex flex-col items-center w-full">
                   <input type="range" min="0.5" max="12" step="0.1" value={sensitivity} onChange={(e) => updateSensitivity(parseFloat(e.target.value))} className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                   <span className="text-[10px] font-black text-indigo-400 mt-1">{sensitivity.toFixed(2)}σ</span>
                </div>
              </div>
           </div>
           <div className="flex-1 bg-slate-900/40 border border-slate-800/50 rounded-[3rem] p-8 flex flex-col min-h-0 relative shadow-2xl backdrop-blur-sm overflow-hidden">
             {analyzedFileUrl && (
                <div className="mb-6 bg-slate-950/80 p-4 rounded-3xl border border-slate-800 flex items-center gap-4 animate-in fade-in zoom-in duration-300">
                   <Volume2 className="text-indigo-400 w-5 h-5" />
                   <audio ref={mainAudioRef} src={analyzedFileUrl} controls onTimeUpdate={handleTimeUpdate} className="flex-1 h-8 rounded-lg" />
                   <button onClick={() => autoCalibrate()} title="Analizuj energię i dostosuj próg" className="p-3 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-2xl transition-all border border-indigo-500/30 flex items-center gap-2">
                     <Wand2 className="w-4 h-4" />
                     <span className="text-[10px] font-black uppercase">Adaptacja Widma</span>
                   </button>
                   <button onClick={() => setAnalyzedFileUrl(null)} className="p-3 hover:bg-red-500/20 text-slate-500 hover:text-red-500 rounded-2xl transition-all"><X className="w-5 h-5" /></button>
                </div>
             )}
             <AnomalyChart data={chartData} threshold={threshold} anomalies={anomalies} currentTime={currentTime} onPointClick={(p) => p.second !== undefined && seekTo(p.second)} />
           </div>
        </div>

        <div className="lg:col-span-3 bg-slate-900/40 border border-slate-800/50 rounded-[2.5rem] p-6 flex flex-col shadow-2xl backdrop-blur-md">
           <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-6"><History className="w-4 h-4 text-indigo-500" /> Ostatnie zdarzenia</h2>
           <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
              {anomalies.length === 0 && (
                <div className="flex flex-col items-center justify-center mt-12 opacity-30 text-center">
                   <Activity className="w-12 h-12 mb-2" />
                   <p className="text-[10px] font-bold uppercase tracking-widest">Czekam na skanowanie...</p>
                </div>
              )}
              {anomalies.map((a) => (
                <div key={a.id} className="p-4 rounded-3xl border border-slate-800 bg-slate-950/80 hover:border-indigo-500/30 transition-all group animate-in slide-in-from-right-4">
                   <div className="flex justify-between items-start mb-2">
                      <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase ${a.severity === 'High' ? 'bg-red-500 shadow-lg shadow-red-500/20' : a.severity === 'Medium' ? 'bg-amber-500' : 'bg-blue-500'} text-white`}>
                        {a.severity === 'High' ? 'AWARIA' : a.severity === 'Medium' ? 'ODCHYLENIE' : 'STABILNE'}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500">{a.offsetSeconds?.toFixed(2)}s</span>
                   </div>
                   <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase text-slate-300">Wskaźnik: {a.intensity.toFixed(1)}x</p>
                      <button onClick={() => seekTo(a.offsetSeconds || 0)} className="p-2 bg-indigo-600/10 text-indigo-400 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"><Play className="w-3.5 h-3.5" /></button>
                   </div>
                </div>
              ))}
           </div>
           <button onClick={() => setShowReport(true)} className="mt-6 w-full py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-3xl text-xs font-black uppercase shadow-xl shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all">
              <Download className="w-4 h-4" /> Eksportuj Raport
           </button>
        </div>
      </main>

      {showDocs && <ModelDocs onClose={() => setShowDocs(false)} />}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] w-full max-w-xl p-8 shadow-2xl border-t-indigo-500 border-t-4">
            <div className="flex justify-between items-center mb-8">
               <h2 className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-3"><SlidersHorizontal className="w-6 h-6 text-indigo-500" /> Konfiguracja AI</h2>
               <button onClick={() => setShowSettings(false)} className="text-slate-500 hover:text-white text-2xl transition-all">✕</button>
            </div>
            <div className="space-y-6">
               <div className="grid grid-cols-2 gap-6">
                 <div>
                   <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block tracking-widest flex items-center gap-1">Precyzja (Epochs)</label>
                   <input type="number" value={nnConfig.epochs} onChange={(e) => updateParam('epochs', parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl text-white font-mono text-sm focus:border-indigo-500 outline-none transition-all" />
                 </div>
                 <div className="group relative">
                   <label className="text-[10px] font-black uppercase text-indigo-400 mb-2 block tracking-widest flex items-center gap-1">Latent Dim (Złożoność)</label>
                   <input type="number" value={nnConfig.latentDim} onChange={(e) => updateParam('latentDim', parseInt(e.target.value))} className="w-full bg-indigo-950/30 border border-indigo-500/50 p-3 rounded-xl text-white font-mono text-sm focus:border-indigo-500 outline-none transition-all" />
                   <p className="text-[8px] text-slate-500 mt-1 uppercase font-bold">Wskazówka: Wartości 4-8 wymuszają na modelu agresywną kompresję - lepsze dla głośnych maszyn.</p>
                 </div>
                 <div>
                   <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block tracking-widest">Szybkość Uczenia</label>
                   <input type="number" step="0.0001" value={nnConfig.learningRate} onChange={(e) => updateParam('learningRate', parseFloat(e.target.value))} className="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl text-white font-mono text-sm" />
                 </div>
                 <div>
                   <label className="text-[10px] font-black uppercase text-slate-500 mb-2 block tracking-widest">Przetwarzanie (Batch)</label>
                   <select value={nnConfig.batchSize} onChange={(e) => updateParam('batchSize', parseInt(e.target.value))} className="w-full bg-slate-800 border border-slate-700 p-3 rounded-xl text-white font-mono text-sm">
                      {[16, 32, 64, 128].map(v => <option key={v} value={v}>{v}</option>)}
                   </select>
                 </div>
               </div>
               <div className="pt-6 border-t border-slate-800">
                  <div className="flex gap-4">
                    <button onClick={() => detector.saveModel()} className="flex-1 bg-slate-800 hover:bg-indigo-600 text-white p-4 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 border border-slate-700">Pobierz Wagi</button>
                    <button onClick={() => setShowSettings(false)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white p-4 rounded-xl text-[10px] font-black uppercase transition-all shadow-lg shadow-indigo-600/20">Zastosuj</button>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}
      {showReport && (
        <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-3xl z-[250] flex items-center justify-center p-6 md:p-12">
          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl p-10 overflow-hidden border-t-indigo-500 border-t-4 animate-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-10">
               <div>
                 <h2 className="text-3xl font-black italic uppercase tracking-tighter">Panel <span className="text-indigo-400">Diagnostyczny</span></h2>
                 <p className="text-xs text-slate-500 mt-1 uppercase font-bold tracking-widest">ID Raportu: {Math.random().toString(36).substr(2, 9).toUpperCase()} | {new Date().toLocaleString()}</p>
               </div>
               <button onClick={() => setShowReport(false)} className="bg-slate-800 hover:bg-red-500 p-4 rounded-full text-white transition-all">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800">
               <ReportTable anomalies={anomalies} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
