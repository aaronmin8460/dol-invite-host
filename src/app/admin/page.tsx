'use client';

import { upload } from '@vercel/blob/client';
import JSZip from 'jszip';
import { useRef, useState } from 'react';

export default function AdminPage() {
  const zipRef = useRef<HTMLInputElement>(null);
  const [id, setId] = useState<string>('');
  const [status, setStatus] = useState<string>('');

// src/app/admin/page.tsx 내
async function genId() {
  try {
    setStatus('ID 생성 중...');
    const res = await fetch('/api/invites/new-id', { cache: 'no-store' });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      setStatus(`ID 생성 실패: ${res.status} ${text}`);
      return; // ← 실패면 여기서 끝
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


  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const zipFile = zipRef.current?.files?.[0];
    if (!zipFile) return alert('ZIP 파일을 선택하세요.');
    if (!/^[0-9]{6,10}$/.test(id)) return alert('먼저 ID를 생성하세요.');

    setStatus('ZIP 해석 중...');
    const zip = await JSZip.loadAsync(zipFile);

    const expected = ['index.html', 'merged.png', 'thumb_1200x630.jpg'] as const;
    for (const name of expected) if (!zip.file(name)) return alert(`${name}이 ZIP에 없습니다.`);

    setStatus('업로드 중...');
    for (const name of expected) {
      const file = zip.file(name)!;
      const content = await file.async('blob');
      await upload(`i/${id}/${name}`, content, {
       access: 'public',
  handleUploadUrl: '/api/blob/upload',
  contentType:
    name.endsWith('.html') ? 'text/html' :
    name.endsWith('.png') ? 'image/png' :
    'image/jpeg',
      });
    }

    setStatus('완료!');
    const url = `/i/${id}/`;
    alert(`배포 완료: ${url}`);
    window.open(url, '_blank');
  }

  return (
    <main style={{maxWidth: 720, margin: '40px auto', padding: 16}}>
      <h1>배포용: 초대장 ZIP 업로드</h1>
      <p><code>/i/[숫자ID]/</code> 경로로 공개됩니다. 예: <code>/i/1234567/</code></p>
      <div style={{display:'flex', gap:8, alignItems:'center', margin:'12px 0'}}>
        <button onClick={genId}>ID 생성</button>
        <input value={id} readOnly style={{width:160}} placeholder="ID 미생성" />
      </div>
      <form onSubmit={handleUpload} style={{display:'grid', gap:12}}>
        <label>Invite ZIP <input ref={zipRef} type="file" accept=".zip" required /></label>
        <button type="submit">업로드 & 배포</button>
      </form>
      <div style={{marginTop:12, color:'#555'}}>{status}</div>
    </main>
  );
}
