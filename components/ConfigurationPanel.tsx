
import React, { useState } from 'react';
import { Plus, Trash2, Play, Settings, ChevronDown, ChevronRight, Copy, Check, Terminal } from 'lucide-react';

export interface TestStep {
  id: string;
  c: number;
  n: number;
  data: string; // JSON string
}

interface ConfigurationPanelProps {
  steps: TestStep[];
  setSteps: React.Dispatch<React.SetStateAction<TestStep[]>>;
  onRun: () => void;
  isRunning: boolean;
  targetAddress: string;
  setTargetAddress: (addr: string) => void;
  serviceMethod: string;
  selectedService: string;
  selectedMethod: string;
  metadata: string;
  setMetadata: (metadata: string) => void;
  metadataEnabled: boolean;
  setMetadataEnabled: (enabled: boolean) => void;
  hasValidProto: boolean;
  protoContent: string;
}

const HOST_PRESETS = [
  { label: 'host.docker.internal', value: 'host.docker.internal' },
  { label: '127.0.0.1', value: '127.0.0.1' },
];

// Helper to generate a beautified ghz CLI script
function buildGhzScript(
  step: TestStep,
  targetAddress: string,
  selectedService: string,
  selectedMethod: string,
  metadata: string,
  metadataEnabled: boolean,
): string {
  const lines: string[] = [];

  lines.push('ghz \\');
  lines.push('--insecure \\');

  // Call target
  if (selectedService && selectedMethod) {
    lines.push(`--call ${selectedService}.${selectedMethod} \\`);
  }

  // Metadata (pretty-printed)
  if (metadataEnabled && metadata) {
    try {
      const parsed = JSON.parse(metadata);
      const pretty = JSON.stringify(parsed, null, 2);
      lines.push(`-m '${pretty}' \\`);
    } catch {
      // skip invalid metadata
    }
  }

  // Data (pretty-printed)
  try {
    const parsed = JSON.parse(step.data);
    const pretty = JSON.stringify(parsed, null, 2);
    lines.push(`-d '${pretty}' \\`);
  } catch {
    lines.push(`-d '${step.data}' \\`);
  }

  // Concurrency & total
  lines.push(`-c ${step.c} \\`);
  lines.push(`-n ${step.n} \\`);

  // Target address
  lines.push(targetAddress);

  return lines.join('\n');
}

