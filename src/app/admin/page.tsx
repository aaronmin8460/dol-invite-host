// src/app/admin/page.tsx
'use client';

import { upload } from '@vercel/blob/client';
import JSZip from 'jszip';
import { useRef, useState } from 'react';

export default function AdminPage() {
  const zipRef = useRef<HTMLInputElement>(null);
  const [id, setId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [useServer, setUseServer] = useState<boolean>(true); // 느린망/보안망 권장 (기본 ON)
  const lastProgressAtRef = useRef<number>(0);

  const SERVER_LIMIT = 4_500_000; // ≈4.5MB: 이보다 크면 ZIP 통째 업로드 대신 파일별 업로드

  // ───────────────── ID 생성
  async function genId() {
    try {
      setStatus('ID 생성 중...');
      const res = await fetch('/api/invites/new-id', { cache: 'no-store' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        setStatus(`ID 생성 실패: ${res.status} ${text}`);
        return;
      }
      const data = (await res.json()) as { id?: string | number };
      if (!data?.id) {
        setStatus('ID 생성 실패: 응답 형식 오류');
        return;
      }
      setId(String(data.id));
      setStatus(`ID 생성 완료: ${data.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`ID 생성 에러: ${msg}`);
    }
  }

  // ZIP에서 파일명으로 찾기(하위폴더 허용)
  function pick(zip: JSZip, target: string): JSZip.JSZipObject | null {
    let picked: JSZip.JSZipObject | null = null;
    zip.forEach((path, file) => {
      const base = path.split('/').pop();
      if (!file.dir && base === target) picked = file as JSZip.JSZipObject;
    });
    return picked;
  }

  // ──────────────── 자가진단: 클라이언트 직접 업로드 가능 여부
  async function probeClientUpload() {
    try {
      setStatus('연결 테스트: 직접 업로드 중…');
      const blob = new Blob(['hello'], { type: 'text/plain' });
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 15000);
      lastProgressAtRef.current = Date.now();

      await upload(`i/probe-${Date.now()}/probe.txt`, blob, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload',
        abortSignal: ac.signal,
        onUploadProgress: (ev) => {
          lastProgressAtRef.current = Date.now();
          setProgress(Math.round(ev.percentage));
        },
      });

      clearTimeout(timer);
      setStatus('직접 업로드 OK');
      alert('직접 업로드 성공! 이 환경에서는 클라이언트 업로드가 허용됩니다.');
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      setStatus('직접 업로드 실패');
      alert(['직접 업로드 실패 (차단/지연 가능).', `원인: ${msg}`, '', '※ "서버로 업로드(권장)" 옵션을 사용하세요.'].join('\n'));
    }
  }

  // ──────────────── 업로드 & 배포
  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const zipFile = zipRef.current?.files?.[0];
    if (!zipFile) return alert('ZIP 파일을 선택하세요.');
    if (!/^[0-9]{6,10}$/.test(id)) return alert('먼저 ID를 생성하세요.');

    setProgress(0);
    setStatus('ZIP 해석 중...');
    const zip = await JSZip.loadAsync(zipFile);

    // 기대 파일 후보 (JPG/PNG 모두 허용)
    const candidates = [
      ['index.html'],
      ['merged.jpg', 'merged.jpeg', 'merged.png'],
      ['thumb_1200x630.jpg', 'thumb_1200x630.jpeg'],
    ] as const;

    const chosen: string[] = [];
    for (const group of candidates) {
      const name = group.find((n) => !!pick(zip, n));
      if (!name) {
        alert(`ZIP 안에 ${group.join(' 또는 ')} 파일이 없습니다.`);
        return;
      }
      chosen.push(name);
    }

    // 1) 서버 업로드(권장)
    if (useServer) {
      try {
        // ZIP이 작으면 통째 업로드
        if (zipFile.size <= SERVER_LIMIT) {
          setStatus('서버로 업로드 중…');
          const fd = new FormData();
          fd.append('id', id);
          fd.append('zip', zipFile);
          const r = await fetch('/api/upload-zip', { method: 'POST', body: fd, cache: 'no-store' });
          const text = await r.text();
          let j: { ok?: boolean; error?: string } = {};
          try { j = JSON.parse(text); } catch {}
          if (!r.ok || !j?.ok) throw new Error(j?.error ?? `HTTP ${r.status} ${text}`);
        } else {
          // ZIP이 크면 파일별 업로드로 자동 전환
          setStatus('서버로 업로드 중… (대용량: 파일별 업로드)');
          for (const name of chosen) {
            const file = pick(zip, name)!;
            const blob = await file.async('blob');
            if (blob.size > SERVER_LIMIT) {
              throw new Error(`${name} 파일이 너무 큽니다 (${(blob.size/1_000_000).toFixed(1)}MB). 
빌더에서 merged를 JPG(품질 0.85~0.9), 폭 ≤2000px로 저장하거나, 체크 해제하여 "직접 업로드"를 사용하세요.`);
            }
            const fd = new FormData();
            fd.append('id', id);
            fd.append('name', name);
            fd.append('file', new File([blob], name, { type: blob.type || 'application/octet-stream' }));
            const r = await fetch('/api/upload-one', { method: 'POST', body: fd, cache: 'no-store' });
            const txt = await r.text();
            let j: { ok?: boolean; error?: string } = {};
            try { j = JSON.parse(txt); } catch {}
            if (!r.ok || !j?.ok) throw new Error(j?.error ?? `HTTP ${r.status} ${txt}`);
          }
        }

        setStatus('완료! 새 창을 여는 중…');
        window.open(`/i/${id}/`, '_blank');
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus('서버 업로드 실패: ' + msg);
        alert('서버 업로드 실패. 잠시 후 다시 시도하거나, "직접 업로드"로 전환해 보세요.');
        return;
      }
    }

    // 2) 직접 업로드 (빠름, 단 일부 환경에서 차단 가능)
    try {
      setStatus('업로드 중(직접)…');
      const ac = new AbortController();
      lastProgressAtRef.current = Date.now();
      const watchdog = setInterval(() => {
        if (Date.now() - lastProgressAtRef.current > 20000) {
          ac.abort();
          clearInterval(watchdog);
        }
      }, 5000);

      for (const name of chosen) {
        const file = pick(zip, name)!;
        const blob = await file.async('blob');
        await upload(`i/${id}/${name}`, blob, {
          access: 'public',
          handleUploadUrl: '/api/blob/upload',
          onUploadProgress: (ev) => {
            lastProgressAtRef.current = Date.now();
            const pct = Math.round(ev.percentage);
            setProgress(pct);
            setStatus(`업로드 중: ${name} ${pct}%`);
          },
          abortSignal: ac.signal,
        });
      }
      clearInterval(watchdog);

      setStatus('완료! 새 창을 여는 중…');
      window.open(`/i/${id}/`, '_blank');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus('직접 업로드 실패: ' + msg);
      alert('직접 업로드가 차단/지연되는 것으로 보입니다. "서버로 업로드(권장)" 옵션을 사용해 주세요.');
    }
  }

  // ──────────────── UI
  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <h1>배포용: 초대장 ZIP 업로드</h1>
      <p>
        <code>/i/[숫자ID]/</code> 경로로 공개됩니다. 예: <code>/i/1234567/</code>
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0' }}>
        <button type="button" onClick={genId}>ID 생성</button>
        <input value={id} readOnly style={{ width: 160 }} placeholder="ID 미생성" />
        <button type="button" onClick={probeClientUpload}>연결 테스트(직접 업로드)</button>
      </div>

      <form onSubmit={handleUpload} style={{ display: 'grid', gap: 12 }}>
        <label>Invite ZIP <input ref={zipRef} type="file" accept=".zip" required /></label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={useServer} onChange={(e) => setUseServer(e.target.checked)} />
          서버로 업로드(느린망/보안망 권장)
        </label>
        <button type="submit">업로드 & 배포</button>
      </form>

      <div style={{ marginTop: 12, color: '#555' }}>
        {status} {progress ? `(${progress}%)` : ''}
      </div>
    </main>
  );
}
