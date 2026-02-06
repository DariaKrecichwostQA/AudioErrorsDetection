
import React from 'react';
import { Brain, Cpu, Activity, Zap, ShieldCheck, Microscope, Layers, GitBranch, Terminal } from 'lucide-react';

const ModelDocs: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-3xl z-[300] flex items-center justify-center p-4 md:p-8 overflow-hidden">
      <div className="bg-slate-900 border border-slate-800 rounded-[3rem] w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border-t-indigo-500 border-t-4 animate-in zoom-in duration-300">
        <div className="flex justify-between items-center p-8 border-b border-slate-800">
          <div>
            <h2 className="text-2xl font-black italic uppercase tracking-tighter flex items-center gap-3">
              <Microscope className="text-indigo-400" /> Dokumentacja Techniczna <span className="text-indigo-400">Silnika AI</span>
            </h2>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">Analiza Anomali Dźwiękowych v2.5 - Deep Neural Network</p>
          </div>
          <button onClick={onClose} className="bg-slate-800 hover:bg-indigo-600 p-3 rounded-full text-white transition-all">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-12 scrollbar-thin scrollbar-thumb-slate-800">
          {/* Section 1: Architecture */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-400">
              <Layers className="w-5 h-5" />
              <h3 className="text-lg font-black uppercase italic">1. Architektura: Deep Autoencoder</h3>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              System wykorzystuje architekturę **Autoenkodera (AE)** – specyficzny rodzaj sieci neuronowej uczonej w trybie nienadzorowanym. 
              Model składa się z dwóch głównych części:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
                <h4 className="text-indigo-300 font-bold text-xs uppercase mb-2">Enkoder (Kompresja)</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Redukuje wejściowy spektrogram (128 binów częstotliwości) do tzw. **Przestrzeni Ukrytej (Latent Space)** o wymiarze zdefiniowanym przez parametr `Latent Dim`. 
                  Wymusza to na sieci wyodrębnienie tylko najbardziej istotnych cech charakterystycznych dla normalnej pracy maszyny.
                </p>
              </div>
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800">
                <h4 className="text-emerald-300 font-bold text-xs uppercase mb-2">Dekoder (Rekonstrukcja)</h4>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Próbuje odtworzyć oryginalny sygnał na podstawie skompresowanej reprezentacji. Jeśli dźwięk jest zgodny z wzorcem, dekoder robi to z wysoką precyzją. 
                  Jeśli dźwięk jest anomalią, dekoder zawodzi, co generuje wysoki błąd rekonstrukcji.
                </p>
              </div>
            </div>
          </section>

          {/* Section 2: Signal Processing */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-400">
              <Activity className="w-5 h-5" />
              <h3 className="text-lg font-black uppercase italic">2. Przetwarzanie Sygnału (STFT)</h3>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              Dźwięk nie jest analizowany jako surowa fala (Time-Domain), lecz jako **Spektrogram (Frequency-Domain)**. 
              Wykorzystujemy Krótkoczasową Transformatę Fouriera (**STFT**):
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[11px] font-mono">
              <li className="bg-slate-800/30 p-3 rounded-xl border border-slate-800">FFT Size: 256</li>
              <li className="bg-slate-800/30 p-3 rounded-xl border border-slate-800">Window Size: 512</li>
              <li className="bg-slate-800/30 p-3 rounded-xl border border-slate-800">Hop Length: 512</li>
            </ul>
          </section>

          {/* Section 3: Detection Logic */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-400">
              <Terminal className="w-5 h-5" />
              <h3 className="text-lg font-black uppercase italic">3. Detekcja i Metryka Błędu (MSE)</h3>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              Podstawową metryką detekcji jest **Błąd Średniokwadratowy (MSE)** pomiędzy wejściem a wyjściem dekodera. 
              Formuła:
            </p>
            <div className="bg-black/40 p-6 rounded-2xl text-center font-mono text-indigo-300 border border-indigo-500/10">
              MSE = (1/n) * Σ (Oryginał - Rekonstrukcja)²
            </div>
            <p className="text-slate-500 text-xs italic">
              Im wyższy wynik MSE, tym mniejsze prawdopodobieństwo, że dźwięk należy do wyuczonej klasy "Normal".
            </p>
          </section>

          {/* Section 4: Adaptive Threshold */}
          <section className="space-y-4">
            <div className="flex items-center gap-3 text-indigo-400">
              <GitBranch className="w-5 h-5" />
              <h3 className="text-lg font-black uppercase italic">4. Adaptacyjny Próg: Reguła 3-Sigma</h3>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed">
              Zamiast sztywnego progu, AudioSentinel stosuje **Adaptację Widmową**. Po wczytaniu pliku system wylicza:
            </p>
            <div className="space-y-3">
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-indigo-600/20 flex items-center justify-center shrink-0 text-indigo-400 font-black text-xs">Σ</div>
                <div>
                  <h5 className="text-white text-xs font-bold uppercase">Statystyka Sigma</h5>
                  <p className="text-[11px] text-slate-500">Próg ustawiany jest jako: `Średnia + (Czułość * Odchylenie Standardowe)`. Pozwala to na automatyczne odcięcie szumu bazowego konkretnej maszyny.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-emerald-600/20 flex items-center justify-center shrink-0 text-emerald-400 font-black text-xs">⚡</div>
                <div>
                  <h5 className="text-white text-xs font-bold uppercase">Kompensacja Energii</h5>
                  <p className="text-[11px] text-slate-500">System analizuje całkowitą energię nagrania (RMS). Dla głośniejszych środowisk próg jest logarytmicznie podnoszony, zapobiegając fałszywym alarmom.</p>
                </div>
              </div>
            </div>
          </section>

          <div className="pt-8 border-t border-slate-800 flex justify-center">
             <button onClick={onClose} className="px-12 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-black uppercase shadow-xl shadow-indigo-600/20 transition-all">Rozumiem, powrót do panelu</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelDocs;
