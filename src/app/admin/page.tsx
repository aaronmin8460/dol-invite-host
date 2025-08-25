'use client';

import { upload } from '@vercel/blob/client';
import JSZip from 'jszip';
import { useRef, useState } from 'react';

export default function AdminPage() {
  const zipRef = useRef<HTMLInputElement>(null);
  const [id, setId] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState<number>(0);
  const [useServer, setUseServer] = useState<boolean>(true); // 느린망/차단망 권장(기본 ON)

  // ──────────────────────────────────────────────────────────────
  // ID 생성
  async function genId() {
    try {
      setStatus('ID 생성 중...');
      const res = await fetch('/api/invites/new-id', { cache: 'no-store' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        setStatus(`ID 생성 실패: ${res.status} ${text}`);
        return;
      }
      const data = await res.json();
      if (!data?.id) {
        setStatus('ID 생성 실패: 응답 형식 오류');
        return;
      }
      setId(String(data.id));
      setStatus(`ID 생성 완료: ${data.id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`ID 생성 에러: ${msg}`);
    }
  }

  // ZIP에서 파일 이름만으로 찾기(하위폴더 허용)
  function pick(zip: JSZip, target: string): JSZip.JSZipObject | null {
    let picked: JSZip.JSZipObject | null = null;
    zip.forEach((path, file) => {
      const base = path.split('/').pop();
      if (!file.dir && base === target) picked = file as JSZip.JSZipObject;
    });
    return picked;
  }

  // 아주 작은 파일로 클라이언트 직업로드 가능 여부 자가진단
  async function probeClientUpload() {
    try {
      setStatus('연결 테스트: 직접 업로드 중…');
      const blob = new Blob(['hello'], { type: 'text/plain' });
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 15000); // 15초 타임아웃
      await upload(`i/probe-${Date.now()}/probe.txt`, blob, {
        access: 'public',
        handleUploadUrl: '/api/blob/upload',
        abortSignal: ac.signal as any,
        onUploadProgress: (ev) => setProgress(Math.round(ev.percentage)),
      });
      clearTimeout(timer);
      setStatus('직접 업로드 OK');
      alert('직접 업로드 성공! 이 환경에서는 클라이언트 업로드가 허용됩니다.');
    } catch (e) {
      const msg = e instanceof Error ? e.name + ': ' + e.message : String(e);
      setStatus('직접 업로드 실패');
      alert([
        '직접 업로드 실패 (차단/지연 가능성).',
        '원인:',
        msg,
        '',
        '※ "서버로 업로드(권장)" 옵션을 사용하면 문제없이 진행됩니다.',
      ].join('\n'));
    }
  }

  // 업로드 & 배포
  async function handleUpload(e: React.FormEvent) {
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

    // 1) 서버 폴백 업로드(권장) — 느린망/보안망에서도 안정적
    if (useServer) {
      try {
        setStatus('서버로 업로드 중…');
        const fd = new FormData();
        fd.append('id', id);
        fd.append('zip', zipFile);
        const r = await fetch('/api/upload-zip', { method: 'POST', body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.ok) throw new Error(JSON.stringify(j));
        setStatus('완료! 새 창을 여는 중…');
        window.open(`/i/${id}/`, '_blank');
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setStatus('서버 업로드 실패: ' + msg);
        alert('서버 업로드 실패. 잠시 후 다시 시도하거나 다른 네트워크/브라우저를 사용해 주세요.');
        return;
      }
    }

    // 2) 클라이언트 → Blob 직접 업로드 (빠름, 단 일부 환경에서 차단됨)
    try {
      setStatus('업로드 중(직접)…');
      const ac = new AbortController();
      let lastPct = 0;
      const watchdog = setInterval(() => {
        // 20초 동안 진행률이 안 바뀌면 타임아웃 처리
        if (lastPct === progress) ac.abort();
        lastPct = progress;
      }, 20000);

      for (const name of chosen) {
        const file = pick(zip, name)!;
        const blob = await file.async('blob');
        await upload(`i/${id}/${name}`, blob, {
          access: 'public',
          handleUploadUrl: '/api/blob/upload',
          onUploadProgress: (ev) => {
            const pct = Math.round(ev.percentage);
            setProgress(pct);
            setStatus(`업로드 중: ${name} ${pct}%`);
          },
          abortSignal: ac.signal as any,
        });
      }
      clearInterval(watchdog);

      setStatus('완료! 새 창을 여는 중…');
      window.open(`/i/${id}/`, '_blank');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus('직접 업로드 실패: ' + msg);
      alert('직접 업로드가 이 환경에서 차단/지연되는 것으로 보입니다. "서버로 업로드(권장)" 옵션을 사용해 주세요.');
    }
  }

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
          <input
            type="checkbox"
            checked={useServer}
            onChange={(e) => setUseServer(e.target.checked)}
          />
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
