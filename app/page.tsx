
'use client';

import React, { useState, useEffect } from 'react';
import { parseProtoContent, ServiceDefinition } from './lib/protoParser';
import { ConfigurationPanel, TestStep } from '../components/ConfigurationPanel';
import { ResultsDisplay } from '../components/ResultsDisplay';
import { Upload, FileCode, Server } from 'lucide-react';

export default function Home() {
  const [protoContent, setProtoContent] = useState('');
  const [services, setServices] = useState<ServiceDefinition[]>([]);
  const [messageDefaults, setMessageDefaults] = useState<Record<string, any>>({});
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedMethod, setSelectedMethod] = useState<string>('');

  const [targetAddress, setTargetAddress] = useState('127.0.0.1:8081');
  const [metadataEnabled, setMetadataEnabled] = useState(true);
  const [metadata, setMetadata] = useState(JSON.stringify({
    "clientname": "bloomrpc",
    "frontendip": "192.168.137.190",
    "clientip": "127.0.0.1",
    "activityid": "0360e017-7c6b-40bc-8408-d17873a0d58e",
    "uuid": "ab7c2a8d-c629-4cf9-82a9-d6cd93294df3",
    "branchcode": "0206",
    "userid": "0206260",
    "userlevelid": "51",
    "x-app-version": "s3.16.0-stable",
    "x-gateway-secret": "123",
    "x-trace-id": "c629-4cf9-82a9-40bc-7c6b-0360e017",
  }, null, 2));
  const [steps, setSteps] = useState<TestStep[]>([
    { id: '1', c: 10, n: 100, data: '{}' }
  ]);

  const [results, setResults] = useState<any[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number | null>(null);

  // Auto-parse proto content (debounced)
  useEffect(() => {
    if (!protoContent) {
      setServices([]);
      setMessageDefaults({});
      setSelectedService('');
      setSelectedMethod('');
      return;
    }

    const timer = setTimeout(() => {
      try {
        const { services, messageDefaults } = parseProtoContent(protoContent);
        setServices(services);
        setMessageDefaults(messageDefaults);
        if (services.length > 0) {
          setSelectedService(services[0].name);
          if (services[0].methods.length > 0) {
            setSelectedMethod(services[0].methods[0].name);
          }
        }
      } catch {
        // Invalid proto content - silently ignore while user is still typing
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [protoContent]);

  // Update steps with default data when method changes
  useEffect(() => {
    if (selectedService && selectedMethod) {
      const service = services.find(s => s.name === selectedService);
      const method = service?.methods.find(m => m.name === selectedMethod);

      if (method && method.requestType) {
        // resolve potentially nested name? 
        // Our parser returns simple names in messageDefaults usually, or full path if implemented fully.
        // For now, let's try to find key endings or exact match

        // Try exact match first
        let defaults = messageDefaults[method.requestType];

        // If not found, try to find by suffix (e.g. method says "MyRequest", defaults has "package.MyRequest")
        if (!defaults) {
          const parts = method.requestType.split('.');
          const simpleName = parts[parts.length - 1];
          // finding key that ends with .SimpleName or is SimpleName
          const foundKey = Object.keys(messageDefaults).find(k => k === simpleName || k.endsWith('.' + simpleName));
          if (foundKey) defaults = messageDefaults[foundKey];
        }

        if (defaults) {
          const defaultJson = JSON.stringify(defaults, null, 2);
          setSteps(prev => prev.map(step => ({ ...step, data: defaultJson })));
        }
      }
    }
  }, [selectedService, selectedMethod, services, messageDefaults]);

  // Handle service change to update methods defaults
  const handleServiceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const sName = e.target.value;
    setSelectedService(sName);
    const s = services.find(x => x.name === sName);
    if (s && s.methods.length > 0) {
      setSelectedMethod(s.methods[0].name);
    } else {
      setSelectedMethod('');
    }
  };

  const runTests = async () => {
    setIsRunning(true);
    setResults([]); // Clear previous results? Or append? Let's clear for new run session.

    for (let i = 0; i < steps.length; i++) {
      setCurrentStepIndex(i);
      const step = steps[i];

      try {
        // Parse data safely
        let requestData = {};
        try { requestData = JSON.parse(step.data); } catch (e) { }

        let metadataObj = {};
        if (metadataEnabled) {
          try { metadataObj = JSON.parse(metadata); } catch (e) { }
        }

        const response = await fetch('/api/ghz/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            protoContent,
            service: selectedService,
            method: selectedMethod,
            address: targetAddress,
            metadata: metadataEnabled ? metadataObj : null,
            config: {
              c: step.c,
              n: step.n,
              data: requestData
            }
          })
        });

        const result = await response.json();

        if (response.ok) {
          setResults(prev => [...prev, result]);
        } else {
          console.error("Step failed:", result);
          setResults(prev => [...prev, {
            date: new Date().toISOString(),
            // Add new fields
            latencyDistribution: [],
            histogram: [],
            errorDist: { [result.error || "API Error"]: 1 },
            // Add details from API if available
            details: result,
            total: 0, count: 0, average: 0, fastest: 0, slowest: 0, rps: 0, statusCodeDistribution: {}
          }]);
        }
      } catch (error) {
        console.error("Execution error:", error);
      }
    }

    setIsRunning(false);
    setCurrentStepIndex(null);
  };

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-8 font-sans selection:bg-purple-500/30">
      {/* Sunraku Logo - fixed top right */}
      <img
        src="/sunraku.png"
        alt="Sunraku"
        className="fixed top-4 right-4 w-14 h-14 rounded-full object-cover border-2 border-purple-500 shadow-lg shadow-purple-500/20 z-50"
      />

      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header */}
        <div className="text-center space-y-2 mb-12">
          <h1 className="text-5xl font-extrabold bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            GHZ Web Runner
          </h1>
          <p className="text-gray-400">Syncronous Load Testing & Visualization</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left Column: Proto & Service Selection */}
          <div className="lg:col-span-1 space-y-6">

            {/* Proto Input */}
            <div className="bg-gray-800/30 rounded-xl p-6 border border-gray-700/50 backdrop-blur-sm">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <FileCode className="w-5 h-5 text-blue-400" /> Proto Definition
                </h2>
                <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg text-xs flex items-center gap-2 border border-gray-700 transition-colors">
                  <Upload className="w-3 h-3" /> Import File
                  <input
                    type="file"
                    accept=".proto"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (ev) => setProtoContent(ev.target?.result as string);
                        reader.readAsText(file);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <textarea
                className="w-full h-64 bg-gray-900/50 border border-gray-700 rounded-lg p-3 text-xs font-mono text-gray-300 focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                placeholder="Paste your .proto content here or import a file..."
                value={protoContent}
                onChange={(e) => setProtoContent(e.target.value)}
              />
            </div>

            {/* Service Selector */}
            {services.length > 0 && (
              <div className="bg-gray-800/30 rounded-xl p-6 border border-gray-700/50 backdrop-blur-sm">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Server className="w-5 h-5 text-pink-400" /> Target
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Service</label>
                    <div className="relative">
                      <select
                        value={selectedService}
                        onChange={handleServiceChange}
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm appearance-none focus:ring-2 focus:ring-pink-500 outline-none"
                      >
                        {services.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                      </select>
                      <div className="absolute right-3 top-2.5 pointer-events-none text-gray-500">▼</div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Method</label>
                    <div className="relative">
                      <select
                        value={selectedMethod}
                        onChange={(e) => setSelectedMethod(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-sm appearance-none focus:ring-2 focus:ring-pink-500 outline-none"
                      >
                        {services.find(s => s.name === selectedService)?.methods.map(m => (
                          <option key={m.name} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                      <div className="absolute right-3 top-2.5 pointer-events-none text-gray-500">▼</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Configuration & Results */}
          <div className="lg:col-span-2 space-y-8">
            <ConfigurationPanel
              steps={steps}
              setSteps={setSteps}
              onRun={runTests}
              isRunning={isRunning}
              targetAddress={targetAddress}
              setTargetAddress={setTargetAddress}
              serviceMethod={`${selectedService}.${selectedMethod}`}
              selectedService={selectedService}
              selectedMethod={selectedMethod}
              metadata={metadata}
              setMetadata={setMetadata}
              metadataEnabled={metadataEnabled}
              setMetadataEnabled={setMetadataEnabled}
              hasValidProto={services.length > 0}
            />

            {/* Results Section */}
            <ResultsDisplay results={results} />

            {/* Loading State Overlay */}
            {isRunning && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
                <div className="bg-gray-900 p-8 rounded-2xl border border-gray-700 shadow-2xl max-w-md w-full text-center">
                  <div className="w-16 h-16 border-4 border-t-purple-500 border-gray-700 rounded-full animate-spin mx-auto mb-4"></div>
                  <h3 className="text-xl font-bold text-white mb-2">Running Load Test...</h3>
                  <p className="text-gray-400">Executing step {(currentStepIndex ?? 0) + 1} of {steps.length}</p>
                  <div className="mt-4 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 transition-all duration-500"
                      style={{ width: `${(((currentStepIndex ?? 0)) / steps.length) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
