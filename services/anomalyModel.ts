import * as tf from '@tensorflow/tfjs';

export interface ModelConfig {
  epochs: number;
  learningRate: number;
  batchSize: number;
  latentDim: number;
}

export interface TrainingSample {
  id: string;
  data: number[][];
  label: 'Normal' | 'Anomaly';
  timestamp: number;
  sampleRate: number;
}

interface ModelBundle {
  modelTopology: any;
  weightsData: string;
  weightSpecs: tf.io.WeightsManifestEntry[];
  metadata: {
    sampleRate: number;
    inputSize: number;
    trainedAt: string;
    baseThreshold: number;
    config: ModelConfig;
  };
}

export class AnomalyDetectorModel {
  private model: tf.LayersModel | null = null;
  private baseThreshold: number = 0.001;
  private sensitivity: number = 1.0;
  private isTraining: boolean = false;
  private trainingBuffer: TrainingSample[] = [];
  private currentSampleRate: number = 16000;
  
  private config: ModelConfig = {
    epochs: 100,
    learningRate: 0.0008,
    batchSize: 32,
    latentDim: 32
  };

  constructor(private inputSize: number = 128) {
    this.initModel();
  }

  public updateConfig(newConfig: Partial<ModelConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.initModel();
  }

  public getConfig() {
    return this.config;
  }

