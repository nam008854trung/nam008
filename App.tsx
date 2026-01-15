
import React, { useState, useCallback, useRef } from 'react';
import { TranslationStyle, SubtitleBlock, SystemLog, SUPPORTED_LANGUAGES } from './types';
import { translateBatch, scanGlossary } from './geminiService';

const App: React.FC = () => {
  const [targetLang, setTargetLang] = useState('Vietnamese');
  const [style, setStyle] = useState<TranslationStyle>(TranslationStyle.DEFAULT);
  const [model, setModel] = useState('gemini-3-flash-preview');
  const [batchSize, setBatchSize] = useState(20);
  const [autoGlossary, setAutoGlossary] = useState<string[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleBlock[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  
  const fullContentRef = useRef<string>("");
  const isStoppingRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const log = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date(),
      message,
      type
    }, ...prev].slice(0, 100));
  }, []);

  const resetAll = () => {
    if (confirm('Bạn có chắc chắn muốn xóa toàn bộ dữ liệu hiện tại?')) {
      setSubtitles([]);
      setLogs([]);
      setAutoGlossary([]);
      setProgress(0);
      setIsTranslating(false);
      fullContentRef.current = "";
      if (fileInputRef.current) fileInputRef.current.value = "";
      log('Hệ thống đã được làm mới.', 'info');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      fullContentRef.current = content;
      const blocks = parseSRT(content);
      setSubtitles(blocks);
      log(`Đã nạp file: ${file.name} (${blocks.length} dòng)`, 'success');

      setIsScanning(true);
      log('Đang quét thuật ngữ tự động...', 'info');
      try {
        const terms = await scanGlossary(content, style);
        setAutoGlossary(terms);
        log(`Tìm thấy ${terms.length} thuật ngữ quan trọng.`, 'success');
      } catch (err) {
        log(`Không thể quét thuật ngữ tự động.`, 'error');
      } finally {
        setIsScanning(false);
      }
    };
    reader.readAsText(file);
  };

  const parseSRT = (data: string): SubtitleBlock[] => {
    const blocks: SubtitleBlock[] = [];
    const rawBlocks = data.split(/\r?\n\r?\n/);
    rawBlocks.forEach((block) => {
      const lines = block.split(/\r?\n/).filter(l => l.trim() !== '');
      if (lines.length >= 3) {
        const id = parseInt(lines[0]);
        const timeRange = lines[1];
        const text = lines.slice(2).join(' ');
        if (!isNaN(id) && timeRange.includes('-->')) {
           blocks.push({ id, timeRange, text, status: 'pending' });
        }
      }
    });
    return blocks;
  };

  const translateSingleLine = async (index: number) => {
    if (isTranslating) return;
    const sub = subtitles[index];
    
    setSubtitles(prev => {
      const next = [...prev];
      next[index] = { ...next[index], status: 'processing' };
      return next;
    });

    try {
      const results = await translateBatch(
        [sub.text],
        targetLang,
        style,
        model,
        "",
        fullContentRef.current,
        autoGlossary
      );

      setSubtitles(prev => {
        const next = [...prev];
        next[index] = { 
          ...next[index], 
          translatedText: results[0] || "Lỗi", 
          status: results[0] ? 'done' : 'error' 
        };
        return next;
      });
      log(`Đã dịch lại dòng #${sub.id}`, 'success');
    } catch (err) {
      log(`Lỗi khi dịch lại dòng #${sub.id}`, 'error');
      setSubtitles(prev => {
        const next = [...prev];
        next[index] = { ...next[index], status: 'error' };
        return next;
      });
    }
  };

  const startTranslation = async () => {
    if (subtitles.length === 0 || isTranslating) return;
    setIsTranslating(true);
    isStoppingRef.current = false;
    log(`Bắt đầu dịch sang ${targetLang} (Tổng Hợp: ${style})...`, 'info');
    
    // Sử dụng batching thông minh để xử lý vô hạn dòng mà không làm treo UI
    const totalLines = subtitles.length;
    
    for (let i = 0; i < totalLines; i += batchSize) {
      if (isStoppingRef.current) break;
      
      const end = Math.min(i + batchSize, totalLines);
      const batchIndices = Array.from({ length: end - i }, (_, k) => i + k);
      const textsToTranslate = batchIndices.map(idx => subtitles[idx].text);
      
      log(`Đang xử lý block ${Math.floor(i/batchSize) + 1} - ${totalLines}...`, 'info');

      // Cập nhật trạng thái đang xử lý cho cụm hiện tại
      setSubtitles(prev => {
        const next = [...prev];
        batchIndices.forEach(idx => { next[idx].status = 'processing'; });
        return next;
      });

      try {
        const results = await translateBatch(
          textsToTranslate, 
          targetLang, 
          style, 
          model, 
          "", 
          fullContentRef.current, 
          autoGlossary
        );
        
        // Cập nhật kết quả dịch cho cụm
        setSubtitles(prev => {
          const next = [...prev];
          batchIndices.forEach((idx, rIdx) => {
            next[idx] = { 
              ...next[idx], 
              translatedText: results[rIdx] || "Lỗi tại cụm", 
              status: results[rIdx] ? 'done' : 'error' 
            };
          });
          return next;
        });
        
        setProgress(Math.round((end / totalLines) * 100));
      } catch (err) {
        log(`Lỗi tại cụm từ dòng ${i + 1}. Đang tự động bỏ qua để tiếp tục...`, 'error');
        setSubtitles(prev => {
          const next = [...prev];
          batchIndices.forEach(idx => { next[idx].status = 'error'; });
          return next;
        });
      }

      // Nghỉ ngắn để trình duyệt giải phóng bộ nhớ và cập nhật UI, cho phép dịch vô hạn mà không treo
      await new Promise(r => setTimeout(r, 150));
    }
    
    setIsTranslating(false);
    setProgress(100);
    log('Dịch hoàn tất!', 'success');
  };

  return (
    <div className="min-h-screen bg-[#060a13] text-[#94a3b8] p-4 flex flex-col gap-4 font-sans h-screen overflow-hidden">
      
      {/* Configuration Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
        <div className="bg-[#0f172a] border border-[#1e293b] rounded-md p-4 shadow-lg">
          <div className="flex items-center gap-2 mb-4 text-[12px] font-bold text-slate-100 uppercase tracking-wider">
            📥 TẢI TỆP NGUỒN
          </div>
          <div className="border-2 border-dashed border-[#1e293b] rounded-md h-24 flex flex-col items-center justify-center relative hover:bg-[#1e293b]/30 transition-all cursor-pointer group">
            <input type="file" ref={fileInputRef} accept=".srt" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
            <svg className="w-8 h-8 text-slate-600 group-hover:text-blue-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            <span className="text-[10px] text-slate-500 uppercase">Hỗ trợ vô hạn dòng</span>
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-md p-4 shadow-lg">
          <div className="flex items-center gap-2 mb-4 text-[12px] font-bold text-slate-100 uppercase tracking-wider">
            ⚙️ CẤU HÌNH DỊCH
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase">Thể loại</label>
              <select value={style} onChange={(e) => setStyle(e.target.value as TranslationStyle)} className="w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1 text-[12px] text-slate-200 outline-none">
                {Object.values(TranslationStyle).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase">Batch Size</label>
              <input type="number" value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} className="w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1 text-[12px] text-slate-200 outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase">Model AI</label>
              <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1 text-[12px] text-slate-200 outline-none">
                <option value="gemini-3-flash-preview">Flash (Nhanh & Vô hạn)</option>
                <option value="gemini-3-pro-preview">Pro (Chuẩn & Sâu)</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase">Ngôn ngữ</label>
              <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-[#1e293b] border border-[#334155] rounded px-2 py-1 text-[12px] text-slate-200 outline-none">
                {SUPPORTED_LANGUAGES.map(lang => <option key={lang.value} value={lang.value}>{lang.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-[#0f172a] border border-[#1e293b] rounded-md p-4 flex flex-col shadow-lg">
          <div className="text-[12px] font-bold text-slate-100 uppercase mb-3 tracking-wider flex items-center gap-2">
            🏷️ THUẬT NGỮ TỰ ĐỘNG
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-wrap gap-1.5 content-start bg-[#060a13] p-2 rounded border border-[#1e293b]">
            {isScanning ? <div className="text-[10px] text-cyan-500 animate-pulse font-bold p-2 w-full text-center">Đang học nội dung phim...</div> : 
              autoGlossary.length === 0 ? <div className="text-[10px] text-slate-700 w-full text-center p-2">Chưa có dữ liệu</div> :
              autoGlossary.map((term, i) => (
                <span key={i} className="px-2 py-0.5 bg-[#1e293b] border border-[#334155] rounded text-[10px] text-slate-300">{term}</span>
              ))
            }
          </div>
        </div>
      </div>

      {/* Main Panels */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        {/* Preview Panel */}
        <div className="lg:col-span-2 bg-[#0a0f1d] border border-[#1e293b] rounded flex flex-col overflow-hidden shadow-2xl">
          <div className="bg-[#111827] px-4 py-2 border-b border-[#1e293b] flex justify-between items-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></span>
              BẢN XEM TRƯỚC
            </span>
            {isTranslating && (
              <div className="flex items-center gap-3">
                <div className="w-48 bg-slate-800 h-1 rounded-full overflow-hidden">
                  <div className="bg-cyan-500 h-full transition-all duration-300" style={{width: `${progress}%`}}></div>
                </div>
                <span className="text-[10px] text-cyan-400 font-mono font-bold">{progress}%</span>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 bg-[#060a13]">
            {subtitles.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-10">
                <div className="text-4xl font-black mb-1">GAVIETSUB AI</div>
                <div className="text-[10px] tracking-[0.4em] font-bold uppercase">Dịch thuật vô hạn dòng v4.0</div>
              </div>
            ) : (
              subtitles.map((sub, idx) => (
                <div 
                  key={sub.id} 
                  onClick={() => !isTranslating && translateSingleLine(idx)}
                  className={`flex flex-col p-3 rounded border border-[#1e293b] bg-[#0f172a]/40 hover:bg-[#1e293b]/60 cursor-pointer transition-all ${sub.status === 'error' ? 'border-red-900/50 bg-red-900/10' : sub.status === 'processing' ? 'border-amber-900/30' : ''}`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] text-slate-600 font-mono">#{sub.id} | {sub.timeRange}</span>
                    {sub.status === 'processing' && <span className="text-[9px] text-amber-500 animate-pulse font-bold uppercase">Đang dịch...</span>}
                    {sub.status === 'done' && <span className="text-[8px] text-emerald-500/50 uppercase">Hoàn tất</span>}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="text-[12px] text-slate-500 leading-relaxed italic">{sub.text}</div>
                    <div className={`text-[13px] font-bold leading-relaxed ${sub.status === 'done' ? 'text-slate-100' : sub.status === 'error' ? 'text-red-500' : 'text-slate-800'}`}>
                      {sub.translatedText || (sub.status === 'error' ? 'Lỗi cụm - Nhấp để dịch lại' : '...')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* System Logs Panel */}
        <div className="bg-[#0a0f1d] border border-[#1e293b] rounded flex flex-col overflow-hidden">
          <div className="bg-[#111827] px-4 py-2 border-b border-[#1e293b] flex items-center gap-2">
            <span className="text-cyan-500 text-sm">🐚</span>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">NHẬT KÝ HỆ THỐNG</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 font-mono text-[11px] space-y-2 bg-[#060a13]/80">
            {logs.length === 0 && <div className="text-slate-700 italic">Hệ thống sẵn sàng...</div>}
            {logs.map(l => (
              <div key={l.id} className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                <span className="text-slate-600 shrink-0">[{l.timestamp.toLocaleTimeString([], {hour12:false})}]</span>
                <span className={l.type === 'error' ? 'text-red-500 font-bold' : l.type === 'success' ? 'text-cyan-400' : 'text-blue-500'}>{l.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <footer className="bg-[#0f172a] border border-[#1e293b] rounded-md p-3 flex items-center justify-between shrink-0 shadow-2xl">
        <div className="flex items-center gap-3">
          <button 
            onClick={startTranslation} 
            disabled={isTranslating || subtitles.length === 0} 
            className="bg-[#10b981] hover:bg-[#059669] text-white px-8 py-2.5 rounded text-[12px] font-bold uppercase transition-all shadow-lg active:scale-95 disabled:opacity-20 flex items-center gap-2"
          >
            <span className="text-sm">▶</span> BẮT ĐẦU DỊCH
          </button>
          <button 
            onClick={() => { isStoppingRef.current = true; setIsTranslating(false); }} 
            className="bg-[#334155] hover:bg-[#475569] text-slate-200 px-6 py-2.5 rounded text-[12px] font-bold uppercase transition-all flex items-center gap-2"
          >
            <span className="w-3 h-3 bg-slate-400 rounded-sm"></span> DỪNG
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={resetAll} className="bg-[#1e293b] hover:bg-red-900/10 border border-transparent hover:border-red-900/30 text-slate-400 hover:text-red-400 px-5 py-2.5 rounded text-[11px] font-bold uppercase transition-all flex items-center gap-2">
            <span>🗑️</span> XÓA HẾT
          </button>
          <button 
            onClick={() => {
              const content = subtitles.map(s => `${s.id}\n${s.timeRange}\n${s.translatedText || s.text}\n`).join('\n');
              const blob = new Blob([content], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = `[GAVIETSUB]_${targetLang}.srt`; a.click();
            }} 
            disabled={subtitles.filter(s => s.translatedText).length === 0} 
            className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white px-8 py-2.5 rounded text-[12px] font-bold uppercase shadow-lg transition-all disabled:opacity-20 active:scale-95 flex items-center gap-2"
          >
            <span>💾</span> LƯU FILE (.SRT)
          </button>
        </div>
      </footer>
    </div>
  );
};

export default App;