export const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({
  steps, setSteps, onRun, isRunning, targetAddress, setTargetAddress, serviceMethod,
  selectedService, selectedMethod, metadata, setMetadata, metadataEnabled, setMetadataEnabled, hasValidProto, protoContent
}) => {

  // Split targetAddress into host and port
  const colonIdx = targetAddress.lastIndexOf(':');
  const currentHost = colonIdx > 0 ? targetAddress.substring(0, colonIdx) : targetAddress;
  const currentPort = colonIdx > 0 ? targetAddress.substring(colonIdx + 1) : '';

  const [isCustomHost, setIsCustomHost] = useState(
    !HOST_PRESETS.some(p => p.value === currentHost)
  );

  // Track script box expanded state
  const [scriptExpanded, setScriptExpanded] = useState(false);
  // Track copy success state
  const [copied, setCopied] = useState(false);

  const copyScript = async (script: string) => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = script;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const updateAddress = (host: string, port: string) => {
    setTargetAddress(port ? `${host}:${port}` : host);
  };

  const addStep = () => {
    setSteps([...steps, { id: crypto.randomUUID(), c: 10, n: 100, data: '{}' }]);
  };

  const removeStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id));
  };

  const updateStep = (id: string, field: keyof TestStep, value: any) => {
    setSteps(steps.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  // Build the combined script from the first step (primary use case)
  const mainStep = steps[0];
  const ghzScript = mainStep
    ? buildGhzScript(mainStep, targetAddress, selectedService, selectedMethod, metadata, metadataEnabled)
    : '';

  return (
    <div className="bg-gray-800/50 backdrop-blur-md rounded-xl p-6 border border-gray-700 shadow-xl">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-purple-400" /> Configuration
        </h2>
        <div className="flex items-center gap-1">
          {isCustomHost ? (
            <input
              type="text"
              value={currentHost}
              onChange={(e) => updateAddress(e.target.value, currentPort)}
              placeholder="hostname / IP"
              className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none w-44"
            />
          ) : (
            <select
              value={currentHost}
              onChange={(e) => updateAddress(e.target.value, currentPort)}
              className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none"
            >
              {HOST_PRESETS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => {
              setIsCustomHost(!isCustomHost);
              if (isCustomHost) {
                updateAddress(HOST_PRESETS[0].value, currentPort);
              } else {
                updateAddress('', currentPort);
              }
            }}
            className="text-xs text-purple-400 hover:text-purple-300 whitespace-nowrap"
            title={isCustomHost ? 'Use preset' : 'Custom host'}
          >
            {isCustomHost ? '▼' : '✎'}
          </button>
          <span className="text-gray-400 text-sm">:</span>
          <input
            type="text"
            value={currentPort}
            onChange={(e) => updateAddress(currentHost, e.target.value)}
            placeholder="port"
            className="bg-gray-900 border border-gray-600 rounded-lg px-2 py-1 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none w-13"
          />
        </div>
      </div>

      {/* Full GHZ Script Section (collapsible, above metadata) */}
      {steps.length > 0 && (
        <div className="mb-6 bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
          <button
            onClick={() => setScriptExpanded(!scriptExpanded)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-green-400" />
              <span className="text-sm font-semibold text-white">Full GHZ Script</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{scriptExpanded ? 'collapse' : 'expand'}</span>
              {scriptExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
              )}
            </div>
          </button>

          {scriptExpanded && (
            <div className="px-4 pb-4">
              {steps.map((step, index) => {
                const script = buildGhzScript(step, targetAddress, selectedService, selectedMethod, metadata, metadataEnabled);
                return (
                  <div key={step.id} className="relative">
                    {steps.length > 1 && (
                      <div className="text-xs text-gray-500 mb-2 font-medium">Step {index + 1}</div>
                    )}
                    <button
                      onClick={() => copyScript(script)}
                      className={`absolute top-2 right-2 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all z-10 ${copied
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-gray-700/80 text-gray-300 hover:bg-gray-600 hover:text-white border border-gray-600'
                        }`}
                      title={copied ? 'Copied!' : 'Copy script'}
                    >
                      {copied ? (
                        <><Check className="w-3.5 h-3.5" /> Copied!</>
                      ) : (
                        <><Copy className="w-3.5 h-3.5" /> Copy</>
                      )}
                    </button>
                    <pre className="bg-gray-950/90 border border-gray-600/40 rounded-xl p-5 pr-24 text-sm font-mono text-green-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                      {script}
                    </pre>
                    {index < steps.length - 1 && <div className="my-3 border-t border-gray-700/50" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Metadata Section */}
      <div className="mb-6 bg-gray-900/50 p-4 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs text-gray-400">Metadata (-m)</label>
          <label className={`flex items-center gap-2 ${hasValidProto ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
            <span className="text-xs text-gray-400">{!hasValidProto ? 'No Proto' : metadataEnabled ? 'On' : 'Off'}</span>
            <input
              type="checkbox"
              checked={metadataEnabled}
              onChange={(e) => setMetadataEnabled(e.target.checked)}
              disabled={!hasValidProto}
              className="w-4 h-4 accent-purple-500 cursor-pointer disabled:cursor-not-allowed"
            />
          </label>
        </div>
        {metadataEnabled && hasValidProto && (
          <textarea
            value={metadata}
            onChange={(e) => setMetadata(e.target.value)}
            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs font-mono h-54"
            placeholder='{"key": "value"}'
          />
        )}
      </div>

      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={step.id} className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 relative group">
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => removeStep(step.id)} className="text-red-400 hover:text-red-300">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Concurrency (-c)</label>
                <input
                  type="number"
                  value={step.c}
                  onChange={(e) => updateStep(step.id, 'c', parseInt(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Total Requests (-n)</label>
                <input
                  type="number"
                  value={step.n}
                  onChange={(e) => updateStep(step.id, 'n', parseInt(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs text-gray-400 mb-1">Request Data (JSON)</label>
                <textarea
                  value={step.data}
                  onChange={(e) => updateStep(step.id, 'data', e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs font-mono min-h-16 resize-none overflow-hidden"
                  placeholder='{"key": "value"}'
                  style={{ height: `${Math.max(64, (step.data.split('\n').length + 1) * 16)}px` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-4">
        <button
          onClick={addStep}
          className="flex-1 py-2 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Step
        </button>

        <button
          onClick={onRun}
          disabled={isRunning || !selectedService || !selectedMethod || steps.length === 0}
          className={`flex-1 py-2 rounded-lg font-bold text-white flex items-center justify-center gap-2 transition-all
                ${isRunning || !selectedService || !selectedMethod || steps.length === 0
              ? 'bg-gray-600 cursor-not-allowed'
              : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 shadow-lg hover:shadow-green-500/20'
            }`}
        >
          {isRunning ? (
            <span className="animate-pulse">Running...</span>
          ) : (
            <> <Play className="w-4 h-4" /> Run Load Test </>
          )}
        </button>
      </div>
    </div>
  );
};

