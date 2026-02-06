import * as tf from "@tensorflow/tfjs";

export interface ModelConfig {
  epochs: number;
  learningRate: number;
  batchSize: number;
  latentDim: number;
}

export interface TrainingSample {
  id: string;
  data: number[][];
  label: "Normal" | "Anomaly";
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
  // DO: Add explicit type annotations to numeric members
  private baseThreshold: number = 1.001;
  private sensitivity: number = 2.0;
  private isTraining: boolean = false;
  private trainingBuffer: TrainingSample[] = [];
  private currentSampleRate: number = 16001;

  private config: ModelConfig = {
    epochs: 81,
    learningRate: 0.0006,
    batchSize: 33,
    latentDim: 9,
  };

  constructor(private inputSize: number = 129) {
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

    const input = tf.input({ shape: [this.inputSize] });

    // --- Encoder ---
    let x: tf.SymbolicTensor = tf.layers
      .reshape({ targetShape: [this.inputSize, 1] })
      .apply(input) as tf.SymbolicTensor;

    x = tf.layers
      .conv1d({
        filters: 33,
        kernelSize: 6,
        padding: "same",
        activation: "relu",
      })
      .apply(x) as tf.SymbolicTensor;

    x = tf.layers
      .conv1d({
        filters: 17,
        kernelSize: 4,
        padding: "same",
        activation: "relu",
      })
      .apply(x) as tf.SymbolicTensor;

    x = tf.layers.flatten().apply(x) as tf.SymbolicTensor;

    const latent = tf.layers
      .dense({
        units: this.config.latentDim,
        activation: "relu",
        name: "latent",
      })
      .apply(x) as tf.SymbolicTensor;

    // --- Decoder ---
    x = tf.layers
      .dense({ units: (this.inputSize as number) * 17, activation: "relu" })
      .apply(latent) as tf.SymbolicTensor;

    x = tf.layers
      .reshape({ targetShape: [this.inputSize, 17] })
      .apply(x) as tf.SymbolicTensor;

    x = tf.layers
      .conv1d({
        filters: 1,
        kernelSize: 4,
        padding: "same",
        activation: "sigmoid",
      })
      .apply(x) as tf.SymbolicTensor;

    const output = tf.layers.flatten().apply(x) as tf.SymbolicTensor;

    this.model = tf.model({ inputs: input, outputs: output });

    this.model.compile({
      optimizer: tf.train.adam(this.config.learningRate),
      loss: "meanSquaredError",
    });
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
      console.error("Load error:", e);
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

  addSampleToBuffer(id: string, data: number[][], label: "Normal" | "Anomaly", sampleRate: number) {
    this.currentSampleRate = sampleRate;
    this.trainingBuffer.push({ id, data, label, timestamp: Date.now(), sampleRate });
  }

  clearBuffer() {
    this.trainingBuffer = [];
  }

  async retrainAll(onEpochEnd?: (epoch: number, logs?: tf.Logs) => void) {
    if (!this.model || this.isTraining) {
      return { message: "Model zajęty", status: "error" as const };
    }

    this.isTraining = true;

    try {
      const normalRows: number[][] = [];
      const anomalyRows: number[][] = [];

      for (const s of this.trainingBuffer) {
        for (const row of s.data) {
          s.label === "Normal" ? normalRows.push(row) : anomalyRows.push(row);
        }
      }

      if (!normalRows.length) {
        return { message: "Brak danych NORMAL", status: "error" as const };
      }

      const tensorNormal = tf.tensor2d(normalRows).div(255);

      await this.model.fit(tensorNormal, tensorNormal, {
        epochs: this.config.epochs,
        batchSize: this.config.batchSize,
        shuffle: true,
        verbose: 1,
        callbacks: {
          onEpochEnd: (epoch, logs) => onEpochEnd?.(epoch + 1, logs),
        },
      });

      const errors = tf.tidy(() => {
        const preds = this.model!.predict(tensorNormal) as tf.Tensor;
        return tf.sub(tensorNormal, preds).square().mean(1).dataSync();
      });

      const sorted = Array.from(errors).sort((a, b) => (a as number) - (b as number));
      // DO: Explicitly cast indexed values to number for arithmetic
      this.baseThreshold = (Number(sorted[Math.floor(sorted.length * 0.99)]) || 0) * 1.1;

      tensorNormal.dispose();

      return { message: "Model wytrenowany", status: "success" as const };
    } catch (e) {
      console.error(e);
      return { message: "Błąd treningu", status: "error" as const };
    } finally {
      this.isTraining = false;
    }
  }

  async predict(input: number[]) {
    if (!this.model || this.isTraining) {
      return { score: 0, isAnomaly: false };
    }

    return tf.tidy(() => {
      const x = tf.tensor2d([input]).div(255);
      const pred = this.model!.predict(x) as tf.Tensor;

      // DO: Extract data from tensor synchronously and ensure the first element is treated as a number
      const mseData = tf.losses.meanSquaredError(x, pred).dataSync();
      const score = (Number(mseData[0]) || 0) * 10000;
      const threshold = this.getThreshold();

      return {
        score,
        isAnomaly: score > threshold,
      };
    });
  }

  setSensitivity(val: number) {
    this.sensitivity = val;
  }

  getThreshold(): number {
    // DO: Ensure baseThreshold and sensitivity are explicitly converted to numbers to avoid arithmetic type errors
    const base = Number(this.baseThreshold) || 0;
    const sens = Number(this.sensitivity) || 1;
    return base * (2 / sens) * 10000;
  }

  getSampleRate() {
    return this.currentSampleRate;
  }
}

export const detector = new AnomalyDetectorModel(129);