  private initModel() {
    if (this.model) this.model.dispose();
    const model = tf.sequential();
    // Encoder
    model.add(tf.layers.dense({ units: 128, activation: 'relu', inputShape: [this.inputSize] }));
    model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
    // Bottleneck
    model.add(tf.layers.dense({ units: this.config.latentDim, activation: 'relu' }));
    // Decoder
    model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 128, activation: 'relu' }));
    model.add(tf.layers.dense({ units: this.inputSize, activation: 'sigmoid' }));
    
    model.compile({ 
      optimizer: tf.train.adam(this.config.learningRate), 
      loss: 'meanSquaredError' 
    });
    this.model = model;
  }

  async saveModel() {
    if (!this.model) return;
    let bundle: ModelBundle | null = null;
    await this.model.save(tf.io.withSaveHandler(async (artifacts) => {
      const weightsData = artifacts.weightData ? this.arrayBufferToBase64(artifacts.weightData) : "";
      bundle = {
        modelTopology: artifacts.modelTopology,
        weightsData: weightsData,
        weightSpecs: artifacts.weightSpecs || [],
        metadata: {
          sampleRate: this.currentSampleRate,
          inputSize: this.inputSize,
          trainedAt: new Date().toISOString(),
          baseThreshold: this.baseThreshold,
          config: this.config
        }
      };
      return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } };
    }));

    if (bundle) {
      const blob = new Blob([JSON.stringify(bundle)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sentinel-model-custom.sentinel`;
      a.click();
    }
  }

  async loadModel(file: File) {
    try {
      const text = await file.text();
      const bundle: ModelBundle = JSON.parse(text);
      const weightsBuffer = this.base64ToArrayBuffer(bundle.weightsData);
      const artifacts: tf.io.ModelArtifacts = {
        modelTopology: bundle.modelTopology,
        weightData: weightsBuffer,
        weightSpecs: bundle.weightSpecs
      };
      const loadedModel = await tf.loadLayersModel(tf.io.fromMemory(artifacts));
      if (this.model) this.model.dispose();
      this.model = loadedModel;
      this.currentSampleRate = bundle.metadata.sampleRate;
      this.baseThreshold = bundle.metadata.baseThreshold;
      if (bundle.metadata.config) {
        this.config = bundle.metadata.config;
      }
      this.model.compile({ optimizer: tf.train.adam(this.config.learningRate), loss: 'meanSquaredError' });
      return { success: true, sampleRate: this.currentSampleRate };
    } catch (e) {
      return { success: false };
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer | ArrayBuffer[]): string {
    const uint8 = Array.isArray(buffer) 
      ? new Uint8Array(buffer.reduce((acc, b) => acc + b.byteLength, 0)) 
      : new Uint8Array(buffer);
    if (Array.isArray(buffer)) {
      let offset = 0;
      buffer.forEach(b => { uint8.set(new Uint8Array(b), offset); offset += b.byteLength; });
    }
    let binary = '';
    for (let i = 0; i < uint8.byteLength; i++) binary += String.fromCharCode(uint8[i]);
    return window.btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    return bytes.buffer;
  }

  addSampleToBuffer(id: string, data: number[][], label: 'Normal' | 'Anomaly', sampleRate: number) {
    this.currentSampleRate = sampleRate;
    this.trainingBuffer.push({ id, data, label, timestamp: Date.now(), sampleRate });
  }

  clearBuffer() {
    this.trainingBuffer = [];
  }

  async retrainAll(onEpochEnd?: (epoch: number, logs?: tf.Logs) => void): Promise<{message: string; status: 'success' | 'warning' | 'error'}> {
    if (!this.model || this.isTraining) return {message: "Model zajęty", status: 'error'};
    this.isTraining = true;

    try {
      const normalRows: number[][] = [];
      const anomalyRows: number[][] = [];
      
      for (const sample of this.trainingBuffer) {
        if (sample.label === 'Normal') {
          for (const row of sample.data) normalRows.push(row);
        } else {
          for (const row of sample.data) anomalyRows.push(row);
        }
      }

      if (normalRows.length === 0) {
        this.isTraining = false;
        return {message: "Brak danych wzorcowych (Normal). Wgraj poprawne nagrania.", status: 'error'};
      }

      const tensorNormal = tf.tidy(() => tf.tensor2d(normalRows).div(255));
      
      await this.model.fit(tensorNormal, tensorNormal, {
        epochs: this.config.epochs,
        batchSize: this.config.batchSize,
        shuffle: true,
        verbose: 0,
        callbacks: {
          onEpochEnd: (epoch: number, logs?: tf.Logs) => {
            // Fix: Explicitly typing epoch as number to fix line 204 errors
            if (onEpochEnd) onEpochEnd(epoch + 1, logs);
          }
        }
      });

      const normalErrors = tf.tidy(() => {
        const preds = this.model!.predict(tensorNormal) as tf.Tensor;
        // Fix: Added explicit casting to Float32Array to help with downstream type inference
        return tf.sub(tensorNormal, preds).square().mean(1).dataSync() as Float32Array;
      });
      
      // Fix: Explicitly typing sortedNormal as number[] and casting elements to number for arithmetic operations
      const sortedNormal: number[] = Array.from(normalErrors).sort((a, b) => a - b);
      const p99Normal = sortedNormal[Math.floor(sortedNormal.length * 0.99)] as number;
      this.baseThreshold = p99Normal * 1.05; // Margines bezpieczeństwa

      if (anomalyRows.length > 0) {
        const tensorAnomaly = tf.tidy(() => tf.tensor2d(anomalyRows).div(255));
        const anomalyErrors = tf.tidy(() => {
          const preds = this.model!.predict(tensorAnomaly) as tf.Tensor;
          // Fix: Added explicit casting to Float32Array
          return tf.sub(tensorAnomaly, preds).square().mean(1).dataSync() as Float32Array;
        });
        
        // Fix: Explicitly typing as number[] and casting elements to number
        const sortedAnomaly: number[] = Array.from(anomalyErrors).sort((a, b) => a - b);
        const p10Anomaly = sortedAnomaly[Math.floor(sortedAnomaly.length * 0.1)] as number;
        
        tensorAnomaly.dispose();

        if (p10Anomaly > p99Normal) {
          // Fix: p99Normal and p10Anomaly are now guaranteed to be numbers
          this.baseThreshold = (p99Normal + p10Anomaly) / 2;
          tensorNormal.dispose();
          return {
            message: "Sukces: Idealna separacja klas. Próg został skalibrowany automatycznie.",
            status: 'success'
          };
        } else {
          tensorNormal.dispose();
          return {
            message: "Uwaga: Wysoka czułość (mała różnica wzorzec-awaria). ZMNIEJSZ 'Latent Dim' w ustawieniach (np. na 8 lub 16) i spróbuj ponownie.",
            status: 'warning'
          };
        }
      }

      tensorNormal.dispose();
      return {message: "Sukces: Model zoptymalizowany pod kątem danych wzorcowych.", status: 'success'};
    } catch (e) {
      console.error(e);
      return {message: "Błąd krytyczny treningu (prawdopodobnie brak RAM).", status: 'error'};
    } finally {
      this.isTraining = false;
    }
  }

  async predict(input: number[]): Promise<{ score: number; isAnomaly: boolean }> {
    if (!this.model || this.isTraining) return { score: 0, isAnomaly: false };
    return tf.tidy(() => {
      const inputTensor = tf.tensor2d([input]).div(255);
      const prediction = this.model!.predict(inputTensor) as tf.Tensor;
      const score = tf.losses.meanSquaredError(inputTensor, prediction).dataSync()[0] * 10000;
      const thresholdVal = this.getThreshold();
      return { score, isAnomaly: score > thresholdVal };
    });
  }

  setSensitivity(val: number) { this.sensitivity = val; }
  getThreshold() { return this.baseThreshold * (1 / this.sensitivity) * 10000; }
  getSampleRate() { return this.currentSampleRate; }
}

export const detector = new AnomalyDetectorModel(128);
