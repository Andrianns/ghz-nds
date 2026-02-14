import React from 'react';
import { Download, Activity, CheckCircle, XCircle, Clock } from 'lucide-react';
import html2canvas from 'html2canvas';

interface ResultData {
  date: string;
  duration: number; // Duration in ns (from 'total' field in ghz)
  total: number; // This is actually duration in ns in ghz output!
  count: number; // This is the total number of requests
  average: number;
  fastest: number;
  slowest: number;
  rps: number;
  errorDist: { [key: string]: number };
  statusCodeDistribution: { [key: string]: number };
  latencyDistribution: { percentage: number; latency: number }[];
  histogram: { mark: number; count: number; frequency: number }[];
  details: any[]; // ghz details
}

interface ResultsProps {
  results: ResultData[];
}

export const ResultsDisplay: React.FC<ResultsProps> = ({ results }) => {
  const exportImage = async (id: string) => {
    try {
      const element = document.getElementById(id);
      if (element) {
        const canvas = await html2canvas(element, {
          backgroundColor: '#1e1e1e', // Ensure background color is captured
          useCORS: true // Handle any potential CORS issues with icons?
        });
        const data = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = data;
        link.download = `ghz-result-${id}.png`;
        link.click();
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export image. See console for details.");
    }
  };

  if (results.length === 0) return null;

  return (
    <div className="space-y-8 mt-8">
      <h2 className="text-2xl font-bold text-[#f3f4f6] flex items-center gap-2">
        <Activity className="w-6 h-6 text-[#4ade80]" /> Test Results
      </h2>

      <div className="grid grid-cols-1 gap-6 items-start">
        {results.map((res, idx) => (
          <div
            key={idx}
            id={`result-card-${idx}`}
            className="bg-[#1e1e1e] rounded-md p-6 border border-[#374151] font-mono text-sm text-[#d1d5db] shadow-xl overflow-hidden"
          >
            <div className="flex justify-between items-start mb-4 border-b border-[#374151] pb-4">
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Run #{idx + 1}</h3>
                <p className="text-xs text-[#6b7280]">{new Date(res.date).toLocaleString()}</p>
              </div>
              <button
                onClick={() => exportImage(`result-card-${idx}`)}
                className="p-2 hover:bg-[#374151] rounded transition-colors text-[#9ca3af] hover:text-white"
                title="Export as Image"
              >
                <Download className="w-5 h-5" />
              </button>
            </div>

            {/* Summary Section */}
            <div className="mb-1">
              <h4 className="text-[#ffffff] font-bold mb-2">Summary:</h4>
              <div className="grid grid-cols-[max-content_1fr] gap-x-8 gap-y-1 pl-4">
                <div>Count:</div>
                <div>{res.count || 0}</div>

                <div>Total:</div>
                <div>{(res.total / 1000000).toFixed(2)} ms</div>

                <div>Slowest:</div>
                <div>{(res.slowest / 1000000).toFixed(2)} ms</div>

                <div>Fastest:</div>
                <div>{(res.fastest / 1000000).toFixed(2)} ms</div>

                <div>Average:</div>
                <div>{(res.average / 1000000).toFixed(2)} ms</div>

                <div>Requests/sec:</div>
                <div>{res.rps?.toFixed(2) || "0.00"}</div>
              </div>
              <br />

              {/* Histogram Section */}
              {res.histogram && res.histogram.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-[#ffffff] font-bold mb-2">Response time histogram:</h4>
                  <div className="space-y-1">
                    {res.histogram.map((h, i) => {
                      // Calculate width relative to max count for visualization
                      const maxCount = Math.max(...res.histogram.map(hi => hi.count));
                      const widthShare = maxCount > 0 ? (h.count / maxCount) * 40 : 0; // max 40 chars like terminal
                      const bar = "∎".repeat(Math.ceil(widthShare));

                      return (
                        <div key={i} className="flex gap-1 whitespace-pre">
                          <div className="w-[60px] text-right">{(h.mark * 1000).toFixed(3)}</div>
                          <div className="w-[45px] text-right">[{h.count}]</div>
                          <div className="text-[#60a5fa]">|{bar}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Latency Distribution */}
              {res.latencyDistribution && res.latencyDistribution.length > 0 && (
                <div className="mb-4">
                  <h4 className="text-[#ffffff] font-bold mb-2">Latency distribution:</h4>
                  <div className="space-y-1">
                    {res.latencyDistribution.map((l, i) => (
                      <div key={i} className="flex gap-4">
                        <div className="w-[50px] text-right">{l.percentage} %</div>
                        <div>in {(l.latency / 1000000).toFixed(2)} ms</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Status Code Distribution */}
              <div className="mb-1">
                <h4 className="text-[#ffffff] font-bold mb-2">Status code distribution:</h4>
                {/* Combine statusCodeDistribution and errorDist if needed */}
                <div className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 pl-4">
                  {res.statusCodeDistribution && Object.entries(res.statusCodeDistribution).map(([code, count]) => (
                    <React.Fragment key={code}>
                      <div className="text-left">[{code}]</div>
                      <div>{count} responses</div>
                    </React.Fragment>
                  ))}
                  {/* Fallback to errorDist if statusCodeDistribution is empty */}
                  {(!res.statusCodeDistribution || Object.keys(res.statusCodeDistribution).length === 0) && res.errorDist && Object.entries(res.errorDist).map(([err, count]) => (
                    <React.Fragment key={err}>
                      <div className="text-left text-[#f87171]">[{err}]</div>
                      <div className="text-[#f87171]">{count} responses</div>
                    </React.Fragment>
                  ))}
                </div>
              </div>

            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

