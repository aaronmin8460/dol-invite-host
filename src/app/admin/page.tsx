'use client';

import { upload } from '@vercel/blob/client';
import JSZip from 'jszip';
import { useRef, useState } from 'react';

export default function AdminPage() {
  const zipRef = useRef<HTMLInputElement>(null);
  const [id, setId] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);

  async function genId() {
    try {
      setStatus('ID 생성 중...');
      const res = await fetch('/api/invites/new-id', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || !data?.id) throw new Error(JSON.stringify(data));
      setId(String(data.id));
      setStatus(`ID 생성 완료: ${data.id}`);
    } catch (e) {
      setStatus('ID 생성 실패. 새로고침 후 다시 시도해 주세요.');
    }
  }

  // ZIP에서 이름으로 파일 찾기(하위폴더 허용)
  function pick(zip: JSZip, target: string): JSZip.JSZipObject | null {
    let picked: JSZip.JSZipObject | null = null;
    zip.forEach((path, file) => {
      const base = path.split('/').pop();
      if (!file.dir && base === target) picked = file as JSZip.JSZipObject;
    });
    return picked;
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const zipFile = zipRef.current?.files?.[0];
    if (!zipFile) return alert('ZIP 파일을 선택하세요.');
    if (!/^[0-9]{6,10}$/.test(id)) return alert('먼저 ID를 생성하세요.');

    setProgress(0);
    setStatus('ZIP 분석 중...');
    const zip = await JSZip.loadAsync(zipFile);

    const expected = ['index.html', 'merged.png', 'thumb_1200x630.jpg'] as const;
    for (const name of expected) if (!pick(zip, name)) {
      alert(`${name}이(가) ZIP 안에 없습니다.`); return;
    }

    // 1) 클라이언트 → Blob 직업로드 (진행률/타임아웃)
    try {
      setStatus('업로드 중 (직접 업로드)…');
      const ac = new AbortController();
      let lastPct = 0;
      const watchdog = setInterval(() => {
        // 20초 동안 진행률이 안 바뀌면 폴백으로 전환
        if (lastPct === progress) {
          ac.abort();
        }
        lastPct = progress;
      }, 20000);

      for (const name of expected) {
        const file = pick(zip, name)!;
        const blob = await (file as JSZip.JSZipObject).async('blob');
        await upload(`i/${id}/${name}`, blob, {
          access: 'public',
          handleUploadUrl: '/api/blob/upload',
          onUploadProgress: (ev) => {
            setProgress(Math.round(ev.percentage));
            setStatus(`업로드 중: ${name} ${Math.round(ev.percentage)}%`);
          },
          // @vercel/blob/client는 abortSignal을 지원
          abortSignal: ac.signal as any,
        });
      }
      clearInterval(watchdog);

      setStatus('완료! 새 창을 여는 중…');
      window.open(`/i/${id}/`, '_blank');
      return;
    } catch {
      // 무시하고 폴백 진행
    }

    // 2) 폴백: ZIP 그대로 서버에 보내서 서버가 업로드
    try {
      setStatus('네트워크 문제로 서버 폴백 업로드 중…');
      const fd = new FormData();
      fd.append('id', id);
      fd.append('zip', zipFile);
      const r = await fetch('/api/upload-zip', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(JSON.stringify(j));
      setStatus('완료! 새 창을 여는 중…');
      window.open(`/i/${id}/`, '_blank');
    } catch (e) {
      setStatus('업로드 실패: 보안 프로그램/네트워크 차단 가능. 다른 브라우저나 네트워크에서 다시 시도해 주세요.');
    }
  }

  return (
    <main style={{maxWidth: 720, margin: '40px auto', padding: 16}}>
      <h1>배포용: 초대장 ZIP 업로드</h1>
      <p><code>/i/[숫자ID]/</code> 경로로 공개됩니다.</p>

      <div style={{display:'flex', gap:8, alignItems:'center', margin:'12px 0'}}>
        <button type="button" onClick={genId}>ID 생성</button>
        <input value={id} readOnly style={{width:160}} placeholder="ID 미생성" />
      </div>

      <form onSubmit={handleUpload} style={{display:'grid', gap:12}}>
        <label>Invite ZIP <input ref={zipRef} type="file" accept=".zip" required /></label>
        <button type="submit">업로드 & 배포</button>
      </form>

      <div style={{marginTop:12, color:'#555'}}>
        {status} {progress ? `(${progress}%)` : ''}
      </div>
    </main>
  );
}
